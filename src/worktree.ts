/**
 * worktree.ts — Create or find a git worktree for a branch and open it.
 *
 * Split into two phases:
 *
 * Phase 1 (original window — silent, no notifications):
 *   1. Check if a worktree for this branch already exists
 *   2. If new: create an empty worktree via `git worktree add --no-checkout --detach`
 *   3. Ensure .gitignore entry for worktree dir
 *   4. Write a state file with branch info into the worktree folder
 *   5. Open the worktree folder in a new editor window
 *
 * Phase 2 (new window — all user-visible work happens here):
 *   1. Read and consume the state file
 *   2. Fetch origin
 *   3. For new worktrees: checkout the branch (populates files)
 *   4. For existing worktrees: hard reset to origin + clean
 *   5. Run post-checkout hook
 *   6. Focus PR sidebar
 */

import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";
import * as fs from "fs/promises";
import type { Repository } from "./git-api";
import { resolveHome } from "./utils";
import { log } from "./extension";

// ─── State file ──────────────────────────────────────────────────────────────

const STATE_FILE = ".checkout-worktree-state.json";

export interface WorktreeState {
  ref: string;
  isNew: boolean;
  focusPR: boolean;
}

async function writeStateFile(worktreePath: string, state: WorktreeState): Promise<void> {
  const filePath = path.join(worktreePath, STATE_FILE);
  try {
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
    log(`[state] wrote ${filePath}`);
  } catch (err) {
    log(`[state] write failed (non-fatal): ${err}`);
  }
}

/**
 * Read and delete the state file from the workspace root.
 * Returns null if no state file exists.
 */
export async function consumeStateFile(workspaceRoot: string): Promise<WorktreeState | null> {
  const filePath = path.join(workspaceRoot, STATE_FILE);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    await fs.unlink(filePath);
    return JSON.parse(content) as WorktreeState;
  } catch {
    return null;
  }
}

// ─── Phase 1: Original window (silent) ──────────────────────────────────────

/**
 * Called from the URI handler in the original window.
 * Creates worktree folder if needed, writes state, opens new window. Silent.
 */
export async function prepareAndOpenWorktree(
  repo: Repository,
  ref: string
): Promise<void> {
  const repoRoot = repo.rootUri.fsPath;

  // Check for existing worktree matching this ref
  const existingPath = findExistingWorktree(repoRoot, ref);
  if (existingPath) {
    log(`[phase1] existing worktree found at ${existingPath}`);
    await writeStateFile(existingPath, { ref, isNew: false, focusPR: true });
    await openFolder(existingPath);
    return;
  }

  // Determine worktree path
  const worktreeDir = getWorktreeParentDir(repo);
  const safeBranch = ref.replace(/\//g, "-");
  const worktreePath = path.join(worktreeDir, safeBranch);

  // Ensure .worktrees is in .gitignore
  await ensureGitignored(repoRoot, worktreeDir);

  // Create empty worktree — no fetch needed, --detach + --no-checkout
  // This just creates the folder + git linkage, no files populated
  const cmd = `git worktree add --no-checkout --detach ${JSON.stringify(worktreePath)}`;
  log(`[phase1] cmd: ${cmd}`);
  log(`[phase1] cwd: ${repoRoot}`);

  await new Promise<void>((resolve, reject) => {
    cp.exec(cmd, { cwd: repoRoot, timeout: 30000 }, (err, stdout, stderr) => {
      log(`[phase1] stdout: ${stdout}`);
      log(`[phase1] stderr: ${stderr}`);
      if (err) {
        reject(new Error(`git worktree add failed: ${err.message}`));
      } else {
        resolve();
      }
    });
  });

  // Verify the worktree directory exists
  try {
    const stat = await fs.stat(worktreePath);
    log(`[phase1] worktree created: isDir=${stat.isDirectory()}`);
  } catch {
    throw new Error(`Worktree directory not found after creation: ${worktreePath}`);
  }

  await writeStateFile(worktreePath, { ref, isNew: true, focusPR: true });
  await openFolder(worktreePath);
  log(`[phase1] done — new window opening`);
}

// ─── Phase 2: New window (all user-visible work) ────────────────────────────

/**
 * Called from extension.activate() in the new window.
 * Reads state file, fetches, checks out / resets, runs hook, focuses PR.
 */
export async function resumeWorktreeSetup(
  workspaceRoot: string,
  state: WorktreeState
): Promise<void> {
  const { ref, isNew } = state;

  // Fetch origin to get latest refs
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Fetching origin…` },
    () =>
      gitExec(workspaceRoot, `git fetch origin ${ref}`)
  );

  if (isNew) {
    // New worktree: create local branch tracking origin and checkout
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Checking out ${ref}…` },
      () =>
        gitExec(workspaceRoot, `git checkout -b ${ref} origin/${ref}`)
    );
  } else {
    // Existing worktree: hard reset to latest origin
    if (!PROTECTED_BRANCHES.has(ref)) {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Resetting to origin/${ref}…` },
        () =>
          gitExec(workspaceRoot, `git reset --hard origin/${ref} && git clean -fd`)
      );
    }
  }

  // Run post-checkout hook
  await runPostCheckoutHook(workspaceRoot);

  // Focus PR sidebar after a delay (let GH PR extension discover the repo)
  if (state.focusPR) {
    setTimeout(async () => {
      try {
        await vscode.commands.executeCommand("pr:github.focus");
        log(`[phase2] focused PR view`);
      } catch (err) {
        log(`[phase2] pr:github.focus failed (non-fatal): ${err}`);
      }
    }, 3000);
  }

  vscode.window.showInformationMessage(
    `Worktree ready: ${ref}`
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function gitExec(cwd: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(command, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      log(`[git] ${command}`);
      if (stdout.trim()) { log(`[git] stdout: ${stdout.trim()}`); }
      if (stderr.trim()) { log(`[git] stderr: ${stderr.trim()}`); }
      if (err) {
        reject(new Error(`${command} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function findExistingWorktree(repoRoot: string, ref: string): string | undefined {
  try {
    const output = cp.execSync("git worktree list --porcelain", {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 5000,
    });

    let currentPath: string | undefined;
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        currentPath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        const branch = line.slice("branch refs/heads/".length);
        if (branch === ref && currentPath) {
          return currentPath;
        }
      } else if (line === "") {
        currentPath = undefined;
      }
    }
  } catch {
    // git worktree list failed — fall through
  }
  return undefined;
}

