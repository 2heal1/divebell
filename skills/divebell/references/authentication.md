# Authentication state and missing-source diagnosis

Profiles and state files are sensitive, reusable authorization material. Use
only accounts and environments the user has already authorized, keep exports
on trusted storage, and never print a state file's contents.

## Required order for a URL-scoped state

1. First open the exact target normally. Divebell automatically uses a read-only
   copy of the current user's most recently used Chrome Profile when one is
   available. Verify the final URL, navigation or HTTP outcome, account, and
   the user's success condition. If that context has the wrong account, lacks
   authentication, or lacks permission, ask the user for a specific authorized
   state or Profile. Do not enumerate Profiles and choose a different one; the
   built-in most-recently-used default is the only implicit choice.

2. Retry the exact target with the state the user supplied:

   ```bash
   divebell open <target-url> --state <state-path>
   ```

3. Verify the actual access result again. Check the final URL, navigation or HTTP
   outcome, and the user's success condition. Use page or network evidence when
   the `open` result alone does not prove access.

4. If access is normal, continue the user's task. Do not call
   `state diagnose`, switch Profiles, or enlarge the state.

5. Run diagnosis only when this authorized state-backed retry still has one of
   these failure classes:

   - top-level navigation reaches a login or authentication page;
   - a relevant document, XHR, or fetch returns 401 or 403;
   - the page clearly reports signed-out, expired-session, or insufficient
     permission state;
   - a 404 also has authentication evidence; or
   - the first navigation fails and may have lost an authentication redirect.

   Inspect the installed help, then diagnose the same URL and state:

   ```bash
   divebell state diagnose --help
   divebell state diagnose <target-url> \
     --state <state-path> \
     --expect-url '<successful-url-glob>' \
     --expect-text '<successful-page-text>'
   ```

   `--expect-url` and `--expect-text` are optional but should be supplied when
   they express the user's actual success condition. Diagnosis uses a separate
   browser session and replays the first navigation after metadata capture has
   started. It is a post-failure diagnostic, never a recommended pre-open
   check.

6. Review and report the candidates and their confidence/evidence. URLs are
   sanitized for direct use as repeatable `--include-url` values. Without
   `--source-profile`, the candidates are observations only; do not claim they
   were validated. Never infer missing state from an ordinary 404 that has no
   authentication evidence. `not_auth_related` means investigate routing or
   the application instead.

7. If the user explicitly names an already signed-in Profile, rerun diagnosis
   with that exact Profile:

   ```bash
   divebell state diagnose <target-url> \
     --state <state-path> \
     --source-profile <name-or-path> \
     --expect-url '<successful-url-glob>' \
     --expect-text '<successful-page-text>'
   ```

   Never list Profiles and choose one on the user's behalf. The Profile is only
   a comparison and replay source for the failed state; it is not itself the
   diagnosis target. Source comparison reports only cookie/storage counts and
   booleans. It does not expose names or values and does not modify the failed
   state.

8. After the user accepts the candidate scope, open the same target with the
   explicitly named Profile, export a new file, and retry:

   ```bash
   divebell stop
   divebell open <target-url> --profile <name-or-path> --ui
   divebell state save <new-state-path> \
     --url <target-url> \
     --include-url <candidate-url>
   divebell open <target-url> --state <new-state-path>
   ```

   Repeat `--include-url` only for the reviewed minimal set. Verify the final
   URL, HTTP/page result, and the same user success condition. Do not overwrite
   the original state in the first version of this workflow.

9. If diagnosis finds no missing-state evidence, retry the target once with the
   same state and `--ui`, unless an earlier attempt already used `--ui`:

   ```bash
   divebell open <target-url> --state <state-path> --ui
   ```

   `state diagnose` diagnoses a state file only. Never run it for a
   Profile-backed open. If a default or explicitly authorized Profile-backed
   retry fails, use the same one-time `--ui` fallback without diagnosis. If
   headed access also fails, report the verified failure instead of repeating
   diagnosis or UI retries.

## Output and safety interpretation

- High confidence requires a direct login/authentication redirect, a login
  final page, a login form action, or an authentication iframe.
- Cross-origin authentication XHR/fetch failures are normally medium
  confidence.
- A 404 with weak authentication evidence stays low or medium confidence.
- Static resources, analytics, advertising, telemetry, and monitoring origins
  are not state-source candidates.
- Candidate output never includes URL query/fragment, credentials, cookies,
  authorization headers, POST bodies, or response bodies.
- `sourceStateAvailable` reports only whether the explicit source Profile has
  applicable state; its companion counts contain no names or values.
