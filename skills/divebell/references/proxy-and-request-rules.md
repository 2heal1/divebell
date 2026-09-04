# Browser proxy and request rules

Read this reference when the task needs a fixed browser proxy, conditional PAC,
HTTP(S) request replacement, HTTPS-to-local development, or separate browser
daemons with different proxy or request-rule configurations.

Inspect the installed command before constructing an invocation:

```bash
divebell open --help
```

Treat that help as the source of truth for current option names and constraints.

## Choose the mechanism

| Requirement | Mechanism |
| --- | --- |
| Send all browser traffic through one HTTP or SOCKS endpoint | `--proxy <url>` |
| Select `PROXY` or `DIRECT` by URL or host | `--proxy-pac-url <http(s)-url>` |
| Replace matching HTTP(S) resources while the browser performs the target request | `rewrite` in `--request-rules` |
| Fetch replacement content outside the page and synthesize the source response | `fulfill` in `--request-rules` |

Do not describe `rewrite` or `fulfill` as a proxy. They use CDP request
interception in the Divebell-launched Chromium session.

## Fixed proxy and PAC

Use a running fixed proxy endpoint:

```bash
divebell open https://app.example --proxy http://127.0.0.1:8080
```

Use an existing PAC server for conditional routing:

```bash
divebell open https://app.example \
  --proxy-pac-url 'http://127.0.0.1:8080/config?token=example'
```

`--proxy` and `--proxy-pac-url` are mutually exclusive. A PAC URL does not need
to end in `.pac`. Divebell passes it to Chromium without fetching or modifying
the PAC.

Divebell does not start the proxy service or manage its TLS interception.
Certificate generation, installation, trust, HTTPS decryption policy, and
upstream routing remain the proxy tool's responsibility.

## Request rules

Create a JSON file:

```json
{
  "schemaVersion": 1,
  "rules": [
    {
      "id": "remote-assets",
      "match": {
        "urlPrefix": "https://a.com/assets/",
        "resourceTypes": ["Script"]
      },
      "action": {
        "type": "rewrite",
        "targetPrefix": "https://b.com/assets/"
      }
    },
    {
      "id": "local-api",
      "match": { "url": "https://a.com/api/catalog" },
      "action": {
        "type": "fulfill",
        "url": "http://localhost:3100/fixtures/catalog.json",
        "timeoutMs": 5000
      }
    }
  ]
}
```

Pass it on the first open:

```bash
divebell open https://a.com --request-rules ./request-rules.json
```

Each rule has exactly one `url` or `urlPrefix` matcher. `resourceTypes` may
restrict matching to CDP resource types such as `Document`, `Script`, `XHR`, or
`Fetch`.

- `rewrite` continues the browser request to `targetPrefix` plus the unmatched
  source suffix. Browser credentials, CORS, mixed-content policy, and streaming
  behavior still apply.
- `fulfill` makes a separate buffered fetch from Divebell's local control
  process and returns a synthetic response for the source URL. It deliberately
  does not forward browser `Cookie` or `Authorization` headers.

For HTTPS-to-HTTPS resource replacement, normally use `rewrite`. For an HTTPS
source replaced by an HTTP localhost resource, prefer `fulfill` unless that
exact mixed-scheme browser path has been verified.

There is no `redirect` action. Use `rewrite` for browser-side resource
replacement or `fulfill` for a synthetic response. WebSocket rewriting and
streaming `fulfill` responses are not supported.

## Browser-daemon scope

Proxy and request-rule configuration applies to the browser daemon/session,
not one page or tab. Set it on the first `divebell open`. To change or remove
the configuration, run `divebell stop` and open again.

For concurrent daemons with different configurations, use separate working
directories, browser profiles, and agent-browser namespaces. Do not reuse one
daemon and claim that its launch-time proxy changed per page.
