/**
 * find-repo.ts — Locate or clone a git repository by name.
 *
 * Search strategy (in order):
 * 1. Already-open repositories in VS Code (via git API)
 * 2. Configured gitFolders — scan one level deep for a directory matching the repo name
 * 3. Clone from URI (if provided) into the first gitFolder, then open it
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { getGitAPI, type Repository } from "./git-api";
import { resolveHome } from "./utils";

/**
 * Find a repository by name. If not found locally and a clone URI is
 * provided, offers to clone it. Returns the Repository instance.
 */
export async function findRepository(
  repoName: string,
  cloneUri?: string
): Promise<Repository> {
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
    const resolvedFolder = resolveHome(folder);
    const candidate = path.join(resolvedFolder, repoName);

    try {
      const stat = await fs.stat(path.join(candidate, ".git"));
      if (stat.isDirectory() || stat.isFile()) {
        const repo = await git.openRepository(vscode.Uri.file(candidate));
        if (repo) {
          return repo;
        }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  // 3. Clone if we have a URI
  if (cloneUri) {
    return cloneRepository(repoName, cloneUri, gitFolders);
  }

  throw new Error(
    `Repository "${repoName}" not found locally. Provide a clone URI or check checkout-worktree.gitFolders setting.`
  );
}

/**
 * Clone a repository into the first configured gitFolder (or ask the user
 * to pick a directory), then open it in the git API.
 */
async function cloneRepository(
  repoName: string,
  cloneUri: string,
  gitFolders: string[]
): Promise<Repository> {
  const git = getGitAPI();

  // Determine clone target directory
  let parentDir: string;

  if (gitFolders.length > 0) {
    parentDir = resolveHome(gitFolders[0]);
  } else {
    // No gitFolders configured — ask the user
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Clone into this folder",
      title: `Choose a parent folder for cloning ${repoName}`,
    });

    if (!picked || picked.length === 0) {
      throw new Error("Clone cancelled — no folder selected");
    }

    parentDir = picked[0].fsPath;
  }

  const targetPath = path.join(parentDir, repoName);

  // Check target doesn't already exist
  const exists = await fs.stat(targetPath).then(() => true, () => false);
  if (exists) {
    throw new Error(
      `Directory "${targetPath}" already exists but wasn't detected as a git repo`
    );
  }

  // Ensure parent directory exists
  await fs.mkdir(parentDir, { recursive: true });

  // Clone via the git extension API
  const clonedUri = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Cloning ${repoName}…`,
      cancellable: false,
    },
    () => git.clone(vscode.Uri.parse(cloneUri), {
      parentPath: vscode.Uri.file(parentDir),
      postCloneAction: "none",
    })
  );

  if (!clonedUri) {
    throw new Error(`Clone failed for "${cloneUri}"`);
  }

  // Open the freshly cloned repo
  const repo = await git.openRepository(clonedUri);
  if (!repo) {
    throw new Error(
      `Clone appeared to succeed but couldn't open repository at "${clonedUri.fsPath}"`
    );
  }

  return repo;
}
