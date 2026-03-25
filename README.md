# Checkout Worktree

VS Code extension that checks out git branches as local worktrees from a URI link. Click a link → open the branch locally in VS Code — no manual `git worktree add` needed.

## URI Format

```
vscode://forsbergplustwo.checkout-worktree?repo=<name>&ref=<branch>&uri=<clone_url>
```

| Param | Required | Description |
|-------|----------|-------------|
| `repo` | yes | Repository directory name |
| `ref` | yes | Branch name, tag, or commit |
| `uri` | no | Git clone URL (for future clone support) |

## Example

```
vscode://forsbergplustwo.checkout-worktree?repo=orderly-emails&ref=fix/issue-123&uri=https://github.com/forsbergplustwo/orderly-emails.git
```

## Settings

- **`checkout-worktree.gitFolders`** — Array of folders containing your git repos. The extension scans these (one level deep) to find the repo by name.
- **`checkout-worktree.worktreeParentDir`** — Where to create worktrees. Defaults to `<repo>-worktrees/` next to the repo.

## How It Works

1. Finds the repository (open in VS Code, or in configured `gitFolders`)
2. If not found locally and `uri` is provided, clones the repo into the first `gitFolders` entry (or asks you to pick a folder)
3. Fetches `origin` to get latest refs
4. Checks if a worktree for the branch already exists
5. Creates a new worktree if needed
6. Opens the worktree folder in VS Code

## Install

```sh
cd checkout-worktree
npm install
npm run compile
# Then install from VSIX or use in development
```
