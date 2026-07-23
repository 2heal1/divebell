# Browser Authentication and State

Chinese version: [浏览器登录与状态复用](browser-auth.zh-CN.md)

OpenRuntime composes agent-browser profiles, state, and auth to provide reusable browser sign-in environments for coding agents.

## What each capability stores

| Capability | Contents | Best use |
| --- | --- | --- |
| Profile | A complete Chrome user configuration, including cookies, web storage, IndexedDB, service workers, and cache | Reuse an account already signed in to local Chrome, or maintain a long-lived isolated browser configuration |
| state | Cookies plus localStorage and sessionStorage for origins visited by the current session | Create a small, explicit login-state file that can be saved and loaded |
| auth | Encrypted username, password, and login-page metadata | Let agent-browser open, fill, and submit a login form |

`profiles` only lists selectable local Chrome profiles; it does not export their data. `auth` stores credentials, not post-login cookies. To copy an existing signed-in session, start from a Profile and then save state.

## Reuse a local Chrome Profile

List available profiles:

```bash
openruntime profiles
```

Close the existing OpenRuntime browser, then open the target page with a selected profile:

```bash
openruntime stop
openruntime open https://app.example.com/dashboard --profile "Work" --ui
```

When given a Chrome profile name, agent-browser uses a read-only copy and does not modify the original Chrome configuration. A directory path creates a long-lived custom profile:

```bash
openruntime open https://app.example.com --profile ~/.openruntime-profiles/app
```

A Profile is a directory, not a single export file. Save state when a portable file is needed.

## Export only one URL's login state

OpenRuntime adds this composition on top of agent-browser `state save`. First open the exact URL from the desired Chrome Profile, then save with the same URL:

```bash
openruntime stop
openruntime open https://app.example.com/account --profile "Work" --ui
openruntime state save ./app-state.json --url https://app.example.com/account
```

The resulting `app-state.json` remains a standard agent-browser state file and can be loaded directly. The filter:

- keeps only cookies whose domain, path, and secure setting apply to the URL;
- keeps localStorage and sessionStorage only for the URL's exact origin;
- excludes login state for other domains;
- excludes IndexedDB, service workers, cache, browser extensions, and Chrome's password manager.

Open the URL before saving so its web storage is present in the current browser session. Listing a Profile without visiting the page does not guarantee that storage will be captured.

Without `--url`, this is the native agent-browser full-state save. It includes all cookies in the current session and storage for every origin visited in that session:

```bash
openruntime state save ./full-state.json
```

## Load and manage state

Load a state file while opening:

```bash
openruntime open https://app.example.com/account --state ./app-state.json
```

Or load it into the current session:

```bash
openruntime state load ./app-state.json
openruntime open https://app.example.com/account
```

Inspect and manage automatically saved state:

```bash
openruntime state list
openruntime state show <filename>
openruntime state rename <old-name> <new-name>
openruntime state clear [session-name]
openruntime state clean --older-than 7
```

OpenRuntime automatically restores the browser session for the same project. An explicit `--profile` or `--state` takes precedence and is not combined with earlier auto-restored content. Explicit state files are useful when the state must be reviewed, moved, or narrowed.

## Use the auth vault

Save a password through standard input so it does not appear in shell history:

```bash
printf '%s\n' "$APP_PASSWORD" | \
  openruntime auth save app \
    --url https://app.example.com/login \
    --username tester@example.com \
    --password-stdin
```

Log in with:

```bash
openruntime auth login app
```

agent-browser opens the saved login URL, waits for common username and password fields, fills them, and submits the form. For non-standard forms, pass `--username-selector`, `--password-selector`, and `--submit-selector` while saving or logging in.

Manage entries:

```bash
openruntime auth list
openruntime auth show app
openruntime auth delete app
```

Lists and details never reveal passwords.

## Security boundary

Profiles, state, and auth only reuse accounts that are already authorized. They do not bypass sign-in or permission checks.

State files usually contain usable session tokens in plaintext. Keep them on trusted storage, add them to `.gitignore`, and never commit or share them with someone who lacks access to the target site. URL scoping narrows the export but does not make the file non-sensitive.
