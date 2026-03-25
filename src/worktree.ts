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
import type { Repository } from "./git-api";

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

  // Create worktree
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating worktree for ${ref}…` },
    () => repo.createWorktree({ path: worktreePath, commitish: `origin/${ref}`, branch: ref })
  );

  await openFolder(worktreePath);
}

function getWorktreeParentDir(repo: Repository): string {
  const config = vscode.workspace.getConfiguration("checkout-worktree");
  const configured = config.get<string>("worktreeParentDir", "");

  if (configured) {
    return configured.replace(/^~/, process.env.HOME ?? "~");
  }

  // Default: <repo-root>-worktrees/ (sibling of repo)
  const repoRoot = repo.rootUri.fsPath;
  return `${repoRoot}-worktrees`;
}

async function openFolder(folderPath: string): Promise<void> {
  const uri = vscode.Uri.file(folderPath);
  await vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: false });
}
