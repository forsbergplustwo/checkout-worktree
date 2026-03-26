/**
 * extension.ts — Entry point for the checkout-worktree extension.
 *
 * Registers a URI handler so that links like:
 *   vscode://forsbergplustwo.checkout-worktree?repo=orderly-emails&ref=fix/issue-123
 * will fetch the branch, create a worktree, and open it.
 */

import * as vscode from "vscode";
import { handleURI } from "./uri-handler";
import { consumeStateFile } from "./worktree";

let _channel: vscode.OutputChannel;

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  _channel.appendLine(line);
}

export function activate(context: vscode.ExtensionContext): void {
  _channel = vscode.window.createOutputChannel("Checkout Worktree");
  context.subscriptions.push(_channel);

  log(`activated — appName=${vscode.env.appName}`);

  // Check for state file from worktree creation (new window post-open actions)
  checkStateFile();

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        log(`handleUri: ${uri.toString()}`);
        _channel.show(true); // show the output channel, preserve focus
        try {
          await handleURI(uri);
          log(`handleUri: completed successfully`);
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

  log(`[state] consumed state file: ${JSON.stringify(state)}`);

  if (state.focusPR) {
    // Small delay to let the GH PR extension activate and discover the repo
    setTimeout(async () => {
      try {
        await vscode.commands.executeCommand("pr:github.focus");
        log(`[state] focused PR view`);
      } catch (err) {
        log(`[state] pr:github.focus failed (non-fatal): ${err}`);
      }
    }, 3000);
  }
}

export function deactivate(): void {}
