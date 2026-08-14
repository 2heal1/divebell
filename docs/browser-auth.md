# Browser Authentication and State

Divebell composes agent-browser profiles, state, and auth to provide reusable browser sign-in environments for coding agents.

## What each capability stores

| Capability | Contents | Best use |
| --- | --- | --- |
| Profile | A complete Chrome user configuration, including cookies, web storage, IndexedDB, service workers, and cache | Reuse an account already signed in to local Chrome, or maintain a long-lived isolated browser configuration |
| state | Cookies plus localStorage and sessionStorage for origins visited by the current session | Create a small, explicit login-state file that can be saved and loaded |
| auth | Encrypted username, password, and login-page metadata | Let agent-browser open, fill, and submit a login form |

`profiles` only lists selectable local Chrome profiles; it does not export their data. `auth` stores credentials, not post-login cookies. To copy an existing signed-in session, start from a Profile and then save state.

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

## Infer a replacement state on the provider machine

Always try a scoped state normally on its consumer first and verify the final
URL, navigation or HTTP result, and the task's success condition:

```bash
divebell open https://app.example.net/account --state ./app-state.json
```

If access succeeds, keep using that state. If it redirects to sign-in, returns
401 or 403, shows a signed-out or permission page, returns 404 with other
authentication evidence, or loses an authentication redirect during initial
navigation, send the exact state, target URL, and success condition back to
the state provider.

Run inference on the provider machine, where an explicitly named signed-in
Profile can already access the same target:

```bash
divebell state infer https://app.example.net/account \
  --state ./app-state.json \
  --source-profile "Work" \
  --output ./app-state-inferred.json \
  --expect-url 'https://app.example.net/account*' \
  --expect-text 'Account'
```

`--state` is the deficient consumer state. `--source-profile` is required and
must name the working Profile explicitly; Divebell never guesses or selects a
Profile. `--expect-url` and `--expect-text` are optional but should express the
actual success condition when a successful HTTP response alone is ambiguous.
`--output` is optional. When omitted, Divebell allocates a new sibling path
such as `app-state.inferred.json` without overwriting an existing file.

The command first replays the deficient state in an isolated session with
metadata-only network capture. It then verifies the source Profile against the
same target and expectations. From login redirects, forms, authentication
iframes, client-side navigation, and relevant 401, 403, or
authentication-related 404 responses, it derives sanitized candidate URLs.
It exports and replays a bounded set of smallest scopes, beginning with the
primary URL alone, and preserves the exact first state that passes.

The original state is never changed. The successful output is a normal
mode-`0600` state JSON with `cookies` and `origins`, ready for direct use with
`divebell open --state`. Temporary states and HAR files are removed. Static,
analytics, advertising, telemetry, and monitoring requests are excluded from
candidate scopes.

The command returns the absolute new state path in `data.path` of the standard
command envelope:

```json
{
  "status": "ok",
  "data": {
    "path": "/absolute/path/app-state-inferred.json"
  },
  "meta": {
    "version": 1,
    "command": "state infer https://app.example.net/account"
  }
}
```

Transfer the new state through an authorized secure channel and retry on the
consumer:

```bash
divebell open https://app.example.net/account \
  --state /path/from/provider/app-state-inferred.json
```

Verify the same final URL, HTTP or page result, account, and task-specific
success condition. A plain 404 without authentication evidence produces no
replacement; continue with routing or application debugging instead. If the
input state already passes on the provider, compare the consumer environment
instead of enlarging the state.

Command output and errors omit URL queries and fragments, credentials, cookie
names and values, authorization or cookie headers, POST bodies, and response
bodies. The generated state itself remains sensitive authorization material.

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
