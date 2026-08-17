# `browser.raw`: `read`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["read", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser read - Fetch a URL as agent-readable text

Usage: agent-browser read [url] [--raw] [--require-md] [--llms <index|full>] [--outline] [--filter <text>] [--timeout <ms>]

Fetches a URL as agent-readable text. Omit the URL to read the rendered DOM of
the active tab in the current browser session. Explicit URL reads prefer
markdown with Accept: text/markdown, try the same URL with .md appended when
the first response is not markdown, walk ancestor paths toward / to find the
nearest llms.txt for a matching docs link, fall back to plain text or readable
text extracted from HTML, and print only the document content by default.
Use --outline for a compact heading outline of a single page. Use --llms index
or --llms full for nearest-ancestor llms files; with no URL, --llms and
--require-md use the active tab URL because they depend on HTTP resources.

Options:
  --raw                Print the response body without HTML extraction
  --require-md         Fail unless the response is Content-Type: text/markdown
  --llms <index|full>  Print nearest llms.txt links or llms-full.txt
  --outline            Print a heading outline for the selected page
  --filter <text>      Filter page sections, --llms links/sections, or --outline headings
  --timeout <ms>       Request timeout in milliseconds (default: 10000)

Global Options:
  --json               Output metadata and content as JSON
  --headers <json>     Additional HTTP headers, such as Authorization
  --allowed-domains <list>  Restrict read fetches and redirects to allowed domains
  --content-boundaries Wrap read output in boundary markers
  --max-output <chars> Truncate read output to N chars

Examples:
  agent-browser read
  agent-browser read https://docs.example.com/guide
  agent-browser read https://docs.example.com/guide --filter auth
  agent-browser read https://docs.example.com/guide --outline
  agent-browser read https://docs.example.com --llms index --filter auth
  agent-browser read https://docs.example.com --llms full --filter auth
  agent-browser read docs.example.com/guide --require-md
  agent-browser read https://api.example.com/docs --headers '{"Authorization":"Bearer token"}'
```
