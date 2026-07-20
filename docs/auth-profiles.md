# Browser Auth Profiles

OpenRuntime can export browser login state to an `.oprprofile` file, then import it into the browser session used by later `openruntime open` commands.

## Export

Use this to export login state from the currently logged-in Chrome session.

```sh
openruntime auth export \
  example.com \
  --output /tmp/example-auth.oprprofile
```

The command opens a local connection page. On first use, the page guides the user to load the OpenRuntime Auth Connector extension. After the extension is installed, the page can start the export directly.

The URL can be a full `http` or `https` URL, or a plain domain such as `example.com`.

Export always creates an `.oprprofile` file. Use `--output` to choose its location; when omitted, OpenRuntime creates a temporary file and prints its path.

## Import

```sh
openruntime auth import /tmp/example-auth.oprprofile
```

Import accepts a file path only. Inline profile content and `--input` are not supported.

After import, later OpenRuntime browser sessions use this login state by default.

Importing another `.oprprofile` merges it with the existing imported state, so multiple sites can be imported one by one.

OpenRuntime uses agent-browser automatic restore for later changes. An imported file is applied once during import, so stale contents are not replayed on every launch over login state that a site has already refreshed.

Login state saved before the agent-browser migration is applied automatically on the first later `openruntime open`; it does not need to be imported again.

## Inspect And Clear

List imported sites:

```sh
openruntime auth list
```

Clear all imported login state:

```sh
openruntime auth clear
```

Clear only one site:

```sh
openruntime auth clear --url https://example.com
```

Clearing one site keeps the other sites signed in. Clearing everything also removes the agent-browser automatic restore record, so removed login state does not return on the next launch.

Use `auth list` to inspect imported auth state.

## Multi-Site Flow

Export and import each site separately:

```sh
openruntime auth export example.com --output /tmp/example-auth.oprprofile
openruntime auth import /tmp/example-auth.oprprofile

openruntime auth export another.example --output /tmp/another-auth.oprprofile
openruntime auth import /tmp/another-auth.oprprofile

openruntime auth list
```
