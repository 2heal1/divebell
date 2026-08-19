# Authentication state

Profiles and state files are sensitive, reusable authorization material. Use
only accounts and environments the user has authorized, keep state files on
trusted storage, and never print their contents.

An ordinary `open` uses the most recently used Chrome Profile. Pass
`--no-default-profile` to skip it and use project Restore State.

## Choose the workflow

When `open` cannot access the target, for example because it redirects to a
login page, identify which browser context it used:

- If it used an explicit state file, that state is deficient for the target.
  Follow **Infer missing state sources**. Inference runs on the state provider's
  machine, where both that state file and an explicitly named working Profile
  are available.
- If it used an explicit Profile or the default latest Profile, do not infer.
  Ask the user or provider to identify a Profile or state authorized for the
  target. Never enumerate Profiles and choose an account for the user.
- If the provider can open the target with an authorized Profile and another
  machine needs a portable state, follow **Save a portable state**.
- If state remains deficient and the user can perform an authorized local
  login, follow **Create a clean local Profile**. This preserves complete
  browser-owned storage but is intended for the same local environment.

Do not use either workflow for an ordinary non-login page or a plain 404.

## Create a clean local Profile

Use a temporary Profile only after the user authorizes an interactive login:

1. Open the exact protected target without inheriting any existing Profile,
   state file, or Restore State:

   ```bash
   divebell open <target-url> --ui --temp-profile
   ```

2. Let the user complete sign-in, then verify the final URL, account, and page
   success condition.
3. Export before stopping:

   ```bash
   divebell profile export [new-profile-directory]
   ```

   Omit the directory to let Divebell allocate one. Read the absolute result
   from `data.path`. The command closes the browser first so Profile-owned data
   is flushed.
4. Reopen the same target with the returned directory and repeat the same
   verification:

   ```bash
   divebell open <target-url> --profile <returned-path> --ui
   ```

`stop` discards an unexported temporary Profile. Exported Profiles contain
cookies, web storage, IndexedDB, service workers, cache, and preferences. Keep
them local and trusted; use scoped state instead when portability is required.

## Save a portable state

Use `state save` when a provider can already open the exact protected target
with an authorized Profile and another machine needs a reusable state file.
Run the workflow on the provider's machine:

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
   only for related sign-in URLs already known to be required; do not guess or
   add unrelated origins. Never overwrite or commit an existing state file.
4. Read the absolute saved path from `data.path`. Transfer the file only through
   an authorized secure channel, then verify it on the consumer:

   ```bash
   divebell open <target-url> --state <consumer-state-path>
   ```

If that state-backed open still has authentication or permission failure
evidence, continue with the inference workflow below. Do not broaden the state
manually.

## Infer missing state sources

### Decide where to run inference

Use `state infer` only on the state provider's machine. That machine must have:

- the state JSON that failed for its consumer;
- an explicitly named Chrome Profile that can access the target; and
- network access to the same application environment.

Do not run inference on the consumer merely because `open --state` failed
there. If the consumer does not have the source Profile, collect the exact
target URL and success condition, then give the command to the provider.

Never enumerate Profiles and choose one. Ask the user or provider to identify
the authorized source Profile explicitly.

### Fill every argument

Inspect installed help before running the command:

```bash
divebell state infer --help
```

Fill the arguments as follows:

- `<url>`: use the exact application URL the inferred state must open.
- `--state <path>`: use the exact deficient state JSON supplied to the
  consumer. Inference reads it as failure evidence and never modifies it.
- `--source-profile <name-or-path>`: use an explicitly selected, already
  signed-in Profile on the provider machine. This argument is required.
- `--output <path>`: optionally choose a new state JSON path. Never use the
  input path. If omitted, Divebell allocates a sibling such as
  `state.inferred.json`, then `state.inferred-2.json` when necessary.
- `--expect-url <glob>`: optionally describe the successful final URL. Use `*`
  for variable suffixes such as query parameters.
- `--expect-text <text>`: optionally provide stable, case-sensitive page text
  that proves the intended account or protected page is available.
- `--timeout <ms>`: optionally set each navigation budget. The default is
  25000; valid values are integers from 1 through 120000.
- Successful output uses the standard command envelope. Read the absolute new
  state path from `data.path`.

Supply `--expect-url`, `--expect-text`, or both whenever a 2xx response alone
does not prove successful access.

### Infer and verify a replacement

Run this on the provider machine:

```bash
divebell state infer <target-url> \
  --state <deficient-state-path> \
  --source-profile <working-profile-name-or-path> \
  --output <new-state-path> \
  --expect-url '<successful-url-glob>' \
  --expect-text '<successful-page-text>'
```

Inference performs these steps in isolated browser sessions:

1. Replay the deficient state and collect metadata-only navigation evidence.
2. Verify that the selected source Profile satisfies the same success checks.
3. Infer sanitized authentication URLs from redirects, login pages and forms,
   authentication iframes, and relevant 401, 403, or authentication-related
   404 responses.
4. Export bounded combinations from the Profile, starting with the primary URL
   alone, and replay each state against the same checks.
5. Preserve the smallest successful combination as a standard state JSON.

The output file is the exact state that passed replay. It contains ordinary
agent-browser `cookies` and `origins` fields, uses mode `0600`, and can be used
directly:

```bash
divebell open <target-url> --state <returned-path>
```

Transfer that file to the consumer only through an authorized secure channel,
then verify the same final URL, navigation or HTTP result, account, and page
success condition there.

### Interpret failures safely

- `STATE_INFER_INPUT_STATE_VALID`: keep using the original state; it already
  passes the supplied checks on the provider machine.
- `STATE_INFER_STATE_LOAD_FAILED`: copy the exact readable state JSON to the
  provider machine and correct `--state`.
- `STATE_INFER_NO_AUTH_SOURCES`: the failure did not expose a credible missing
  authentication source. Investigate routing, environment, or application
  behavior instead of broadening state scope.
- `STATE_INFER_SOURCE_PROFILE_OPEN_FAILED`: correct the explicitly selected
  local Profile name or path.
- `STATE_INFER_SOURCE_PROFILE_ACCESS_FAILED`: refresh or correct that Profile,
  target URL, or success checks.
- `STATE_INFER_VERIFICATION_FAILED`: no bounded candidate combination produced
  a state that passed replay. Do not add unrelated origins manually.

A plain 404 without authentication evidence must not produce a replacement
state. Static, analytics, advertising, telemetry, and monitoring URLs are not
state sources. Command output and errors never include URL queries or
fragments, credentials, cookie names or values, authorization headers, POST
bodies, or response bodies; the state file itself remains sensitive.
