/**
 * extension.ts — Entry point for the checkout-worktree extension.
 *
 * Registers a URI handler so that links like:
 *   vscode://forsbergplustwo.checkout-worktree?repo=orderly-emails&ref=fix/issue-123
 * will fetch the branch, create a worktree, and open it.
 */

import * as vscode from "vscode";
import { handleURI } from "./uri-handler";

let _channel: vscode.OutputChannel;

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  _channel.appendLine(line);
}

export function activate(context: vscode.ExtensionContext): void {
  _channel = vscode.window.createOutputChannel("Checkout Worktree");
  context.subscriptions.push(_channel);

  log(`activated — appName=${vscode.env.appName}`);

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

export function deactivate(): void {}
