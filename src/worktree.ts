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
  const existing = repo.state.worktrees.find((wt) => wt.ref === ref || wt.name === ref);
  if (existing) {
    await openFolder(existing.path);
    return;
  }

  // Determine worktree path
  const worktreeDir = getWorktreeParentDir(repo);
  const safeBranch = ref.replace(/\//g, "-");
  const worktreePath = path.join(worktreeDir, safeBranch);

  // Ensure .worktrees is in .gitignore (only modifies if worktree dir is inside repo)
  await ensureGitignored(repo.rootUri.fsPath, worktreeDir);

  // Create worktree
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating worktree for ${ref}…` },
    () => repo.createWorktree({ path: worktreePath, commitish: `origin/${ref}`, branch: ref })
  );

  // Run post-checkout hook if configured
  await runPostCheckoutHook(worktreePath);

  await openFolder(worktreePath);
}

function getWorktreeParentDir(repo: Repository): string {
  const config = vscode.workspace.getConfiguration("checkout-worktree");
  const configured = config.get<string>("worktreeParentDir", "");

  if (configured) {
    return resolveHome(configured);
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

async function openFolder(folderPath: string): Promise<void> {
  const uri = vscode.Uri.file(folderPath);
  await vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: true });
}
