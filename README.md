# Checkout Worktree

Create your own deep links for one-click branch checkout of git worktrees or PR branches. Add links to your custom apps or dashboards to quickly checkout any branch or PR branch locally and open it in your favorite IDE.

Works in VS Code and VS Code-compatible editors such as Cursor and Windsurf.

## Why use it

- Add one-click links to custom apps or dashboards to checkout any branch or PR branch locally
- No stash/switch dance just to review or fix a branch
- Open PR branches directly from links your team already shares
- Keep each branch isolated in its own worktree
- Optional setup command runs automatically after checkout

## URI Format

```
<ide-identifier>://forsbergplustwo.checkout-worktree?repo=<name>&ref=<branch>&uri=<clone_url>
```

| Param            | Required | Description                                                            |
| ---------------- | -------- | ---------------------------------------------------------------------- |
| `ide-identifier` | yes      | Identifier for the IDE or editor (e.g. `vscode`, `cursor`, `windsurf`) |
| `repo`           | yes      | Repository directory name                                              |
| `ref`            | yes      | Branch name, tag, or commit                                            |
| `uri`            | no       | Git clone URL — used to clone the repo if not found locally            |

## Example

```
vscode://forsbergplustwo.checkout-worktree?repo=my-repo&ref=fix/issue-123&uri=https://github.com/forsbergplustwo/my-repo.git
cursor://forsbergplustwo.checkout-worktree?repo=my-repo&ref=fix/issue-123&uri=https://github.com/forsbergplustwo/my-repo.git
windsurf://forsbergplustwo.checkout-worktree?repo=my-repo&ref=fix/issue-123&uri=https://github.com/forsbergplustwo/my-repo.git
```

## How It Works

1. **Finds the repository** — checks open VS Code workspaces, then scans configured `gitFolders`
2. **Clones if needed** — if not found locally and `uri` is provided, clones the repo into the first `gitFolders` entry (or asks you to pick a folder)
3. **Fetches** the latest refs from `origin`
4. **Reuses existing worktrees** — if a worktree for the branch already exists, opens it directly
5. **Creates a new worktree** in `.worktrees/` inside the repo (auto-added to `.gitignore`)
6. **Runs post-checkout hook** — executes your configured setup command in the worktree
7. **Opens the folder** in VS Code

## Settings

Open VS Code settings (`Cmd+,`) and search for "Checkout Worktree":

| Setting                                 | Default | Description                                                                                                                      |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `checkout-worktree.gitFolders`          | `[]`    | Parent directories where your repos live (e.g. `~/code`, `~/projects`). Scanned one level deep to find repos by name.            |
| `checkout-worktree.worktreeParentDir`   | `""`    | Override where worktrees are created. Defaults to `.worktrees/` inside the repo root.                                            |
| `checkout-worktree.postCheckoutCommand` | `""`    | Shell command to run in the worktree after creation (e.g. `mise trust && mise run worktree:setup`). Only runs for new worktrees. |

### Example `settings.json`

```json
{
  "checkout-worktree.gitFolders": ["~/code", "~/projects"],
  "checkout-worktree.worktreeParentDir": "~/.worktrees",
  "checkout-worktree.postCheckoutCommand": "mise trust && mise run worktree:setup"
}
```

## Install

```sh
git clone https://github.com/forsbergplustwo/checkout-worktree.git
cd checkout-worktree
pnpm install
```

Then install for your editor:

```sh
pnpm install:cursor    # Cursor
pnpm install:vscode    # VS Code
pnpm install:windsurf  # Windsurf
```

Reload the editor window after installing (`Cmd+Shift+P` → **Developer: Reload Window**).

## Post-Install Setup

After installing, configure `gitFolders` so the extension knows where your repos live. Without this, it won't find repos that aren't currently open in VS Code.

Open your editor settings (`Cmd+,` → search "Checkout Worktree") or add to `settings.json`:

```json
{
  "checkout-worktree.gitFolders": ["~/forsbergProjects"],
  "checkout-worktree.postCheckoutCommand": "mise trust && mise run worktree:setup"
}
```

> **Important:** `gitFolders` should list the **parent directories** that contain your repos (e.g. `~/forsbergProjects`), not the repos themselves. The extension scans one level deep to find repos by name.
