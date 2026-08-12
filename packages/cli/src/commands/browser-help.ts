import type { CliCommandReference } from "../types/commands.js";

export const browserCommandReferences: CliCommandReference[] = [
  {
    category: "Bridge and Browser",
    usage: "divebell goto <url>",
    description: "Navigate the current Divebell page to another URL without replacing its browser session."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell navigate <url>",
    description: "Alias for `divebell goto`."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell back",
    description: "Go back in the current page history."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell forward",
    description: "Go forward in the current page history."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell reload",
    description: "Reload the current page."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell pushstate <url>",
    description: "Request client-side navigation in the current single-page application."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell read [url] [--filter <text>] [--outline] [--llms <index|full>]",
    description: "Read the current page or fetch agent-readable text from a URL."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell dblclick <ref|selector>",
    description: "Double-click an element."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell type <ref|selector> <text>",
    description: "Type into an element without clearing its current value."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell keyboard <type|inserttext> <text>",
    description: "Enter text through the browser keyboard without selecting an element."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell keydown <key>",
    description: "Hold a keyboard key down."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell keyup <key>",
    description: "Release a held keyboard key."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell hover <ref|selector>",
    description: "Hover over an element."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell tap <ref|selector>",
    description: "Tap an element on a touch-based browser."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell swipe <up|down|left|right> [pixels]",
    description: "Perform a swipe gesture on a supported mobile browser."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell check-element <ref|selector>",
    description: "Check a checkbox without reusing the removed Divebell readiness command name."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell uncheck <ref|selector>",
    description: "Uncheck a checkbox."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell drag <source-ref|selector> <target-ref|selector>",
    description: "Drag one element onto another."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell upload <ref|selector> <file...>",
    description: "Upload one or more files through a file input."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell download <ref|selector> <path>",
    description: "Download a file by clicking an element."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell scroll <up|down|left|right> [pixels]",
    description: "Scroll the current page."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell scrollintoview <ref|selector>",
    description: "Scroll an element into view."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell wait <ref|selector|milliseconds> [--text <text>] [--url <glob>] [--load <state>] [--fn <script>]",
    description: "Wait for an element, text, URL, load state, delay, or page condition."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell get <text|html|value|attr|title|url|count|box|styles|cdp-url> [ref|selector] [name]",
    description: "Read page or element information."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell is <visible|enabled|checked> <ref|selector>",
    description: "Check an element state."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell find <role|text|label|placeholder|alt|title|testid|first|last|nth> <value> <action> [text]",
    description: "Find an element semantically and act on it."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell mouse <move|down|up|wheel> [args]",
    description: "Control the browser mouse."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell set <viewport|device|geo|offline|headers|credentials|media> [value...]",
    description: "Change browser page settings."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell device list",
    description: "List available mobile browser devices."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell cookies [get|set|clear] [args]",
    description: "Inspect or change cookies in the current browser session."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell storage <local|session> [get|set|clear] [args]",
    description: "Inspect or change browser storage."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell tab [new|list|close|<id-or-label>] [url]",
    description: "Create, list, switch, or close browser tabs."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell window new",
    description: "Open a new browser window."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell frame <ref|selector|main>",
    description: "Switch the active page context to an iframe or back to the main frame."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell dialog <accept|dismiss|status> [text]",
    description: "Inspect or respond to a browser dialog."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell pdf <path>",
    description: "Save the current page as a PDF."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell diff <snapshot|screenshot|url> [args]",
    description: "Compare page snapshots, screenshots, or URLs."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell network <route|unroute|requests|request|har> [args]",
    description: "Inspect, record, intercept, block, or mock network traffic."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell errors [--clear]",
    description: "Read or clear page errors."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell console --clear",
    description: "Clear browser console logs."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell highlight <ref|selector>",
    description: "Highlight an element in the browser."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell trace <start|stop> [path]",
    description: "Capture a browser performance trace."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell profiler <start|stop> [path]",
    description: "Capture a browser performance profile."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell video <start|stop|restart> [path]",
    description: "Record the current browser page as video without conflicting with the workflow recording Extension."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell inspect",
    description: "Open browser developer tools for the current page."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell clipboard <read|write|copy|paste> [text]",
    description: "Read or change the browser clipboard."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell stream <enable|disable|status> [--port <number>]",
    description: "Manage browser runtime streaming for the current session."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell react <tree|inspect|renders|suspense> [args]",
    description: "Inspect React state when the page was opened with React DevTools enabled."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell vitals [url] [--json]",
    description: "Measure Core Web Vitals and hydration timing."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell a11y [url] [--tags <tags>] [--selector <selector>] [--json]",
    description: "Run an accessibility audit."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell addinitscript <script>",
    description: "Register a page initialization script in the current browser session."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell removeinitscript <id>",
    description: "Remove a registered page initialization script."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell confirm <id>",
    description: "Approve a browser action waiting for explicit confirmation."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell deny <id>",
    description: "Deny a browser action waiting for explicit confirmation."
  },
  {
    category: "Bridge and Browser",
    usage: "divebell debug <enable|disable|status|scripts|source|breakpoint|logpoint|pause|resume|step-over|step-into|step-out|stack|eval|events> [--cdp-session <id>] [options]",
    description: "Inspect and trace the compiled JavaScript loaded by Chromium without requiring source maps."
  }
];
