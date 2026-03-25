# Checkout Worktree

One-click branch checkout for VS Code using git worktrees. Open a `vscode://` link from a PR, CI dashboard, or chat message — and land directly in an isolated worktree for that branch. No stashing, no switching, no manual `git worktree add`.

## URI Format

```
vscode://forsbergplustwo.checkout-worktree?repo=<name>&ref=<branch>&uri=<clone_url>
```

| Param | Required | Description |
|-------|----------|-------------|
| `repo` | yes | Repository directory name |
| `ref` | yes | Branch name, tag, or commit |
| `uri` | no | Git clone URL — used to clone the repo if not found locally |

## Example

```
vscode://forsbergplustwo.checkout-worktree?repo=orderly-emails&ref=fix/issue-123&uri=https://github.com/forsbergplustwo/orderly-emails.git
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

| Setting | Default | Description |
|---------|---------|-------------|
| `checkout-worktree.gitFolders` | `[]` | Parent directories where your repos live (e.g. `~/code`, `~/projects`). Scanned one level deep to find repos by name. |
| `checkout-worktree.worktreeParentDir` | `""` | Override where worktrees are created. Defaults to `.worktrees/` inside the repo root. |
| `checkout-worktree.postCheckoutCommand` | `""` | Shell command to run in the worktree after creation (e.g. `mise trust && mise run worktree:setup`). Only runs for new worktrees. |

### Example `settings.json`

```json
{
  "checkout-worktree.gitFolders": ["~/code", "~/projects"],
  "checkout-worktree.postCheckoutCommand": "mise trust && mise run worktree:setup"
}
```

## Install

### From VSIX (recommended)

1. Clone and build:

   ```sh
   git clone https://github.com/forsbergplustwo/checkout-worktree.git
   cd checkout-worktree
   npm install
   npm run compile
   npx @vscode/vsce package
   ```

2. Install in VS Code:
   - Open VS Code
   - `Cmd+Shift+P` → **Extensions: Install from VSIX…**
   - Select the generated `.vsix` file

### From source (development)

1. Clone and build:

   ```sh
   git clone https://github.com/forsbergplustwo/checkout-worktree.git
   cd checkout-worktree
   npm install
   npm run compile
   ```

2. Open the `checkout-worktree` folder in VS Code
3. Press `F5` to launch an Extension Development Host with the extension loaded

## Post-Install Setup

After installing, configure `gitFolders` so the extension knows where your repos live. Without this, it won't find repos that aren't currently open in VS Code.

Open your editor settings (`Cmd+,` → search "Checkout Worktree") or add to `settings.json`:

```json
{
  "checkout-worktree.gitFolders": [
    "~/forsbergProjects"
  ],
  "checkout-worktree.postCheckoutCommand": "mise trust && mise run worktree:setup"
}
```

> **Important:** `gitFolders` should list the **parent directories** that contain your repos (e.g. `~/forsbergProjects`), not the repos themselves. The extension scans one level deep to find repos by name.