function getWorktreeParentDir(repo: Repository): string {
  const config = vscode.workspace.getConfiguration("checkout-worktree");
  const configured = config.get<string>("worktreeParentDir", "");

  if (configured) {
    const resolved = resolveHome(configured);
    if (!path.isAbsolute(resolved)) {
      return path.resolve(repo.rootUri.fsPath, resolved);
    }
    return resolved;
  }

  return path.join(repo.rootUri.fsPath, ".worktrees");
}

async function ensureGitignored(repoRoot: string, worktreeDir: string): Promise<void> {
  const relative = path.relative(repoRoot, worktreeDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return;
  }

  const entry = `/${relative}/`;
  const gitignorePath = path.join(repoRoot, ".gitignore");

  let content = "";
  try {
    content = await fs.readFile(gitignorePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  const lines = content.split("\n");
  const alreadyIgnored = lines.some(
    (line) => line.trim() === entry || line.trim() === relative || line.trim() === `${relative}/`
  );

  if (alreadyIgnored) {
    return;
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await fs.writeFile(gitignorePath, `${content}${separator}${entry}\n`, "utf-8");
}

async function runPostCheckoutHook(worktreePath: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("checkout-worktree");
  const command = config.get<string>("postCheckoutCommand", "");

  if (!command) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running post-checkout: ${command}`,
      cancellable: false,
    },
    () =>
      new Promise<void>((resolve, reject) => {
        cp.exec(command, { cwd: worktreePath }, (err, stdout, stderr) => {
          if (err) {
            const output = stderr || stdout || err.message;
            reject(new Error(`Post-checkout hook failed: ${output}`));
          } else {
            if (stdout.trim()) {
              vscode.window.showInformationMessage(
                `Post-checkout: ${stdout.trim().split("\n").pop()}`
              );
            }
            resolve();
          }
        });
      })
  );
}

const PROTECTED_BRANCHES = new Set(["main", "master"]);

async function openFolder(folderPath: string): Promise<void> {
  const appName = vscode.env.appName.toLowerCase();
  let cli: string;
  if (appName.includes("cursor")) {
    cli = "cursor";
  } else if (appName.includes("insiders")) {
    cli = "code-insiders";
  } else if (appName.includes("windsurf")) {
    cli = "windsurf";
  } else {
    cli = "code";
  }

  log(`[open] spawning: ${cli} --new-window ${folderPath}`);

  const child = cp.spawn(cli, ["--new-window", folderPath], {
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();
  log(`[open] spawned pid=${child.pid}`);
}
