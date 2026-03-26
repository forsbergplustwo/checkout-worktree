/**
 * uri-handler.ts — Parse and handle incoming vscode:// URIs.
 *
 * URI format:
 *   vscode://forsbergplustwo.checkout-worktree?repo=<name>&ref=<branch>&uri=<clone_url>
 *
 * Parameters:
 *   repo (required) — repository directory name
 *   ref  (required) — branch name, tag, or commit
 *   uri  (optional) — git clone URL (for future clone support)
 */

import * as vscode from "vscode";
import { findRepository } from "./find-repo";
import { checkoutWorktree } from "./worktree";

export interface ParsedURI {
  repo: string;
  ref: string;
  uri?: string;
}

export function parseURI(uri: vscode.Uri): ParsedURI {
  const params = new URLSearchParams(uri.query);

  const repo = params.get("repo");
  if (!repo) {
    throw new Error("Missing required parameter: repo");
  }

  const ref = params.get("ref");
  if (!ref) {
    throw new Error("Missing required parameter: ref");
  }

  return {
    repo,
    ref,
    uri: params.get("uri") ?? undefined,
  };
}

export async function handleURI(uri: vscode.Uri): Promise<void> {
  const parsed = parseURI(uri);

  const repo = await findRepository(parsed.repo, parsed.uri);
  await checkoutWorktree(repo, parsed.ref);

  vscode.window.showInformationMessage(
    `Opened worktree for ${parsed.ref} in ${parsed.repo}`
  );
}
