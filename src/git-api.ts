/**
 * git-api.ts — Typed access to VS Code's built-in git extension.
 *
 * Re-exports the subset of types we need from vscode.git, plus a
 * helper to get the API instance (fails loudly if git is disabled).
 */

import * as vscode from "vscode";

// ─── Types from vscode.git (subset we use) ──────────────────────────────────

export interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitAPI;
}

export interface GitAPI {
  readonly repositories: Repository[];
  openRepository(root: vscode.Uri): Promise<Repository | null>;
}

export interface Repository {
  readonly rootUri: vscode.Uri;
  readonly state: RepositoryState;
  fetch(options?: { remote?: string; ref?: string }): Promise<void>;
  checkout(treeish: string): Promise<void>;
  createWorktree(options?: {
    path?: string;
    commitish?: string;
    branch?: string;
  }): Promise<string>;
}

export interface RepositoryState {
  readonly HEAD: { name?: string } | undefined;
  readonly worktrees: Worktree[];
}

export interface Worktree {
  readonly name: string;
  readonly path: string;
  readonly ref: string;
  readonly main: boolean;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

export function getGitAPI(): GitAPI {
  const ext = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!ext) {
    throw new Error("Git extension (vscode.git) not found");
  }

  const git = ext.isActive ? ext.exports : undefined;
  if (!git?.enabled) {
    throw new Error("Git extension is not enabled");
  }

  return git.getAPI(1);
}
