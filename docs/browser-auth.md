# Browser Authentication and State

Divebell composes agent-browser profiles, state, and auth to provide reusable browser sign-in environments for coding agents.

## What each capability stores

| Capability | Contents | Best use |
| --- | --- | --- |
| Profile | A complete Chrome user configuration, including cookies, web storage, IndexedDB, service workers, and cache | Reuse an account already signed in to local Chrome, or maintain a long-lived isolated browser configuration |
| state | Cookies plus localStorage and sessionStorage for origins visited by the current session | Create a small, explicit login-state file that can be saved and loaded |
| auth | Encrypted username, password, and login-page metadata | Let agent-browser open, fill, and submit a login form |

`profiles` lists selectable local Chrome profiles. `profile export` exports only a Profile created by `open --temp-profile`; it does not copy an arbitrary installed Chrome Profile. `auth` stores credentials, not post-login cookies. To copy an existing signed-in session into a portable file, start from a Profile and then save state.

## Default browser context

By default, `divebell open` uses a read-only copy of the current OS user's most
recently used Chrome Profile. Explicit browser contexts take precedence. Pass
`--no-default-profile` to skip automatic Profile selection and use project
Restore State; the same fallback is used when no local Chrome Profile is
available.

## Reuse a local Chrome Profile

List available profiles:

```bash
divebell profiles
```

Close the existing Divebell browser, then open the target page with a selected profile:

```bash
divebell stop
divebell open https://app.example.com/dashboard --profile "Work" --ui
```

When given a Chrome profile name, agent-browser uses a read-only copy and does not modify the original Chrome configuration. A directory path creates a long-lived custom profile:

```bash
divebell open https://app.example.com --profile ~/.divebell-profiles/app
```

A Profile is a directory, not a single export file. Save state when a portable file is needed.

## Create a clean Profile by signing in once

When scoped state is present but still redirects to sign-in, create an empty,
isolated local Profile and complete the authorized login in its browser window:

```bash
divebell open https://app.example.com/dashboard --ui --temp-profile
```

`--temp-profile` creates a new private Profile directory and a dedicated
browser session. It does not select the latest Chrome Profile, load configured
state, or use project Restore State. It cannot be combined with another
browser context such as `--profile`, `--state`, `--restore`, `--cdp`, or
`--allowed-domains`.

After login and target-page verification, export the complete Profile before
running `stop`:

```bash
divebell profile export
# Or choose a new directory that does not already exist:
divebell profile export ./app-profile
```

The export command first closes the browser cleanly so Chrome flushes cookies,
IndexedDB, service workers, preferences, and other Profile-owned data. It then
moves the temporary Profile into the requested directory. When no directory is
given, Divebell creates one under `~/.divebell/profiles/`. The absolute export
path is returned in `data.path` of the standard command envelope.

Reuse that directory on the same local environment:

```bash
divebell open https://app.example.com/dashboard \
  --profile /absolute/path/from/data.path \
  --ui
```

Running `divebell stop` instead discards an unexported temporary Profile. A new
`open` is rejected while one is active, so export or stop it first. Exported
Profiles are sensitive local browser directories and can contain more data
than state JSON. Keep them on trusted storage and do not assume they are
portable across operating systems or Chrome installations.

## Export scoped application and sign-in state

Divebell adds this composition on top of agent-browser `state save`. First open the exact URL from the desired Chrome Profile, then save with the same URL:

```bash
divebell stop
divebell open https://app.example.com/account --profile "Work" --ui
divebell state save ./app-state.json --url https://app.example.com/account
```

The save command returns the absolute file path in `data.path` of the standard
Divebell command envelope.

When the application relies on a different SSO origin, add it explicitly. `--url` identifies the one primary application URL; `--include-url` is repeatable:

```bash
divebell state save ./app-state.json \
  --url https://app.example.net/account \
  --include-url https://sso.example.com/login \
  --include-url https://identity.example.org/
```

The resulting `app-state.json` remains a standard agent-browser state file and can be loaded directly. The filter:

- keeps only cookies whose domain, path, and secure setting apply to the primary URL or an included URL;
- keeps localStorage and sessionStorage only for those exact origins;
- excludes login state for other domains;
- excludes IndexedDB, service workers, cache, browser extensions, and Chrome's password manager.

HttpOnly cookies are read through the browser protocol and remain in the state file when they match the scoped URLs. `--include-url` also asks agent-browser to collect storage for each additional origin, so an SSO origin can be preserved even when the final page is back on the application. Divebell does not guess related domains: every additional origin broadens the sensitive export and must be named explicitly or supplied by a trusted workflow.

Open the primary URL before saving so its web storage is present in the current browser session. Listing a Profile without visiting the page does not guarantee that storage will be captured.

Without `--url`, this is the native agent-browser full-state save. It includes all cookies in the current session and storage for every origin visited in that session:

```bash
divebell state save ./full-state.json
```

## When a state file cannot authenticate

Always try a supplied state on its consumer first and verify the final URL,
navigation or HTTP result, current account, and task-specific success
condition:

```bash
divebell open https://app.example.net/account --state ./app-state.json
```

