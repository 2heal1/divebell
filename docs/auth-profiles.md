# Browser Auth Profiles

OpenRuntime can export browser login state to an `.oprprofile` file, then import it into the OpenRuntime browser profile used by later `openruntime open` commands.

## Export

Use this to export login state from the currently logged-in Chrome session.

```sh
openruntime auth export \
  --url example.com \
  --output /tmp/example-auth.oprprofile
```

The command opens a local connection page. On first use, the page guides the user to load the OpenRuntime Auth Connector extension. After the extension is installed, the page can start the export directly.

`--url` accepts either a full `http` or `https` URL, or a plain domain such as `example.com`.

## Import

```sh
openruntime auth import --input /tmp/example-auth.oprprofile
```

After import, later OpenRuntime browser sessions use this login state by default.

Importing another `.oprprofile` merges it with the existing imported state, so multiple sites can be imported one by one.

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

Use `auth list` to inspect imported auth state.

## Multi-Site Flow

Export and import each site separately:

```sh
openruntime auth export --url example.com --output /tmp/example-auth.oprprofile
openruntime auth import --input /tmp/example-auth.oprprofile

openruntime auth export --url another.example --output /tmp/another-auth.oprprofile
openruntime auth import --input /tmp/another-auth.oprprofile

openruntime auth list
```
