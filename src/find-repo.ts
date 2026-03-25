/**
 * find-repo.ts — Locate a git repository by name.
 *
 * Search strategy (in order):
 * 1. Already-open repositories in VS Code (via git API)
 * 2. Configured gitFolders — scan one level deep for a directory matching the repo name
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { getGitAPI, type Repository } from "./git-api";

/**
 * Find a repository by name. Returns the Repository if already open,
 * or opens it from a gitFolders match. Throws if not found.
 */
export async function findRepository(repoName: string): Promise<Repository> {
  const git = getGitAPI();

  // 1. Check already-open repositories
  const match = git.repositories.find(
    (r) => path.basename(r.rootUri.fsPath) === repoName
  );
  if (match) {
    return match;
  }

  // 2. Scan configured gitFolders
  const config = vscode.workspace.getConfiguration("checkout-worktree");
  const gitFolders = config.get<string[]>("gitFolders", []);

  for (const folder of gitFolders) {
    const resolvedFolder = folder.replace(/^~/, process.env.HOME ?? "~");
    const candidate = path.join(resolvedFolder, repoName);

    try {
      const stat = await fs.stat(path.join(candidate, ".git"));
      if (stat.isDirectory() || stat.isFile()) {
        // .git can be a file (worktree) or directory — both valid
        const repo = await git.openRepository(vscode.Uri.file(candidate));
        if (repo) {
          return repo;
        }
      }
    } catch {
      // Not found here, try next folder
    }
  }

  throw new Error(
    `Repository "${repoName}" not found. Check checkout-worktree.gitFolders setting.`
  );
}
