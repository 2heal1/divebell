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
  missing sources, guess related origins, or broaden it. Follow **Handle a
  state failure on its consumer**.
- If the provider has a verified Profile and another machine specifically
  needs a portable file, follow **Save a portable state**.
- If the default Profile fails or has the wrong account, follow **Let the user
  select a local Profile**.

A plain 404 without authentication evidence is an application, environment, or
routing problem. Do not treat it as proof of missing browser state.

## Let the user select a local Profile

Use the most recently used Chrome Profile by default. Only after its access or
account verification fails should the agent list the selectable local Profiles:

```bash
divebell profiles
```

Show the selectable metadata and ask the user to choose. Never infer the
intended identity or choose a Profile on the user's behalf. After the user
selects one, stop the current browser only when this task owns its lifecycle,
then reopen the exact target:

```bash
divebell stop
divebell open <target-url> --profile <user-selected-profile> --ui
```

Verify the exact final URL, account, and page success condition. Profiles are
local browser data; do not copy them between machines as an authentication
handoff.

## Save a portable state

Use `state save` only when a provider can already open the exact protected
target with an authorized Profile and another machine needs a smaller,
reviewable state file:

1. Open the exact target normally and verify the final URL, navigation or HTTP
   result, current account, and page success condition. If the default Profile
   is wrong or cannot authenticate, follow the user-selection workflow above.
2. If the user selected a Profile, reopen with that exact Profile:

   ```bash
   divebell open <target-url> --profile <user-selected-profile>
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
consumer still fails the authentication check, follow the consumer failure
workflow below. Do not broaden or guess state scope.

## Handle a state failure on its consumer

When a transferred state redirects to login, returns 401 or 403, or shows a
signed-out or permission page, the consumer must authenticate again. Do not ask
for a Profile copied from the provider machine.

For manual sign-in, retry once in a visible browser unless the failed attempt
already used `--ui`:

```bash
divebell open <target-url> --state <consumer-state-path> --ui
```

Let the user complete the login, then verify the exact target, account, and
success condition. If the user explicitly provides login information instead,
save the password through standard input and use the auth vault:

```bash
printf '%s\n' "$APP_PASSWORD" | \
  divebell auth save <name> \
    --url <login-url> \
    --username <username> \
    --password-stdin
divebell auth login <name>
```

Never print the password or place it directly in command arguments. Do not
automate credentials the user did not provide for this purpose.

## Interpret failures safely

Authentication evidence includes a redirect to a login or SSO page, a 401 or
403 response, a signed-out page, or a permission page. Verify the same target,
account, and task-specific success condition after any replacement context is
opened.

Do not bypass authorization boundaries, automate credentials the user did not
provide for that purpose, copy arbitrary installed Profiles, or expose cookie,
token, header, storage, or Profile contents in command output.
