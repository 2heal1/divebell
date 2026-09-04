# Exploring the WebMCP Showcase with Divebell

OpenAI's [WebMCP Showcase](https://developers.openai.com/showcase?view=webmcp-apps)
demonstrates applications designed for people and agents to use together.
Divebell makes those page-native tools available to coding agents from the
terminal.

## Without Divebell

A person can open a showcase application in ChatGPT's in-app browser, or
manually enable experimental WebMCP flags in a compatible Chrome build.

A general coding agent usually has a less direct path:

- inspect screenshots, the DOM, and accessibility output, then infer how to
  operate the interface;
- rely on selectors that can change independently of the application's
  intended agent contract;
- use a separate browser integration to discover WebMCP tools, if that
  integration exposes the experimental protocol at all; and
- build custom handling for page sessions, frames, invocation timeouts, and
  structured results before it can compare the WebMCP contract with the UI.

That is enough to browse a page, but it is awkward for exploring how a product
actually uses WebMCP or for debugging a tool implementation.

## With Divebell

Any coding agent that can run a CLI can use the same short workflow:

```bash
divebell open <webmcp-app-url>
divebell webmcp list --json
divebell webmcp call <tool-name> --input '<json-object>' --json
```

`divebell open` enables the current and transitional Chrome WebMCP features for
a local Chrome launch. `list` exposes the exact tool name, description, input
schema, annotations, frame ID, and imperative or declarative source. `call`
invokes the selected page tool in the current browser session.

The coding agent can then use the rest of Divebell against the same page:

```bash
divebell page-snapshot --json
divebell console --json
divebell errors --json
divebell network requests --json
divebell screenshot webmcp-result.png --full-page
```

This makes the workflow useful for more than a successful demo. The agent can
compare a tool result with the visible UI, inspect browser evidence when they
disagree, change the application code, and repeat the same verification.

## Field Notes

These examples were exercised with Divebell 0.0.26 on September 4, 2026.
Showcase applications can change after that date.

### Verdant Market