If access succeeds, keep using that state. If it redirects to sign-in, returns
401 or 403, or shows a signed-out or permission page, the state is insufficient
for that application. Do not guess related origins or broaden it. On a trusted
local machine, use the [clean Profile workflow](#create-a-clean-profile-by-signing-in-once):

```bash
divebell stop
divebell open https://app.example.net/account --ui --temp-profile
# Complete the authorized login and verify the target, then:
divebell profile export
divebell open https://app.example.net/account \
  --profile /absolute/path/from/data.path \
  --ui
```

The exported Profile is the reliable local result because it retains
Profile-owned data that state JSON intentionally omits, including IndexedDB,
service workers, cache, and browser preferences. Verify the same target,
account, and success condition after reopening it.

If another machine specifically requires a portable file, a provider may use
`state save` from that verified Profile with the exact application URL and only
the known sign-in URLs reviewed for export. The resulting file remains a
partial browser snapshot and can still be insufficient. If its consumer fails
the same authentication check, return to the complete Profile workflow rather
than broadening or guessing state scope.

A plain 404 without authentication evidence is an application, environment, or
routing problem rather than proof of missing browser state.

## Load and manage state

Load a state file while opening:

```bash
divebell open https://app.example.com/account --state ./app-state.json
```

Or load it into the current session:

```bash
divebell state load ./app-state.json
divebell open https://app.example.com/account
```

Inspect and manage automatically saved state:

```bash
divebell state list
divebell state show <filename>
divebell state rename <old-name> <new-name>
divebell state clear [session-name]
divebell state clean --older-than 7
```

Divebell automatically restores the browser session for the same project when no usable local Chrome Profile exists or `--no-default-profile` is set. An explicit `--profile`, `--state`, or `--restore` takes precedence and is not combined with restored content. Divebell keeps that browser mode for the current open context, so later page commands and `stop` continue controlling the same browser. Explicit state files are useful when the state must be reviewed, moved, or narrowed.

## Restore State save policy

Restore State is the cookies, localStorage, and sessionStorage snapshot described above. It is not a Chrome Profile and does not contain IndexedDB, service workers, cache, extensions, browser preferences, or other Chrome-owned data.

For automatic Restore State, `divebell open <url> --ui` uses three independent save stages:

1. After the newly opened page has been quiet for about two seconds, save once.
2. Do not continue saving periodically while the page remains open.
3. Save the latest State before normal close, `divebell stop`, daemon shutdown, idle timeout, or a compatible browser relaunch.

The next `open` for the same project restores the State written by the close stage. A user who wants the previous periodic behavior can enable it explicitly; its default interval remains about 30 seconds:

```bash
divebell open https://app.example.com --ui --restore-periodic-save
# Optional custom interval:
divebell open https://app.example.com --ui \
  --restore-periodic-save \
  --restore-periodic-save-interval-ms 10000
```

To avoid the one-time post-launch save while preserving close-time persistence:

```bash
divebell open https://app.example.com --ui --restore-initial-save false
```

Collecting localStorage and sessionStorage from several origins requires a disposable browser target. agent-browser asks compatible Chromium versions to create it in the background and falls back when that option is unsupported. In a headed window, the fallback can briefly bring the temporary target to the foreground during the initial save. The original page has not refreshed. Disabling the initial stage avoids this post-launch switch; periodic saving remains off and close-time saving remains on.

These options also have camelCase keys in `agent-browser.json`:

```json
{
  "restoreInitialSave": false,
  "restorePeriodicSave": true,
  "restoreCloseSave": true,
  "restorePeriodicSaveIntervalMs": 30000
}
```

The corresponding environment variables are `AGENT_BROWSER_RESTORE_INITIAL_SAVE`, `AGENT_BROWSER_RESTORE_PERIODIC_SAVE`, `AGENT_BROWSER_RESTORE_CLOSE_SAVE`, and `AGENT_BROWSER_AUTOSAVE_INTERVAL_MS`. Precedence is CLI option, environment variable, project or explicit config file, user config file, then the Divebell defaults above. An explicit config file replaces the normally discovered project and user files. Divebell includes the effective command-level policy on later page commands and `stop`, so changing the policy does not require manually stopping an already-running daemon.

`--restore-save never` has different semantics: it disables initial, periodic, and close-time saving together. Use it only when no State should be written. Turning off `--restore-initial-save` or leaving periodic saving disabled does not turn off close-time saving. Explicit `--profile`, `--state`, and `--allowed-domains` behavior is unchanged.

## Use the auth vault

Save a password through standard input so it does not appear in shell history:

```bash
printf '%s\n' "$APP_PASSWORD" | \
  divebell auth save app \
    --url https://app.example.com/login \
    --username tester@example.com \
    --password-stdin
```

Log in with:

```bash
divebell auth login app
```

agent-browser opens the saved login URL, waits for common username and password fields, fills them, and submits the form. For non-standard forms, pass `--username-selector`, `--password-selector`, and `--submit-selector` while saving or logging in.

Manage entries:

```bash
divebell auth list
divebell auth show app
divebell auth delete app
```

Lists and details never reveal passwords.

## Security boundary

Profiles, state, and auth only reuse accounts that are already authorized. They do not bypass sign-in or permission checks.

State files usually contain usable session tokens in plaintext. Keep them on trusted storage, add them to `.gitignore`, and never commit or share them with someone who lacks access to the target site. URL scoping narrows the export but does not make the file non-sensitive.
