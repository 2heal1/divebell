# Authentication state

Profiles and state files are sensitive, reusable authorization material. Use
only accounts and environments the user has authorized, keep them on trusted
storage, and never print their contents.

An ordinary `open` uses the most recently used Chrome Profile. Pass
`--no-default-profile` to skip it and use project Restore State.

## Choose the workflow

When `open` cannot access a protected target, identify which browser context it
used and verify the final URL, navigation or HTTP result, current account, and
task-specific success condition:

- If an explicit Profile or state succeeds, keep using it.
- If an explicit state redirects to login, returns 401 or 403, or shows a
  signed-out or permission page, treat the state as insufficient. Do not infer
  missing sources, guess related origins, or broaden it. Follow **Create a
  clean local Profile** when the user authorizes an interactive login.
- If the provider has a verified Profile and another machine specifically
  needs a portable file, follow **Save a portable state**.
- If an explicit or default Profile fails, ask the user to identify an
  authorized Profile or approve a clean interactive login. Never enumerate
  Profiles and choose an account for the user.

A plain 404 without authentication evidence is an application, environment, or
routing problem. Do not treat it as proof of missing browser state.

## Create a clean local Profile

Use this workflow after verified authentication failure, or when no existing
Profile is suitable and the user authorizes an interactive login:

1. Stop a current Divebell browser only when this task owns its lifecycle:

   ```bash
   divebell stop
   ```

2. Open the exact protected target without inheriting a Chrome Profile, state
   file, or project Restore State:

   ```bash
   divebell open <target-url> --ui --temp-profile
   ```

3. Let the user complete sign-in. Verify the exact final URL, account, and page
   success condition before exporting.
4. Export before stopping:

   ```bash
   divebell profile export [new-profile-directory]
   ```

   Omit the directory to let Divebell allocate one. Read the absolute result
   from `data.path`. The command closes the browser first so Chrome flushes
   cookies, web storage, IndexedDB, service workers, cache, preferences, and
   other Profile-owned data.
5. Reopen the same target with the returned directory and repeat the same
   verification:

   ```bash
   divebell open <target-url> --profile <returned-path> --ui
   ```

`--temp-profile` cannot be combined with another browser context such as
`--profile`, `--state`, `--restore`, `--cdp`, or `--allowed-domains`. A new
`open` is rejected while the temporary Profile is active. Export it first, or
run `divebell stop` to discard it.

An exported Profile is a sensitive local browser directory, not a portable
state file. Keep it on trusted storage and do not assume it will work across
operating systems or Chrome installations.

## Save a portable state

Use `state save` only when a provider can already open the exact protected
target with an authorized Profile and another machine needs a smaller,
reviewable state file:

1. Ask the provider to identify the authorized Profile explicitly. Never
   enumerate Profiles and choose an account for the user.
2. Open the exact target with that Profile and verify the final URL, navigation
   or HTTP result, current account, and page success condition:

   ```bash
   divebell open <target-url> --profile <working-profile-name-or-path>
   ```

3. Save a new URL-scoped state from that verified browser session:

   ```bash
   divebell state save <new-state-path> --url <target-url>
   ```

   Use the exact protected application URL for `--url`. Repeat `--include-url`
   only for sign-in URLs already known and reviewed as required. Do not guess
   related origins, add unrelated origins, overwrite an existing state file,
   or commit authorization material.
4. Read the absolute saved path from `data.path`. Transfer it only through an
   authorized secure channel, then verify it on the consumer:

   ```bash
   divebell open <target-url> --state <consumer-state-path>
   ```

State contains cookies plus localStorage and sessionStorage for exported
origins. It intentionally excludes IndexedDB, service workers, cache,
extensions, browser preferences, and other Profile-owned data. If a state-backed
consumer still fails the authentication check, return to **Create a clean local
Profile**. Do not broaden or guess state scope.

## Interpret failures safely

Authentication evidence includes a redirect to a login or SSO page, a 401 or
403 response, a signed-out page, or a permission page. Verify the same target,
account, and task-specific success condition after any replacement context is
opened.

Do not bypass authorization boundaries, automate credentials the user did not
provide for that purpose, copy arbitrary installed Profiles, or expose cookie,
token, header, storage, or Profile contents in command output.
