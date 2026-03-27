/**
 * extension.ts — Entry point for the checkout-worktree extension.
 *
 * Two activation paths:
 * 1. onUri — URI handler in the original window (silent, just creates folder + opens new window)
 * 2. onStartupFinished — new window reads state file and does all user-visible work
 */

import * as vscode from "vscode";
import { handleURI } from "./uri-handler";
import { consumeStateFile, resumeWorktreeSetup } from "./worktree";

let _channel: vscode.OutputChannel;

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  _channel.appendLine(line);
}

export function activate(context: vscode.ExtensionContext): void {
  _channel = vscode.window.createOutputChannel("Checkout Worktree");
  context.subscriptions.push(_channel);

  log(`activated — appName=${vscode.env.appName}`);

  // Phase 2: Check for state file from worktree creation (runs in new window)
  checkStateFile();

  // Phase 1: URI handler (runs in original window)
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        log(`handleUri: ${uri.toString()}`);
        try {
          await handleURI(uri);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log(`handleUri: ERROR — ${message}`);
          vscode.window.showErrorMessage(`Checkout Worktree: ${message}`);
        }
      },
    })
  );
}

async function checkStateFile(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return;
  }

  const root = folders[0].uri.fsPath;
  const state = await consumeStateFile(root);
  if (!state) {
    return;
  }

  log(`[phase2] consumed state file: ${JSON.stringify(state)}`);
  _channel.show(true); // show output channel in new window, preserve focus

  try {
    await resumeWorktreeSetup(root, state);
    log(`[phase2] completed successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[phase2] ERROR — ${message}`);
    vscode.window.showErrorMessage(`Checkout Worktree: ${message}`);
  }
}

export function deactivate(): void {}
