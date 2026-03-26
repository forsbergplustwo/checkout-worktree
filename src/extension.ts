/**
 * extension.ts — Entry point for the checkout-worktree extension.
 *
 * Registers a URI handler so that links like:
 *   vscode://forsbergplustwo.checkout-worktree?repo=orderly-emails&ref=fix/issue-123
 * will fetch the branch, create a worktree, and open it.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { handleURI } from "./uri-handler";

const LOG_FILE = path.join(os.tmpdir(), "checkout-worktree.log");

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

export function activate(context: vscode.ExtensionContext): void {
  log(`activate: extension activated. logFile=${LOG_FILE}`);
  log(`activate: appName=${vscode.env.appName}, appRoot=${vscode.env.appRoot}`);

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        log(`handleUri: ${uri.toString()}`);
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

export function deactivate(): void {
  log(`deactivate: extension deactivated`);
}
