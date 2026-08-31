# WebMCP in Divebell

Divebell can discover and call tools that the active page registers through Chrome's experimental WebMCP implementation. This capability is available from the CLI and from the typed Extension Browser API. It uses Chrome DevTools Protocol directly; Divebell Bridge and Runtime SDK are not required.

WebMCP remains experimental. Chrome 149 exposes the producer API through `navigator.modelContext` when the `WebMCPTesting` feature is enabled. Current Chrome work is moving the producer API to `document.modelContext` and the launch feature to `WebMCP`. When Divebell launches local Chrome, it enables `WebMCP`, `WebMCPTesting`, and `DevToolsWebMCPSupport` by default so the same workflow works across that transition. Pass `--no-webmcp` to opt out.

## CLI

Let Divebell launch local Chrome, then inspect the active page:

```bash
divebell open https://app.example
divebell webmcp list --json
divebell webmcp call getProductCount --input '{}' --json
divebell webmcp call searchProducts \
  --input '{"query":"Widget"}' \
  --timeout 5000 \
  --json
```

`list` returns `apiVersion`, `tools`, `count`, and the active page identity. Each normalized tool includes its name, description, JSON input schema, CDP frame ID, optional annotations, and `source: "imperative" | "declarative"`. Declarative tools may also include `backendNodeId`.

`call` resolves the tool on the active page, invokes it through `WebMCP.invokeTool`, waits for the matching response event, and cancels the invocation if the timeout expires. Duplicate names in different frames require `--frame-id`.

Stable browser error codes are:

- `webmcp_unsupported`
- `webmcp_tool_not_found`
- `webmcp_tool_ambiguous`
- `webmcp_call_timeout`
- `webmcp_command_failed`

The typed Extension API exposes the same failures as `CommandError` codes in
uppercase, for example `WEBMCP_UNSUPPORTED`. This error is raised only when an
Extension calls `browser.webmcp.list()` or `browser.webmcp.call()`; opening and
using an otherwise unsupported browser remains successful.

`open` remains successful when Divebell connects through `--cdp`, `--auto-connect`, a provider, or a non-Chrome engine. Divebell leaves an external browser's launch configuration unchanged. If that browser does not expose the WebMCP CDP domain, the first `webmcp list` or `webmcp call` reports `webmcp_unsupported` with compatibility guidance; ordinary page operations are unaffected.

Use `divebell open <url> --no-webmcp` when a local Chrome launch must not enable the experimental features. A later WebMCP CLI or typed API call then reports `webmcp_unsupported` unless the selected browser exposes WebMCP independently.

## Typed Extension API

The interfaces are exported from `@divebell/cli`:

```ts
const listed = await options.divebell.browser.webmcp.list();
const tool = listed.tools.find((item) => item.name === "searchProducts");
if (tool === undefined) {
  throw new Error("searchProducts is unavailable");
}

const result = await options.divebell.browser.webmcp.call<{
  products: Array<{ name: string; price: string }>;
}>("searchProducts", { query: "Widget" }, {
  frameId: tool.frameId,
  timeout: 5000
});
```

The main exported types are:

- `DivebellBrowserWebMcpApi`
- `DivebellBrowserWebMcpListResult`
- `DivebellBrowserWebMcpTool`
- `DivebellBrowserWebMcpAnnotations`
- `DivebellBrowserWebMcpCallOptions`
- `DivebellBrowserWebMcpCallResult<T>`

The generic `T` describes the expected `output`; it does not runtime-validate content returned by the page.

## Trust and policy boundary

Every call result includes `trust: "untrusted"`. The output comes from page JavaScript and can contain prompt injection, incorrect facts, or third-party content. Tool annotations such as `readOnly`, `untrustedContent`, `consequential`, and `autosubmit` are hints supplied through the experimental protocol, not authorization enforcement.

An Extension should inspect the tool schema and annotations, validate the result it depends on, and apply its own approval or policy for consequential operations. Discovering a tool does not grant the page permissions beyond the current browser account and page context.

Authoritative protocol references: [Chrome DevTools Protocol WebMCP domain](https://chromedevtools.github.io/devtools-protocol/tot/WebMCP/) and the [WebMCP specification](https://github.com/webmachinelearning/webmcp).
