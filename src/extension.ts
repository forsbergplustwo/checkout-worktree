/**
 * extension.ts — Entry point for the checkout-worktree extension.
 *
 * Registers a URI handler so that links like:
 *   vscode://forsbergplustwo.checkout-worktree?repo=orderly-emails&ref=fix/issue-123
 * will fetch the branch, create a worktree, and open it.
 */

import * as vscode from "vscode";
import { handleURI } from "./uri-handler";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        try {
          await handleURI(uri);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Checkout Worktree: ${message}`);
        }
      },
    })
  );
}

export function deactivate(): void {}
