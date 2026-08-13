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

## Diagnose a missing state source after access fails

`state diagnose` is a failure diagnostic, not a preflight. Always try the
scoped state normally first and verify the final URL, navigation/HTTP result,
and the success condition for the task:

```bash
divebell open https://app.example.net/account --state ./app-state.json
```

If that access succeeds, continue the task and do not run state diagnosis.
Run diagnosis only after the attempt redirects to sign-in, returns 401 or
403, shows a clear signed-out or permission page, returns 404 with other
authentication evidence, or fails its first navigation in a way that may be
an authentication redirect:

```bash
divebell state diagnose https://app.example.net/account \
  --state ./app-state.json \
  --expect-url 'https://app.example.net/account*' \
  --expect-text 'Account'
```

The command creates an isolated session, loads the failed state before the
first real navigation, starts metadata-only network capture, and then replays
the URL. It reports sanitized candidate URLs with confidence and evidence from
top-level redirects, the final main-frame URL, authentication iframes, login
form actions, meta refreshes, client-side sign-in navigation, and relevant
document/XHR/fetch 401, 403, or authentication-related 404 responses. An
initial navigation error does not discard the capture.

Candidate URLs keep scheme, host, port, and a useful cookie path, but remove
userinfo, query, fragment, and URL parameters such as session identifiers.
Output never includes cookie names or values, authorization/cookie headers,
POST bodies, response bodies, or unrelated Profile sites. Static, analytics,
advertising, telemetry, and monitoring requests are excluded from candidates.

A plain 404 without authentication evidence returns `not_auth_related` and no
suggested `--include-url`. A 404 with only weak authentication evidence is
reported at low or medium confidence; it is not promoted to a high-confidence
missing-state conclusion.

Without a source Profile, candidates are observations only and are not marked
verified. To compare them with an already signed-in Profile, name that Profile
explicitly:

```bash
divebell state diagnose https://app.example.net/account \
  --state ./app-state.json \
  --source-profile "Work" \
  --expect-url 'https://app.example.net/account*' \
  --expect-text 'Account'
```

State diagnosis never guesses or selects a source Profile. The source comparison reports
only cookie and storage-origin counts and booleans. It creates mode-`0600`
temporary scoped states, tries a bounded set of smallest candidate
combinations, and deletes every temporary state and HAR when finished. It does
not update the failed state file.

After reviewing the result, explicitly export a replacement from the named
signed-in Profile and retry the original access:

```bash
divebell stop
divebell open https://app.example.net/account --profile "Work" --ui
divebell state save ./app-state-v2.json \
  --url https://app.example.net/account \
  --include-url https://sso.example.com/login
divebell open https://app.example.net/account --state ./app-state-v2.json
```

Verify the final URL, HTTP/page result, and the same task-specific success
condition again. The first version of `state diagnose` never applies a
candidate, enlarges an export, modifies the original state, or runs during a
successful ordinary `open`.

### Example: open fails first, then diagnosis finds SSO state

```bash
divebell open https://app.example.net/account --state ./app-state.json
divebell get url
# https://sso.example.com/login?code=...  (access verification failed)

divebell state diagnose https://app.example.net/account \
  --state ./app-state.json \
  --source-profile "Work" \
  --expect-url 'https://app.example.net/account*' \
  --expect-text 'Account'
```

The diagnostic output is safe to log. An abridged result is:

```json
{
  "status": "candidates_found",
  "classification": "auth_redirect",
  "initialFailure": {
    "kind": "redirect",
    "httpStatus": 302,
    "finalOrigin": "https://sso.example.com"
  },
  "candidates": [
    {
      "url": "https://sso.example.com/login",
      "confidence": "high",
      "evidence": ["top-level redirect", "final page matched login signals"],
      "sourceStateAvailable": true,
      "sourceState": { "cookies": 2, "origins": 1 },
      "verified": true
    }
  ],
  "suggestedIncludeUrls": ["https://sso.example.com/login"]
}
```

The OAuth query is absent, and the counts do not reveal cookie or storage
names. Re-export to a new file with the suggested URL and retry the same
verification; do not overwrite `app-state.json` automatically.

### Example: an ordinary 404 is not blamed on state

```bash
divebell open https://app.example.net/does-not-exist --state ./app-state.json
# Verify the final URL and the plain Not Found response, with no auth evidence.
divebell state diagnose https://app.example.net/does-not-exist \
  --state ./app-state.json
```

```json
{
  "status": "no_candidates",
  "classification": "not_auth_related",
  "initialFailure": {
    "kind": "http_status",
    "httpStatus": 404,
    "finalOrigin": "https://app.example.net"
  },
  "candidates": [],
  "suggestedIncludeUrls": []
}
```

Continue with routing or application diagnosis instead of adding an
`--include-url`.

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
