# Browser network control and conditional proxy

Divebell can replace ordinary HTTP(S) resources through Chrome DevTools Protocol (CDP), use one fixed HTTP/SOCKS proxy, or pass an existing PAC URL to a Chromium instance it launches. It does not install, bundle, or require ModHeader, SwitchyOmega, ZeroOmega, or another Chrome extension.

These capabilities are scoped to one Divebell-launched Chromium **browser daemon/session**. They are not per-page or per-tab settings. Set them on the first `divebell open` for that browser session. To change or remove `--proxy`, `--proxy-pac-url`, or `--network-rules`, run `divebell stop` and then open again. Divebell returns `BROWSER_PROXY_RESTART_REQUIRED` instead of quietly claiming a running browser changed configuration.

For concurrent browser daemons, use separate working directories, browser profiles, and agent-browser namespaces. Divebell stores each directory's latest-page context by cwd, so separate cwd values prevent one process from reusing another process's network-control record. A shared `DIVEBELL_HOME` is supported: each control process uses its own generated configuration file and loopback control URL.

## Browser proxy

Keep using the existing fixed endpoint when it is sufficient:

```sh
divebell open https://app.example --proxy http://127.0.0.1:8080
```

When a proxy tool already serves a PAC file, pass its HTTP(S) URL directly:

```sh
divebell open https://app.example --proxy-pac-url 'http://127.0.0.1:8080/config?token=example'
```

`--proxy` and `--proxy-pac-url` are mutually exclusive. A PAC URL may use any path or query string; it does not need to end in `.pac`. Divebell accepts credential-free HTTP(S) URLs without fragments and passes the normalized URL to Chromium without fetching or rewriting the PAC. PAC configuration is supported only for Chromium launched by Divebell; CDP-connected, auto-connected, provider-managed, and non-Chrome browsers fail with `BROWSER_PROXY_EXTERNAL_BROWSER_UNSUPPORTED`.

Divebell does not start the proxy service or manage its lifecycle. The endpoint or PAC server must already be running. TLS certificate installation, HTTPS decryption, TLS interception policy, PAC contents, and upstream proxy behavior remain the proxy tool's responsibility.

## Request rules

Pass a JSON file with `--network-rules`:

```json
{
  "schemaVersion": 1,
  "rules": [
    {
      "id": "cdn-to-local",
      "match": { "urlPrefix": "https://a.com/assets/" },
      "action": {
        "type": "rewrite",
        "targetPrefix": "http://localhost:3100/assets/"
      }
    },
    {
      "id": "fixture",
      "match": { "url": "https://a.com/api/catalog" },
      "action": {
        "type": "fulfill",
        "url": "https://b.com/fixtures/catalog.json",
        "timeoutMs": 5000
      }
    }
  ]
}
```

Use it on the first open:

```sh
divebell open https://a.com --network-rules ./network-rules.json
```

Each rule needs a lowercase `id`, exactly one source matcher (`url` or `urlPrefix`), and one action. URLs are HTTP(S) only. `resourceTypes` can limit a rule to CDP resource-type strings such as `Document`, `Script`, `XHR`, or `Fetch`.

| Action | CDP behavior | What the page can observe |
| --- | --- | --- |
| `rewrite` | Chromium continues the intercepted request to `targetPrefix` plus the source suffix. The replacement target is requested by Chromium; Divebell does not make an extra control-plane fetch. | The initiated resource URL and DOM reference remain the source URL; Chrome response metadata can still expose implementation-dependent final URL details. The target receives a browser-side request, so do not use this action to bypass browser credential or CORS boundaries. |
| `fulfill` | Divebell's local control process makes a separate HTTP fetch to `url`, buffers the response, and fulfills the original request. | The browser receives a synthetic response for the source URL; it does not make a second request to the target. Browser `Cookie` and `Authorization` headers are deliberately not forwarded to the control-plane fetch. |

`fulfill` follows redirects for its own fetch, strips hop-by-hop/encoding headers after decoding, has a default 15-second timeout (maximum configurable value 60 seconds), and limits buffered bodies to 10 MiB. A failed or timed-out control fetch fails the intercepted request rather than leaving it paused.

Divebell v1 does not expose a request `redirect` action. Real browser navigation after a synthetic 3xx response was not reliable in Chromium verification. Use `rewrite` for `https://a.com` to `https://b.com` resource replacement. For an HTTPS source replaced by `http://localhost:<port>/path`, prefer `fulfill` in v1 unless the exact browser path has separately been verified; this avoids claiming mixed-scheme browser continuation support.

## Supported boundary

This is intentionally an HTTP(S) resource replacement facility, not a general network man-in-the-middle layer.

- WebSocket upgrades are not rewritten, fulfilled, or proxied through CDP request rules.
- EventSource/SSE is not supported for `fulfill`: it requires a truly streaming response and Divebell buffers fulfilled bodies.
- HMR is not guaranteed. WebSocket-based HMR is unsupported; HTTP polling HMR may work only as an ordinary HTTP request.
- Service Worker fetch handling and cached responses are outside the supported rule surface. Divebell does not attach its interception controller to service-worker targets.
- True request redirection is not supported in v1. A synthetic 3xx response is not exposed because reliable browser follow-up navigation was not verified; use `rewrite` when resource replacement is required.
- Responses that depend on browser cookies, browser-integrated authentication, client TLS certificates, or response streaming should not use `fulfill`; use `rewrite` or configure the proxy tool instead.
- CDP interception can conflict with another tool that independently owns the same browser's Fetch domain. Divebell creates its own target sessions and cleans them up with `divebell stop`, but concurrent external CDP mutation is not a supported setup.

## Errors

| Code | Meaning |
| --- | --- |
| `BROWSER_NETWORK_RULES_READ_FAILED` | The rules file could not be read or parsed as JSON. |
| `BROWSER_NETWORK_RULES_INVALID` | The JSON fails the documented rules schema or URL safety checks. |
| `BROWSER_PROXY_CONFIGURATION_CONFLICT` | `--proxy` and `--proxy-pac-url` were both requested. |
| `BROWSER_PROXY_PAC_URL_INVALID` | The PAC URL is not an allowed HTTP(S) URL. |
| `BROWSER_PROXY_EXTERNAL_BROWSER_UNSUPPORTED` | A PAC URL requires Divebell-launched Chromium. |
| `BROWSER_PROXY_RESTART_REQUIRED` | A change was requested after the browser daemon/session was already configured. Stop and reopen. |
