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
divebell open <webmcp-app-url> --ui --no-default-profile
divebell webmcp list --json
divebell webmcp call <tool-name> --input '<json-object>' --json
```

`divebell open` enables the current and transitional Chrome WebMCP features for
a local Chrome launch. The isolated profile avoids unrelated extensions and
existing Chrome state while exploring public demos. `list` exposes the exact
tool name, description, input schema, annotations, frame ID, and imperative or
declarative source. `call` invokes the selected page tool in the current browser
session.

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

## Margin Editor

These examples were exercised with Divebell 0.0.26 on September 4, 2026.
Showcase applications can change after that date.

[Margin Editor](https://margin-local-docs.openai.chatgpt.site/) exposes ten
imperative tools: three read operations and seven write operations for local
documents and comment threads.

```bash
divebell open https://margin-local-docs.openai.chatgpt.site/ \
  --ui \
  --no-default-profile
divebell webmcp list --json
divebell webmcp call create_document \
  --input '{
    "title":"Divebell WebMCP demo",
    "content":"Created through WebMCP."
  }' \
  --json
```

`create_document` opens the new document in Margin, so the document rail and
editor visibly change. It is a write operation and should be used only in this
public, device-local demo workspace. `list_documents` remains useful for
read-only discovery, but it deliberately does not change the UI.

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

**1/2**

WebMCP apps are here. Can your coding agent actually use them?

Divebell explored OpenAI's Margin Editor from the terminal: discovered 10 page
tools, inspected their schemas and safety annotations, and created a document
in the live browser session. No MCP server. No manual Chrome flags.

**2/2**

WebMCP makes a product agent-native. Divebell lets the coding agent discover,
use, debug, and verify it with the same page, session, Console, Network, and
screenshots.

https://github.com/2heal1/divebell

#WebMCP #OpenAI #CodingAgents #OpenSource