[Verdant Market](https://verdant-market-grocery.openai.chatgpt.site/) exposes
nine imperative tools for catalog discovery, product inspection, cart
management, and checkout review.

Divebell discovered the full contract, including the allowed department values
and numeric limits:

```bash
divebell open https://verdant-market-grocery.openai.chatgpt.site/
divebell webmcp list --json
```

A coding agent can search the catalog without interpreting the product grid:

```bash
divebell webmcp call search_products \
  --input '{
    "query":"flour",
    "section":"Pantry & Baking",
    "organic":true,
    "limit":5
  }' \
  --json
```

The live result returned one exact match:

```json
{
  "id": 38,
  "name": "Organic Unbleached All-Purpose Flour",
  "organic": true,
  "price": 6.83,
  "section": "Pantry & Baking",
  "size": "1 pack"
}
```

The same session also exposed a useful debugging signal. Calling
`add_to_cart` for two units updated the visible cart badge to `2`, while a
subsequent `get_cart` call still returned `item_count: 0`, an empty item list,
and a zero subtotal. A screenshot or DOM-only automation can see the badge; a
WebMCP-only client can see the stale result. Divebell can inspect both sides in
one browser session, making contract-to-UI inconsistencies reproducible.

### Margin Editor

[Margin Editor](https://margin-local-docs.openai.chatgpt.site/) exposes ten
imperative tools: three read operations and seven write operations for local
documents and comment threads.

```bash
divebell open https://margin-local-docs.openai.chatgpt.site/
divebell webmcp list --json
divebell webmcp call list_documents --input '{"limit":5}' --json
```

The discovered metadata distinguishes read-only operations from writes and
marks returned page content as untrusted. The read call returned the current
device-local workspace and its stable document IDs without requiring the agent
to scrape the document rail.

This is where schema-first discovery matters. An agent can inspect
`readOnly`, `untrustedContent`, required fields, limits, and enums before it
decides whether to call a tool. An Extension can turn those hints into an
organization's actual approval and validation policy.

## Why This Matters

WebMCP gives applications a stable, application-owned interface for agents.
Divebell gives development agents a practical way to experience and work with
that interface:

| Task | Generic browser workflow | Divebell WebMCP workflow |
| --- | --- | --- |
| Enable experimental support | Configure Chrome flags manually | Enabled for local Chrome by default |
| Discover capabilities | Infer them from the UI | Read normalized tool schemas |
| Invoke an operation | Find elements and simulate input | Call the named tool with JSON |
| Preserve context | Reconstruct auth and page state | Use the current browser session |
| Debug a mismatch | Correlate separate tools manually | Compare tool output, UI, Console, and Network |
| Reuse team policy | Write one-off automation | Package it as a typed Divebell Extension |

WebMCP removes guesswork from using a web application. Divebell removes the
setup and integration work from using WebMCP inside a coding-agent workflow.

## 75-Second Demo

1. **0-8s:** Open Verdant Market and say: "This is a WebMCP app. What can a
   coding agent actually do with it?"
2. **8-20s:** Run `divebell open`, then `divebell webmcp list --json`. Highlight
   the nine discovered tools and the `search_products` schema.
3. **20-38s:** Call `search_products` for organic flour. Show the exact product,
   ID, price, and department returned without DOM scraping.
4. **38-52s:** Call `add_to_cart` for two units. Show the visible cart badge
   update to `2`.
5. **52-65s:** Call `get_cart`. Show that it returns `0`, then place it beside
   the UI state to demonstrate how Divebell catches contract-to-UI drift.
6. **65-75s:** Close with: "WebMCP makes the product agent-native. Divebell lets
   the coding agent discover, use, debug, and verify it."

## Extension Path

The direct CLI is the fastest way to explore one product. For repeated
evaluation across products, a Divebell Extension can call:

```ts
const listed = await options.divebell.browser.webmcp.list();
const safeTools = listed.tools.filter(
  (tool) => tool.annotations?.readOnly === true
);
const tool = safeTools[0];
if (tool === undefined) {
  throw new Error("The page exposes no read-only WebMCP tools.");
}

const result = await options.divebell.browser.webmcp.call(
  tool.name,
  {},
  {
    frameId: tool.frameId,
    timeout: 5000
  }
);
```

An Extension can add a review policy, validate known output shapes, capture
screenshots before and after a call, and produce a repeatable compatibility
report without changing the target application.

## Launch Copy

### English X thread

**1/3**

WebMCP apps are here. Can your coding agent actually use them?

We used Divebell to explore OpenAI's showcase from the terminal: discover every
page tool, inspect its schema, and call it in the live browser session. No MCP
server. No manual Chrome flags.

**2/3**

On Verdant Market, Divebell discovered 9 tools, searched for organic flour, and
added 2 units to the visible cart.

It also caught contract/UI drift: the cart badge showed 2 while the `get_cart`
WebMCP tool still returned 0. That is the kind of bug an agent should surface.

**3/3**

WebMCP makes a product agent-native. Divebell lets the coding agent discover,
use, debug, and verify it with the same page, session, Console, Network, and
screenshots.

https://github.com/2heal1/divebell

#WebMCP #OpenAI #CodingAgents #OpenSource

### 中文 X 串

**1/2**

WebMCP 应用已经来了，但你的 Coding Agent 能直接用吗？

我们用 Divebell 从命令行体验 OpenAI WebMCP Showcase：自动发现页面工具、读取
完整 schema，并在真实浏览器会话中结构化调用。不需要单独部署 MCP Server，也
不需要手动配置 Chrome flags。

**2/2**

在 Verdant Market 中，Divebell 发现了 9 个工具，完成商品搜索和加购，还发现
一个 contract/UI 状态差异：页面购物车显示 2 件商品，`get_cart` 却仍返回 0。

WebMCP 让产品 Agent-native，Divebell 让 Coding Agent 能发现、使用、调试并验证它。

https://github.com/2heal1/divebell
