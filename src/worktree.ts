/**
 * worktree.ts — Create or find a git worktree for a branch and open it.
 *
 * Flow:
 * 1. Fetch origin to ensure the branch ref exists locally
 * 2. Check if a worktree for this ref already exists
 * 3. If not, create one via the git API
 * 4. Open the worktree folder in VS Code
 */

import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";
import * as fs from "fs/promises";
import type { Repository } from "./git-api";
import { resolveHome } from "./utils";
import { log } from "./extension";

/**
 * Ensure a worktree exists for the given ref (branch name) and open it.
 */
export async function checkoutWorktree(
  repo: Repository,
  ref: string
): Promise<void> {
  // Fetch to make sure we have the latest refs
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Fetching origin…` },
    () => repo.fetch({ remote: "origin", ref })
  );

  // Check for existing worktree matching this ref
  const existingPath = findExistingWorktree(repo.rootUri.fsPath, ref);
  if (existingPath) {
    await resetWorktree(existingPath, ref);
    await runPostCheckoutHook(existingPath);
    await openFolder(existingPath);
    return;
  }

  // Determine worktree path
  const worktreeDir = getWorktreeParentDir(repo);
  const safeBranch = ref.replace(/\//g, "-");
  const worktreePath = path.join(worktreeDir, safeBranch);

  // Ensure .worktrees is in .gitignore (only modifies if worktree dir is inside repo)
  await ensureGitignored(repo.rootUri.fsPath, worktreeDir);

  // Create worktree via CLI — repo.createWorktree() isn't available in all editors (e.g. Cursor)
  const cmd = `git worktree add -b ${ref} ${JSON.stringify(worktreePath)} origin/${ref}`;
  log(`[create] cmd: ${cmd}`);
  log(`[create] cwd: ${repo.rootUri.fsPath}`);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating worktree for ${ref}…` },
    () =>
      new Promise<void>((resolve, reject) => {
        cp.exec(cmd, { cwd: repo.rootUri.fsPath, timeout: 30000 }, (err, stdout, stderr) => {
          log(`[create] callback fired. err=${err ? err.message : "null"}`);
          log(`[create] stdout: ${stdout}`);
          log(`[create] stderr: ${stderr}`);
          if (err) {
            reject(new Error(`git worktree add failed: ${err.message}`));
          } else {
            resolve();
          }
        });
      })
  );

  // Verify the worktree directory exists before proceeding
  try {
    const stat = await fs.stat(worktreePath);
    log(`[create] worktree exists: isDir=${stat.isDirectory()}`);
  } catch (e) {
    log(`[create] worktree NOT FOUND at ${worktreePath}`);
    throw new Error(`Worktree directory not found after creation: ${worktreePath}`);
  }

  // Write state file so the new window knows to focus the PR view
  await writeStateFile(worktreePath, { focusPR: true });

  // Run post-checkout hook if configured
  await runPostCheckoutHook(worktreePath);

  log(`[open] about to open: ${worktreePath}`);
  await openFolder(worktreePath);
  log(`[open] openFolder returned`);
}

/**
 * Parse `git worktree list --porcelain` to find a worktree for the given branch.
 * Returns the worktree path if found, undefined otherwise.
 */
function findExistingWorktree(repoRoot: string, ref: string): string | undefined {
  try {
    const output = cp.execSync("git worktree list --porcelain", {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 5000,
    });

    // Porcelain format: blocks separated by blank lines
    // Each block: "worktree <path>\nHEAD <sha>\nbranch refs/heads/<name>\n"
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
    // git worktree list failed — fall through to create
  }
  return undefined;
}

function getWorktreeParentDir(repo: Repository): string {
  const config = vscode.workspace.getConfiguration("checkout-worktree");
  const configured = config.get<string>("worktreeParentDir", "");

  if (configured) {
    const resolved = resolveHome(configured);
    // Resolve relative paths against the repo root
    if (!path.isAbsolute(resolved)) {
      return path.resolve(repo.rootUri.fsPath, resolved);
    }
    return resolved;
  }

  // Default: <repo-root>/.worktrees/ (inside repo, gitignored)
  return path.join(repo.rootUri.fsPath, ".worktrees");
}

/**
 * Ensure the worktree directory is listed in the repo's .gitignore.
 * Only acts when the worktree dir is inside the repo root.
 */
async function ensureGitignored(repoRoot: string, worktreeDir: string): Promise<void> {
  // Only relevant if worktreeDir is inside the repo
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
    // No .gitignore yet — we'll create one
  }

  // Check if already ignored (exact line match)
  const lines = content.split("\n");
  const alreadyIgnored = lines.some(
    (line) => line.trim() === entry || line.trim() === relative || line.trim() === `${relative}/`
  );

  if (alreadyIgnored) {
    return;
  }

  // Append the entry
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await fs.writeFile(gitignorePath, `${content}${separator}${entry}\n`, "utf-8");
}

/**
 * Run the configured post-checkout command in the worktree directory.
 * Skips silently if no command is configured.
 */
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

const STATE_FILE = ".checkout-worktree-state.json";

export interface WorktreeState {
  focusPR?: boolean;
}

/**
 * Write a state file into the worktree directory.
 * The new window reads this on activation to perform post-open actions.
 */
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

const PROTECTED_BRANCHES = new Set(["main", "master"]);

/**
 * Reset an existing worktree to match origin — hard reset + clean.
 * Skips protected branches (main, master) to avoid data loss.
 */
async function resetWorktree(worktreePath: string, ref: string): Promise<void> {
  if (PROTECTED_BRANCHES.has(ref)) {
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Resetting worktree to origin/${ref}…` },
    () =>
      new Promise<void>((resolve, reject) => {
        const commands = [
          `git fetch origin ${ref}`,
          `git reset --hard origin/${ref}`,
          `git clean -fd`,
        ].join(" && ");

        cp.exec(commands, { cwd: worktreePath, timeout: 30000 }, (err) => {
          if (err) {
            reject(new Error(`Failed to reset worktree: ${err.message}`));
          } else {
            resolve();
          }
        });
      })
  );
}

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

  log(`[open] path=${folderPath}`);
  log(`[open] appName=${vscode.env.appName}, cli=${cli}`);
  log(`[open] spawning: ${cli} --new-window ${folderPath}`);

  const child = cp.spawn(cli, ["--new-window", folderPath], {
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();
  log(`[open] spawned pid=${child.pid}`);
}
