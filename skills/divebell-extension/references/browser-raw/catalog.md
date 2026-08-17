# agent-browser raw command catalog

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Use the command-specific files next to this catalog for the exact installed
help of one command. Pass command tokens to `browser.raw` without the
`agent-browser` executable name.

## Top-level installed help

```text
agent-browser - fast browser automation CLI for AI agents

Usage: agent-browser <command> [args] [options]

Start here (for AI agents):
  agent-browser skills get core --full

  Skills ship with the CLI (always version-matched) and include workflow
  patterns, ref/selector usage, and copy-paste examples. Prefer this over
  guessing commands from flag docs alone. Specialized skills cover Electron
  apps, Slack, exploratory testing, and cloud browser providers.

  skills [list]                List available skills
  skills get core              Core usage guide (overview + common patterns)
  skills get core --full       Include full command reference and templates
  skills get <name>            Load a specialized skill (electron, slack, ...)
  skills path [name]           Print skill directory path

Core Commands:
  open <url> [--timeout <ms>] Navigate to URL with an optional lifecycle timeout
  read [url]                 Fetch agent-readable text
  click <sel>                Click element (or @ref)
  dblclick <sel>             Double-click element
  type <sel> <text>          Type into element
  fill <sel> <text>          Clear and fill
  press <key>                Press key (Enter, Tab, Control+a)
  keyboard type <text>       Type text with real keystrokes (no selector)
  keyboard inserttext <text> Insert text without key events
  hover <sel>                Hover element
  focus <sel>                Focus element
  check <sel>                Check checkbox
  uncheck <sel>              Uncheck checkbox
  select <sel> <val...>      Select dropdown option
  drag <src> <dst>           Drag and drop
  upload <sel> <files...>    Upload files
  download <sel> <path>      Download file by clicking element
  scroll <dir> [px]          Scroll (up/down/left/right)
  scrollintoview <sel>       Scroll element into view
  wait <sel|ms>              Wait for element or time
  screenshot [path]          Take screenshot
  pdf <path>                 Save as PDF
  snapshot                   Accessibility tree with refs (for AI)
  eval <js>                  Run JavaScript
  connect <port|url>         Connect to browser via CDP
  close [--all]              Close browser (--all closes every session)

Navigation:
  back                       Go back
  forward                    Go forward
  reload                     Reload page

Get Info:  agent-browser get <what> [selector]
  text, html, value, attr <name>, title, url, count, box, styles, cdp-url

Check State:  agent-browser is <what> <selector>
  visible, enabled, checked

Find Elements:  agent-browser find <locator> <value> <action> [text]
  role, text, label, placeholder, alt, title, testid, first, last, nth

Mouse:  agent-browser mouse <action> [args]
  move <x> <y>, down [btn], up [btn], wheel <dy> [dx]

Browser Settings:  agent-browser set <setting> [value]
  viewport <w> <h>, device <name>, geo <lat> <lng>
  offline [on|off], headers <json>, credentials <user> <pass>
  media [dark|light] [reduced-motion]

Network:  agent-browser network <action>
  route <url> [--abort|--body <json>] [--resource-type <csv>]
  unroute [url]
  requests [--clear] [--filter <pattern>]
  har <start|stop> [path]

Storage:
  cookies [get|set|clear]    Manage cookies (set supports --url, --domain, --path, --httpOnly, --secure, --sameSite, --expires)
                             Or:  cookies set --curl <file> [--domain <host>] (auto-detects JSON/cURL/Cookie-header files)
  storage <local|session>    Manage web storage

Tabs:
  tab [new|list|close|<n>]   Manage tabs

Diff:
  diff snapshot              Compare current vs last snapshot
  diff screenshot --baseline Compare current vs baseline image
  diff url <u1> <u2>         Compare two pages

Debug:
  trace start                Start Chrome DevTools trace
  trace stop [path]          Stop and save Chrome DevTools trace
  profiler start|stop [path] Record Chrome DevTools profile
  memory <operation>         Capture page memory metrics and artifacts
  coverage <operation>       Record JavaScript execution checkpoints
  debug <operation>          Debug compiled JavaScript and add logpoints
  record start <path> [url]  Start video recording (WebM)
  record stop                Stop and save video
  console [--clear]          View console logs
  errors [--clear]           View page errors
  highlight <sel>            Highlight element
  inspect                    Open Chrome DevTools for the active page
  clipboard <op> [text]      Read/write clipboard (read, write, copy, paste)

Streaming:
  stream enable [--port <n>] Start runtime WebSocket streaming for this session
  stream disable             Stop runtime WebSocket streaming
  stream status              Show streaming status and active port

React (requires `open --enable react-devtools`):
  react tree                 Full React component tree (depth id parent name columns)
  react inspect <id>         Inspect one fiber (props, hooks, state, source)
  react renders start        Start recording re-renders via onCommitFiberRoot
  react renders stop [--json] Stop and print render profile
  react suspense [--only-dynamic] [--json]
                             Walk Suspense boundaries + classifier report
                             --only-dynamic hides the "static" list

Performance:
  vitals [url] [--json]      Core Web Vitals (LCP/CLS/TTFB/FCP/INP) +
                             React hydration summary; --json returns full data

Accessibility:
  a11y [url] [--tags <t1,t2>] [--selector <css>] [--json]
                             Run an axe-core accessibility audit on the current
                             page (or url); reports WCAG violations with
                             selectors and fix guidance

SPA:
  pushstate <url>            SPA client-side nav. Auto-detects window.next.router.push
                             (triggers RSC fetch on Next.js); falls back to
                             history.pushState + popstate/navigate events for other frameworks

Init scripts:
  removeinitscript <id>      Remove a script registered via --init-script or addinitscript

Batch:
  batch [--bail] ["cmd" ...]  Execute multiple commands sequentially (args or stdin)
                              --bail stops on first error (default: continue all)

Auth Vault:
  auth save <name> [opts]    Save auth profile (--url, --username, --password/--password-stdin)
  auth login <name>          Login using saved credentials (waits for form fields)
  auth login <name> --credential-provider <plugin> [--item <ref>] [--url <url>]
                             Resolve credentials from a configured plugin
  auth login <name> --username-selector <s> --password-selector <s>
                             Override selectors for one login
  auth list                  List saved auth profiles
  auth show <name>           Show auth profile metadata
  auth delete <name>         Delete auth profile

Plugins:
  plugin add <ref>           Add a plugin from npm or GitHub
  plugin [list]              List configured plugins
  plugin show <name>         Show one configured plugin
  plugin run <name> <type>   Run a command.run or custom plugin request

Confirmation:
  confirm <id>               Approve a pending action
  deny <id>                  Deny a pending action

Sessions:
  session                    Show current session name
  session list               List active sessions

MCP:
  mcp                        Start an MCP stdio server exposing agent-browser tools

Chat (AI):
  chat <message>             Send a natural language instruction (single-shot)
  chat                       Start interactive chat (REPL mode when stdin is a TTY)
  Options: --model <name>, -v/--verbose, -q/--quiet

Dashboard:
  dashboard [start]          Start the dashboard server (default port: 4848)
  dashboard start --port <n> Start on a specific port
  dashboard stop             Stop the dashboard server

Setup:
  install                    Install browser binaries
  install --with-deps        Also install system dependencies (Linux)
  upgrade                    Upgrade to the latest version
  doctor [--fix]             Diagnose install; auto-clean stale files
  dashboard start            Start the observability dashboard
  profiles                   List available Chrome profiles

Snapshot Options:
  -i, --interactive          Only interactive elements
  -c, --compact              Remove empty structural elements
  -d, --depth <n>            Limit tree depth
  -s, --selector <sel>       Scope to CSS selector

Authentication:
  --profile <name|path>      Chrome profile name (e.g., Default) to reuse login state,
                             or a directory path for a persistent custom profile
                             (or AGENT_BROWSER_PROFILE env)
  --restore [name]           Auto-save/restore cookies, localStorage, and sessionStorage.
                             Without a name, uses --session as the restore key
                             (or AGENT_BROWSER_RESTORE env)
  --restore-save <policy>    Restore auto-save policy: auto, always, never (default: auto)
  --restore-initial-save <bool> Save once after the page is quiet for about 2s (default: true)
  --restore-periodic-save <bool> Continue saving while the browser stays open (default: true)
  --restore-close-save <bool> Save before close, shutdown, or relaunch (default: true)
  --restore-periodic-save-interval-ms <ms> Minimum periodic save interval (default: 30000)
                             An interval of 0 disables periodic saves only
                             --restore-save never disables every save stage
  --restore-check-url <glob> Validate restored state against current URL pattern
  --restore-check-text <txt> Validate restored state against visible page text
  --restore-check-fn <js>    Validate restored state against a truthy JS expression
                             Cross-origin saves use a temporary background target when supported;
                             a foreground fallback may briefly appear, but does not refresh the page
  --session-name <name>      Legacy alias for restore persistence key
                             (or AGENT_BROWSER_SESSION_NAME env)
  --state <path>             Load saved auth state (cookies + storage) from JSON file
                             (or AGENT_BROWSER_STATE env)
  --auto-connect             Connect to a running Chrome to reuse its auth state
                             Tip: agent-browser --auto-connect state save ./auth.json
  --headers <json>           HTTP headers scoped to URL's origin (e.g., Authorization bearer token)

Options:
  --session <name>           Isolated session (or AGENT_BROWSER_SESSION env)
  --namespace <name>         Isolate daemon sockets and restore-state directories
                             (or AGENT_BROWSER_NAMESPACE env)
  --executable-path <path>   Custom browser executable (or AGENT_BROWSER_EXECUTABLE_PATH)
  --extension <path>         Load browser extensions (repeatable)
  --init-script <path>       Register a page init script before the first navigation (repeatable)
                             (or AGENT_BROWSER_INIT_SCRIPTS env, comma-separated)
  --enable <feature>         Built-in init scripts: react-devtools (repeatable or comma-separated)
                             (or AGENT_BROWSER_ENABLE env)
  --args <args>              Browser launch args, comma or newline separated (or AGENT_BROWSER_ARGS)
                             e.g., --args "--no-sandbox,--disable-blink-features=AutomationControlled"
  --user-agent <ua>          Custom User-Agent (or AGENT_BROWSER_USER_AGENT)
  --proxy <server>           Proxy server URL (or AGENT_BROWSER_PROXY, HTTP_PROXY, HTTPS_PROXY, ALL_PROXY)
                             Supports authenticated proxies: --proxy "http://user:pass@127.0.0.1:7890"
  --proxy-bypass <hosts>     Bypass proxy for these hosts (or AGENT_BROWSER_PROXY_BYPASS, NO_PROXY)
                             e.g., --proxy-bypass "localhost,*.internal.com"
  --ignore-https-errors      Ignore HTTPS certificate errors
  --allow-file-access        Allow file:// URLs to access local files (Chromium only)
  --hide-scrollbars <bool>   Hide native scrollbars in headless Chromium screenshots (default: true)
                             Use --hide-scrollbars false to keep scrollbars visible
  -p, --provider <name>      Browser provider: ios, browserbase, kernel, browseruse, browserless, agentcore, or plugin name
  --device <name>            iOS device name (e.g., "iPhone 15 Pro")
  --json                     JSON output
  --annotate                 Annotated screenshot with numbered labels and legend
  --screenshot-dir <path>    Default screenshot output directory (or AGENT_BROWSER_SCREENSHOT_DIR)
  --screenshot-quality <n>   JPEG quality 0-100; ignored for PNG (or AGENT_BROWSER_SCREENSHOT_QUALITY)
  --screenshot-format <fmt>  Screenshot format: png, jpeg (or AGENT_BROWSER_SCREENSHOT_FORMAT)
  --headed                   Show browser window (not headless) (or AGENT_BROWSER_HEADED env)
  --webgpu                   Enable WebGPU; uses SwiftShader software Vulkan on Linux, no GPU required (or AGENT_BROWSER_WEBGPU env)
  --cdp <port>               Connect via CDP (Chrome DevTools Protocol)
  --pin-tab                  Pin the session to its bound tab (or AGENT_BROWSER_PIN_TAB env)
                             Commands fail with a tab_gone error instead of falling back
                             to another tab when the bound tab is closed. JSON includes
                             data.targetId and optional sanitized data.lastUrl. Sticky per session.
  --no-pin-tab               Disable a sticky pin previously enabled with --pin-tab
  --color-scheme <scheme>    Color scheme: dark, light, no-preference (or AGENT_BROWSER_COLOR_SCHEME)
  --download-path <path>     Default download directory (or AGENT_BROWSER_DOWNLOAD_PATH)
  --content-boundaries       Wrap page output in boundary markers (or AGENT_BROWSER_CONTENT_BOUNDARIES)
  --max-output <chars>       Truncate page output to N chars (or AGENT_BROWSER_MAX_OUTPUT)
  --allowed-domains <list>   Restrict network domains; rejects CDP, auto-connect, profiles, restore/state replay, direct-page providers, unsafe startup args, iOS/Safari (or AGENT_BROWSER_ALLOWED_DOMAINS)
  --action-policy <path>     Action policy JSON file (or AGENT_BROWSER_ACTION_POLICY)
  --confirm-actions <list>   Categories requiring confirmation (or AGENT_BROWSER_CONFIRM_ACTIONS)
  --confirm-interactive      Interactive confirmation prompts; auto-denies if stdin is not a TTY (or AGENT_BROWSER_CONFIRM_INTERACTIVE)
  --engine <name>            Browser engine: chrome (default), lightpanda (or AGENT_BROWSER_ENGINE)
  --idle-timeout <time>      Shut down daemon after inactivity: 10s, 3m, 1h, or raw ms
                             (default: 1h; 0 disables; dashboard input resets the timer)
  --no-auto-dialog           Disable automatic dismissal of alert/beforeunload dialogs (or AGENT_BROWSER_NO_AUTO_DIALOG)
  --model <name>             AI model for chat (or AI_GATEWAY_MODEL env)
  -v, --verbose              Show tool commands and their raw output
  -q, --quiet                Show only AI text responses (hide tool calls)
  --config <path>            Use a custom config file (or AGENT_BROWSER_CONFIG env)
  --debug                    Debug output
  --version, -V              Show version

Configuration:
  agent-browser looks for agent-browser.json in these locations (lowest to highest priority):
    1. $AGENT_BROWSER_HOME/config.json   User-level defaults (normally ~/.agent-browser)
    2. ./agent-browser.json              Project-level overrides
    3. Environment variables             Override config file values
    4. CLI flags                         Override everything

  Use --config <path> to load a specific config file instead of the defaults.
  If --config points to a missing or invalid file, agent-browser exits with an error.

  Boolean flags accept an optional true/false value to override config:
    --headed           (same as --headed true)
    --headed false     (disables "headed": true from config)
    --hide-scrollbars false (keeps native scrollbars visible in headless Chromium screenshots)

  Extensions from user and project configs are merged (not replaced).

  Example agent-browser.json:
    {"headed": true, "restorePeriodicSave": false, "proxy": "http://localhost:8080"}

  Plugin example:
    {"plugins":[{"name":"vault","command":"agent-browser-plugin-vault","capabilities":["credential.read"]},{"name":"stealth","command":"agent-browser-plugin-stealth","capabilities":["launch.mutate"]}]}

Environment:
  AGENT_BROWSER_CONFIG           Path to config file (or use --config)
  AGENT_BROWSER_SESSION          Session name (default: "default")
  AGENT_BROWSER_NAMESPACE        Namespace for daemon sockets and restore state
  AGENT_BROWSER_RESTORE          Auto-save/restore persistence key
  AGENT_BROWSER_RESTORE_SAVE     Restore save policy: auto, always, never
  AGENT_BROWSER_RESTORE_INITIAL_SAVE One post-launch save after about 2s (default: true)
  AGENT_BROWSER_RESTORE_PERIODIC_SAVE Periodic saves while open (default: true)
  AGENT_BROWSER_RESTORE_CLOSE_SAVE Save before close, shutdown, or relaunch (default: true)
  AGENT_BROWSER_AUTOSAVE_INTERVAL_MS Min ms between periodic saves (default: 30000; 0 disables periodic only)
  AGENT_BROWSER_RESTORE_CHECK_URL URL pattern restored state must match
  AGENT_BROWSER_RESTORE_CHECK_TEXT Page text restored state must contain
  AGENT_BROWSER_RESTORE_CHECK_FN JS expression restored state must satisfy
  AGENT_BROWSER_SESSION_NAME     Legacy auto-save/restore state persistence name
  AGENT_BROWSER_ENCRYPTION_KEY   64-char hex key for AES-256-GCM state encryption
  AGENT_BROWSER_STATE_EXPIRE_DAYS Auto-delete states older than N days (default: 30)
  AGENT_BROWSER_EXECUTABLE_PATH  Custom browser executable path
  AGENT_BROWSER_EXTENSIONS       Comma-separated browser extension paths
  AGENT_BROWSER_INIT_SCRIPTS     Comma-separated paths to page init scripts
  AGENT_BROWSER_ENABLE           Comma-separated built-in init script features (e.g. react-devtools)
  AGENT_BROWSER_HEADED           Show browser window (not headless)
  AGENT_BROWSER_NO_XVFB          Disable automatic Xvfb for headed mode on displayless Linux hosts
  AGENT_BROWSER_WEBGPU           Enable WebGPU (SwiftShader software Vulkan on Linux)
  AGENT_BROWSER_JSON             JSON output
  AGENT_BROWSER_ANNOTATE         Annotated screenshot with numbered labels and legend
  AGENT_BROWSER_DEBUG            Debug output
  AGENT_BROWSER_IGNORE_HTTPS_ERRORS Ignore HTTPS certificate errors
  AGENT_BROWSER_PROVIDER         Browser provider (ios, browserbase, kernel, browseruse, browserless, agentcore, or plugin name)
  AGENT_BROWSER_AUTO_CONNECT     Auto-discover and connect to running Chrome
  AGENT_BROWSER_PIN_TAB          Pin the session to its bound tab (strict tab binding)
  AGENT_BROWSER_ALLOW_FILE_ACCESS Allow file:// URLs to access local files
  AGENT_BROWSER_HIDE_SCROLLBARS  Hide scrollbars in headless Chromium screenshots (default: true)
  AGENT_BROWSER_COLOR_SCHEME     Color scheme preference (dark, light, no-preference)
  AGENT_BROWSER_DOWNLOAD_PATH    Default download directory for browser downloads
  AGENT_BROWSER_DEFAULT_TIMEOUT  Default action timeout in ms (default: 25000)
  AGENT_BROWSER_SESSION_NAME     Legacy auto-save/load state persistence name
  AGENT_BROWSER_STATE_EXPIRE_DAYS Auto-delete saved states older than N days (default: 30)
  AGENT_BROWSER_ENCRYPTION_KEY   64-char hex key for AES-256-GCM session encryption
  AGENT_BROWSER_STREAM_PORT      Override WebSocket streaming port (default: OS-assigned)
  AGENT_BROWSER_STREAM_QUALITY   JPEG quality 0-100 (default: 80)
  AGENT_BROWSER_STREAM_MAX_WIDTH  Cap frame width in pixels (default: the viewport)
  AGENT_BROWSER_STREAM_MAX_HEIGHT Cap frame height in pixels (default: the viewport)
  AGENT_BROWSER_IDLE_TIMEOUT_MS  Auto-shutdown daemon after N ms of inactivity (default: 3600000 = 1h; 0 disables)
                                 Dashboard input resets the timer; headed, Safari/iOS WebDriver, and user-attached browsers are exempt from the default
                                 Provider-owned cloud browsers remain eligible for default cleanup
  AGENT_BROWSER_IOS_DEVICE       Default iOS device name
  AGENT_BROWSER_IOS_UDID         Default iOS device UDID
  AGENT_BROWSER_CONTENT_BOUNDARIES Wrap page output in boundary markers
  AGENT_BROWSER_MAX_OUTPUT       Max characters for page output
  AGENT_BROWSER_ALLOWED_DOMAINS  Comma-separated allowed domain patterns; requires a fresh controllable browser context without profile/session startup args, restore/state replay, or direct-page provider plugins
  AGENT_BROWSER_ACTION_POLICY    Path to action policy JSON file
  AGENT_BROWSER_CONFIRM_ACTIONS  Action categories requiring confirmation
  AGENT_BROWSER_CONFIRM_INTERACTIVE Enable interactive confirmation prompts
  AGENT_BROWSER_NO_AUTO_DIALOG   Disable automatic dismissal of alert/beforeunload dialogs
  AGENT_BROWSER_ENGINE           Browser engine: chrome (default), lightpanda
  AGENT_BROWSER_PLUGINS          JSON plugin registry override
  HTTP_PROXY / HTTPS_PROXY       Standard proxy env vars (fallback if AGENT_BROWSER_PROXY not set)
  ALL_PROXY                      SOCKS proxy (fallback for proxy)
  NO_PROXY                       Bypass proxy for hosts (fallback for proxy-bypass)
  AGENT_BROWSER_SCREENSHOT_DIR   Default screenshot output directory
  AGENT_BROWSER_SCREENSHOT_QUALITY JPEG quality 0-100
  AGENT_BROWSER_SCREENSHOT_FORMAT Screenshot format: png, jpeg
  AI_GATEWAY_URL                 Vercel AI Gateway base URL (default: https://ai-gateway.vercel.sh)
  AI_GATEWAY_API_KEY             API key for the AI Gateway (enables chat command and dashboard AI chat)
  AI_GATEWAY_MODEL               Default AI model (default: anthropic/claude-sonnet-4.6, or --model flag)

Install:
  npm install -g @divebell/agent-browser # npm
  brew install agent-browser             # Homebrew
  cargo install agent-browser            # Cargo
  agent-browser install                  # Download Chrome (first time)

Examples:
  agent-browser open example.com
  agent-browser snapshot -i              # Interactive elements only
  agent-browser click @e2                # Click by ref from snapshot
  agent-browser fill @e3 "test@example.com"
  agent-browser find role button click --name Submit
  agent-browser get text @e1
  agent-browser screenshot --full
  agent-browser screenshot --annotate    # Labeled screenshot for vision models
  agent-browser wait 2000               # Wait for slow pages to settle
  agent-browser --cdp 9222 snapshot      # Connect via CDP port
  agent-browser --cdp 9222 --pin-tab open example.com  # Pin session to its own tab
  agent-browser --auto-connect snapshot  # Auto-discover running Chrome
  agent-browser stream enable            # Start runtime streaming on an auto-selected port
  agent-browser stream status            # Inspect runtime streaming state
  agent-browser --color-scheme dark open example.com  # Dark mode
  agent-browser --profile Default open gmail.com        # Reuse Chrome login state
  agent-browser --profile ~/.myapp open example.com    # Persistent custom profile
  agent-browser profiles                               # List available Chrome profiles
  SESSION="$(agent-browser session id --scope worktree --prefix myapp)"
  agent-browser --session "$SESSION" --restore open example.com  # Auto-save/restore state
  agent-browser session info --json                    # Inspect daemon and restore status
  agent-browser chat "open google.com and search for cats"  # AI chat (single-shot)
  agent-browser chat                                        # AI chat (interactive REPL)
  agent-browser -q chat "summarize this page"               # Quiet mode (text only)

Command Chaining:
  Chain commands with && in a single shell call (browser persists via daemon):

  agent-browser open example.com && agent-browser snapshot -i
  agent-browser fill @e1 "user@example.com" && agent-browser fill @e2 "pass" && agent-browser click @e3
  agent-browser open example.com && agent-browser screenshot

iOS Simulator (requires Xcode and Appium):
  agent-browser -p ios open example.com                    # Use default iPhone
  agent-browser -p ios --device "iPhone 15 Pro" open url   # Specific device
  agent-browser -p ios device list                         # List simulators
  agent-browser -p ios swipe up                            # Swipe gesture
  agent-browser -p ios tap @e1                             # Touch element
```

## Detailed command reference

Complete reference for all agent-browser commands. For quick start and common patterns, see SKILL.md.

## Navigation

```bash
agent-browser open            # Launch browser (no navigation); stays on about:blank.
                              # Pair with `network route`, `cookies set --curl`, or
                              # `addinitscript` to stage state before the first navigation.
agent-browser open <url> [--timeout <ms>]
                              # Launch + navigate (aliases: goto, navigate)
                              # Waits for the page load lifecycle event for 60s by default;
                              # --timeout overrides that navigation wait for one command
                              # Supports: https://, http://, file://, about:, data://
                              # Auto-prepends https:// if no protocol given
agent-browser read [url]      # Fetch agent-readable text, or read rendered active-tab DOM
                              # Explicit URLs send Accept: text/markdown, then try .md if needed
                              # Walks ancestor paths for llms.txt before HTML fallback
                              # --llms and --require-md without URL use the active tab URL
                              # --filter narrows page content to matching heading sections
                              # Honors --allowed-domains, --content-boundaries, and --max-output
                              # Options: --raw, --require-md, --outline, --llms <index|full>, --filter, --timeout <ms>
agent-browser back            # Go back
agent-browser forward         # Go forward
agent-browser reload          # Reload page
agent-browser pushstate <url> # SPA client-side navigation. Auto-detects
                              # window.next.router.push (triggers RSC fetch on Next.js);
                              # falls back to history.pushState + popstate/navigate events.
agent-browser close           # Close browser (aliases: quit, exit)
agent-browser connect 9222    # Connect to browser via CDP port
```

### Pre-navigation setup (one-turn batch)

```bash
agent-browser batch \
  '["open"]' \
  '["network","route","*","--abort","--resource-type","script"]' \
  '["cookies","set","--curl","cookies.curl","--domain","localhost"]' \
  '["navigate","http://localhost:3000/target"]'
```

`open` with no URL gives you a clean launch so any interception, cookies, or init scripts you register take effect on the *first* real navigation. Use for SSR-only debug (`--resource-type script`), protected-origin auth, or capturing fresh `react suspense`/`vitals` state without noise from a prior page.

## Snapshot (page analysis)

```bash
agent-browser snapshot            # Full accessibility tree
agent-browser snapshot -i         # Interactive elements only (recommended)
agent-browser snapshot -c         # Compact output
agent-browser snapshot -d 3       # Limit depth to 3
agent-browser snapshot -s "#main" # Scope to CSS selector
```

## Interactions (use @refs from snapshot)

```bash
agent-browser click @e1           # Click
agent-browser click @e1 --new-tab # Click and open in new tab
agent-browser dblclick @e1        # Double-click
agent-browser focus @e1           # Focus element
agent-browser fill @e2 "text"     # Clear and type
agent-browser type @e2 "text"     # Type without clearing
agent-browser press Enter         # Press key (alias: key)
agent-browser press Control+a     # Key combination
agent-browser keydown Shift       # Hold key down
agent-browser keyup Shift         # Release key
agent-browser hover @e1           # Hover
agent-browser check @e1           # Check checkbox
agent-browser uncheck @e1         # Uncheck checkbox
agent-browser select @e1 "value"  # Select dropdown option
agent-browser select @e1 "a" "b"  # Select multiple options
agent-browser scroll down 500     # Scroll page (default: down 300px)
agent-browser scrollintoview @e1  # Scroll element into view (alias: scrollinto)
agent-browser drag @e1 @e2        # Drag and drop
agent-browser upload @e1 file.pdf # Upload files
```

Clicks fail before dispatch when another element covers the target's click point. The error names the covering element, for example `covered by <div#consent-banner>`. Dismiss or interact with that element, run a fresh snapshot, then retry the original action.

## Get Information

```bash
agent-browser get text @e1        # Get element text
agent-browser get html @e1        # Get innerHTML
agent-browser get value @e1       # Get input value
agent-browser get attr @e1 href   # Get attribute
agent-browser get title           # Get page title
agent-browser get url             # Get current URL
agent-browser get cdp-url         # Get CDP WebSocket URL
agent-browser get count ".item"   # Count matching elements
agent-browser get box @e1         # Get bounding box
agent-browser get styles @e1      # Get computed styles (font, color, bg, etc.)
```

## Check State

```bash
agent-browser is visible @e1      # Check if visible
agent-browser is enabled @e1      # Check if enabled
agent-browser is checked @e1      # Check if checked
```

## Screenshots and PDF

```bash
agent-browser screenshot          # Save to temporary directory
agent-browser screenshot path.png # Save to specific path
agent-browser screenshot --full   # Full page
agent-browser pdf output.pdf      # Save as PDF
```

Headless Chromium screenshots hide native scrollbars for consistent image output. Pass `--hide-scrollbars false` when launching to keep native scrollbars visible.

## Video Recording

```bash
agent-browser open https://example.com     # Launch a browser session first
agent-browser record start ./demo.webm    # Start recording
agent-browser click @e1                   # Perform actions
agent-browser record stop                 # Stop and save video
agent-browser record restart ./take2.webm # Stop current + start new
```

## Wait

```bash
agent-browser wait @e1                     # Wait for element
agent-browser wait 2000                    # Wait milliseconds
agent-browser wait --text "Success"        # Wait for text (or -t)
agent-browser wait --url "**/dashboard"    # Wait for URL pattern (or -u)
agent-browser wait --load networkidle      # Wait for network idle (or -l)
agent-browser wait --fn "window.ready"     # Wait for JS condition (or -f)
```

## Mouse Control

```bash
agent-browser mouse move 100 200      # Move mouse
agent-browser mouse down left         # Press button
agent-browser mouse up left           # Release button
agent-browser mouse wheel 100         # Scroll wheel
```

## Semantic Locators (alternative to refs)

```bash
agent-browser find role button click --name "Submit"
agent-browser find role heading text --name "Skills"     # implicit roles work: <h2>=heading, <ul>=list, top-level <header>=banner
agent-browser find text "Sign In" click
agent-browser find text "Sign In" click --exact      # Exact match only
agent-browser find label "Email" fill "user@test.com"
agent-browser find placeholder "Search" fill "query"
agent-browser find alt "Logo" click
agent-browser find title "Close" click
agent-browser find testid "submit-btn" click
agent-browser find first ".item" click
agent-browser find last ".item" click
agent-browser find nth 2 "a" hover
```

## Browser Settings

```bash
agent-browser set viewport 1920 1080          # Set viewport size
agent-browser set viewport 1920 1080 2        # 2x retina (same CSS size, higher res screenshots)
agent-browser set device "iPhone 14"          # Emulate device
agent-browser set geo 37.7749 -122.4194       # Set geolocation (alias: geolocation)
agent-browser set offline on                  # Toggle offline mode
agent-browser set headers '{"X-Key":"v"}'     # Extra HTTP headers
agent-browser set credentials user pass       # HTTP basic auth (alias: auth)
agent-browser set media dark                  # Emulate color scheme
agent-browser set media light reduced-motion  # Light mode + reduced motion
```

## Cookies and Storage

```bash
agent-browser cookies                     # Get all cookies
agent-browser cookies set name value      # Set cookie
agent-browser cookies clear               # Clear cookies
agent-browser storage local               # Get all localStorage
agent-browser storage local key           # Get specific key
agent-browser storage local set k v       # Set value
agent-browser storage local clear         # Clear all
```

## Network

```bash
agent-browser network route <url>              # Intercept requests
agent-browser network route <url> --abort      # Block requests
agent-browser network route <url> --body '{}'  # Mock response
agent-browser network unroute [url]            # Remove routes
agent-browser network requests                 # View tracked requests
agent-browser network requests --filter api    # Filter requests
agent-browser network request <requestId>      # Full request/response detail incl. body
agent-browser network har start                # Record traffic (embeds text response bodies)
agent-browser network har start --content all  # Embed all bodies (binary as base64)
agent-browser network har start --content none # Sizes and headers only
agent-browser network har stop [output.har]    # Stop and save HAR
```

## Tabs and Windows

```bash
agent-browser tab                              # List tabs with tabId and label
agent-browser tab new [url]                    # New tab
agent-browser tab new --label docs [url]       # New tab with a memorable label
agent-browser tab t2                           # Switch to tab by id
agent-browser tab docs                         # Switch to tab by label
agent-browser tab close                        # Close current tab
agent-browser tab close t2                     # Close tab by id
agent-browser tab close docs                   # Close tab by label
agent-browser window new                       # New window
```

Tab ids are stable strings of the form `t1`, `t2`, `t3`. They're never reused within a session, so the same id keeps referring to the same tab across commands. Positional integers are **not** accepted — `tab 2` errors with a teaching message; use `t2`.

User-assigned labels (`docs`, `app`, `admin`) are interchangeable with ids everywhere a tab ref is accepted. Labels are the agent-friendly way to write multi-tab workflows:

```bash
agent-browser tab new --label docs https://docs.example.com
agent-browser tab new --label app  https://app.example.com
agent-browser tab docs                   # switch to docs
agent-browser snapshot                   # populate refs for docs
agent-browser click @e1                  # ref click on docs
agent-browser tab app                    # switch to app
agent-browser tab close docs             # close by label
```

Labels are never auto-generated, never rewritten on navigation, and must be unique within a session. To interact with another tab, switch to it first: the daemon maintains a single active tab, so refs (`@eN`) belong to the tab that was active when the snapshot ran.

`tab list --json` also reports each tab's CDP `targetId`, accepted anywhere a tab ref is accepted (`tab <targetId>`, `tab close <targetId>`). Target ids stay stable across daemon restarts, unlike `t<N>` ids, which are per-daemon counters. With `--pin-tab` the session is pinned to its bound tab: if that tab is closed, commands fail with a `tab_gone` error instead of falling back to another tab, and `tab new` or `tab list` recover. JSON errors include `code: "tab_gone"` and a recovery object with `data.targetId` plus optional sanitized `data.lastUrl`; batch uses `result` for the same object.

Switching to a tab that the browser discarded to save memory reactivates it, since a discarded tab has no renderer to drive. Reactivation reloads the page and resets its unsaved state, and the switch result adds `"revived": true` so the reload is not silent. A tab whose page is paused by a JavaScript dialog or debugger is alive rather than discarded: the switch leaves it untouched and adds `"dialogBlocked": true` or `"debuggerPaused": true`. Resolve the dialog or resume the debugger and its state is preserved. Closing the active tab onto a discarded successor revives it the same way and reports `"activeTabRevived": true`.

## Frames

```bash
agent-browser frame "#iframe"     # Switch to iframe by CSS selector
agent-browser frame @e3           # Switch to iframe by element ref
agent-browser frame main          # Back to main frame
```

### Iframe support

Iframes are detected automatically during snapshots. When the main-frame snapshot runs, `Iframe` nodes are resolved and their content is inlined beneath the iframe element in the output (one level of nesting; iframes within iframes are not expanded).

```bash
agent-browser snapshot -i
# @e3 [Iframe] "payment-frame"
#   @e4 [input] "Card number"
#   @e5 [button] "Pay"

# Interact directly — refs inside iframes already work
agent-browser fill @e4 "4111111111111111"
agent-browser click @e5

# Or switch frame context for scoped snapshots
agent-browser frame @e3               # Switch using element ref
agent-browser snapshot -i             # Snapshot scoped to that iframe
agent-browser frame main              # Return to main frame
```

The `frame` command accepts:
- **Element refs** — `frame @e3` resolves the ref to an iframe element
- **CSS selectors** — `frame "#payment-iframe"` finds the iframe by selector
- **Frame name/URL** — matches against the browser's frame tree

## Dialogs

By default, `alert` and `beforeunload` dialogs are automatically accepted so they never block the agent. `confirm` and `prompt` dialogs still require explicit handling. Use `--no-auto-dialog` to disable this behavior.

```bash
agent-browser dialog accept [text]  # Accept dialog
agent-browser dialog dismiss        # Dismiss dialog
agent-browser dialog status         # Check if a dialog is currently open
```

## JavaScript

```bash
agent-browser eval "document.title"          # Simple expressions only
agent-browser eval -b "<base64>"             # Any JavaScript (base64 encoded)
agent-browser eval --stdin                   # Read script from stdin
```

Use `-b`/`--base64` or `--stdin` for reliable execution. Shell escaping with nested quotes and special characters is error-prone.

```bash
# Base64 encode your script, then:
agent-browser eval -b "ZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3NyYyo9Il9uZXh0Il0nKQ=="

# Or use stdin with heredoc for multiline scripts:
cat <<'EOF' | agent-browser eval --stdin
const links = document.querySelectorAll('a');
Array.from(links).map(a => a.href);
EOF
```

## Authentication and Plugins

```bash
agent-browser auth save <name> --url <url> --username <user> --password-stdin
agent-browser auth login <name>          # Login using saved credentials
agent-browser auth login <name> --credential-provider <plugin> [--item <ref>] [--url <url>]
agent-browser auth login <name> --username-selector <s> --password-selector <s> [--submit-selector <s>]
agent-browser auth list                  # List saved auth profiles
agent-browser auth show <name>           # Show profile metadata, no passwords
agent-browser auth delete <name>         # Delete a saved profile
agent-browser plugin add <ref>           # Add a plugin from npm or GitHub
agent-browser plugin list                # List configured plugins
agent-browser plugin show <name>         # Show one configured plugin
agent-browser plugin run <name> <type> --payload <json>
                                          # Run an arbitrary plugin request
```

Credential provider plugins run out-of-process over the `agent-browser.plugin.v1` stdio JSON protocol and must declare `credential.read`. Use `--confirm-actions plugin:<name>:credential.read` to require explicit approval before a plugin resolves secrets.

Other capabilities use the same protocol:
- `browser.provider`: `agent-browser --provider <name> open <url>`
- `launch.mutate`: append local launch args, extensions, or init scripts
- `command.run`: `agent-browser plugin run <name> <type> --payload <json>`

`plugin run` is for `command.run` and custom capabilities. Core capabilities and protocol request types use their dedicated command paths.

## State Management

```bash
agent-browser state save auth.json [--include-origin <url>]...  # Save cookies and storage
agent-browser state load auth.json    # Restore saved state
```

## Live Streaming

```bash
agent-browser stream status --json    # Enabled state, port, client count
agent-browser stream enable           # Start the WebSocket stream server
agent-browser stream enable --port 9223
agent-browser stream disable          # Stop it
```

Clients connect to `ws://127.0.0.1:<port>` and receive `frame`, `status`, `tabs`, `url`, and `console` messages. They send `input_mouse`, `input_keyboard`, and `input_touch` to drive the page, `{"type":"config","maxFps":N}` (1 to 120, `0` = uncapped) to cap their own frame rate, and `{"type":"config","pacing":"ack"}` to receive one frame at a time, acknowledged with `{"type":"ack","seq":N}`. Both settings can be declared on the URL instead (`ws://127.0.0.1:<port>/?pacing=ack&maxFps=10`). See streaming.md.

## MCP Server

```bash
agent-browser mcp
agent-browser mcp --tools all
agent-browser mcp --tools core,network,react
```

Starts a stdio Model Context Protocol server. MCP clients should configure the server command as `agent-browser` with args `["mcp"]`. The server defaults to MCP protocol 2025-11-25 and accepts older supported client protocol versions during initialization.

The default tools profile is `core`, which keeps MCP context small for everyday browser automation. Use `--tools all` for the full typed CLI parity surface, or combine profiles with commas, such as `--tools core,network,react`.

Profiles:

- `core` - Default. Navigation, snapshots, interaction, waits, reads, screenshots, JavaScript eval, close, tab basics, and profile discovery
- `network` - Network routes, request inspection, HAR, headers, credentials, offline
- `state` - Cookies, storage, auth, saved state, sessions, profiles, skills
- `debug` - Compiled JavaScript breakpoints, logpoints, pause recovery, console/errors, tracing, profiling, recording, a11y audit, clipboard, plugins, doctor, dashboard, install, upgrade, chat, diff, batch, confirm/deny
- `tabs` - Back/forward/reload, tabs, windows, frames, dialogs
- `react` - React tree/inspect/renders/suspense, vitals, pushstate
- `mobile` - Viewport/device/geolocation/media, touch, swipe, mouse, keyboard
- `all` - Every MCP tool, including the full typed CLI parity surface

Common tools include:

- `agent_browser_tools_profiles`
- `agent_browser_open`
- `agent_browser_snapshot`
- `agent_browser_click`
- `agent_browser_fill`
- `agent_browser_type`
- `agent_browser_press`
- `agent_browser_wait_for_selector`
- `agent_browser_screenshot`
- `agent_browser_get_url`
- `agent_browser_eval`
- `agent_browser_close`

Tool calls use the same config files and environment variables as the CLI. Each tool accepts typed arguments plus `extraArgs` for advanced CLI flags and exact CLI parity. The common `allowedDomains` array maps to `--allowed-domains` and activates the same WebRTC containment and launch-mode restrictions. Tool discovery is paginated and includes read-only/open-world annotations so modern MCP clients can load the large typed surface incrementally. Use the `session` tool argument or `AGENT_BROWSER_SESSION` to isolate browser state.

## Global Options

```bash
agent-browser --session <name> ...    # Isolated browser session
agent-browser --json ...              # JSON output for parsing
agent-browser --headed ...            # Show browser window (not headless; on displayless Linux an Xvfb display starts automatically)
agent-browser --webgpu ...            # Enable WebGPU (SwiftShader software Vulkan on Linux, no GPU needed)
agent-browser --cdp <port> ...        # Connect via Chrome DevTools Protocol
agent-browser --pin-tab ...           # Pin the session to its bound tab (strict tab binding)
agent-browser --no-pin-tab ...        # Disable a sticky pin previously enabled with --pin-tab
agent-browser -p <provider> ...       # Browser provider or configured provider plugin
agent-browser --proxy <url> ...       # Use proxy server
agent-browser --proxy-bypass <hosts>  # Hosts to bypass proxy
agent-browser --headers <json> ...    # HTTP headers scoped to URL's origin
agent-browser --executable-path <p>   # Custom browser executable
agent-browser --extension <path> ...  # Load browser extension (repeatable)
agent-browser --ignore-https-errors   # Ignore SSL certificate errors
agent-browser --hide-scrollbars false # Keep native scrollbars visible in headless Chromium screenshots
agent-browser --help                  # Show help (-h)
agent-browser --version               # Show version (-V)
agent-browser <command> --help        # Show detailed help for a command
```

## Debugging

```bash
agent-browser --headed open example.com   # Show browser window
agent-browser --cdp 9222 snapshot         # Connect via CDP port
agent-browser connect 9222                # Alternative: connect command
agent-browser console                     # View console messages
agent-browser console --clear             # Clear console
agent-browser errors                      # View page errors
agent-browser errors --clear              # Clear errors
agent-browser highlight @e1               # Highlight element
agent-browser inspect                     # Open Chrome DevTools for this session
agent-browser trace start                 # Start recording trace
agent-browser trace stop trace.json       # Stop and save trace
agent-browser profiler start              # Start Chrome DevTools profiling
agent-browser profiler stop trace.json    # Stop and save profile
```

### Compiled JavaScript debugger

```bash
agent-browser debug enable [--tab <tN> | --session <id>] [--all-tabs]
agent-browser debug disable [selectors] [--all-tabs] [--resume]
agent-browser debug status [--tab <tN> | --session <id> | --pause-id <id>]
agent-browser debug scripts [--filter <url>] [--tab <tN> | --session <id>]
agent-browser debug source <script-id> [selectors]
agent-browser debug source search <text> [--filter <url>] [--max-results <count>]
agent-browser debug breakpoint set <script-id> <line> [--column <n>] [--condition <js>] [--strict | --before | --after | --nearest] [--max-lines <n>] [--max-utf16-distance <n>] [--persist] [--tag <key=value>]
agent-browser debug breakpoint list
agent-browser debug breakpoint remove <probe-id>
agent-browser debug logpoint set <script-id> <line> --expression <js>... [--when <js>] [--column <n>] [--strict | --before | --after | --nearest] [--max-lines <n>] [--max-utf16-distance <n>] [--persist] [--tag <key=value>]
agent-browser debug logpoint list
agent-browser debug logpoint remove <probe-id>
agent-browser debug pause [selectors]
agent-browser debug resume [pause selectors]
agent-browser debug step-over|step-into|step-out [pause selectors]
agent-browser debug stack [pause selectors]
agent-browser debug eval <expression> [--frame <index> | --call-frame-id <id>] [pause selectors]
agent-browser debug events [--since <sequence>] [--wait <ms>] [--clear]
```

All locations are one-based. Columns count UTF-16 code units. `--strict` requires the requested line and, when explicitly supplied, the exact column. `--after` is the default. `--before`, `--after`, and `--nearest` use `Debugger.getPossibleBreakpoints` with verified function boundaries, a default three-line bound, and a default 512 UTF-16 code unit distance. `--nearest-forward` remains a compatibility alias for `--after`.

Debugger pause inspection and control are lock-independent. A second CLI or MCP request can use `status`, `stack`, frame `eval`, step, or `resume` while an ordinary command is blocked at a breakpoint. With multiple paused sessions, pause selectors are mandatory.

Logpoints never use the page console as their authoritative channel. They call a random per-connection private Runtime binding with a connection nonce and physical binding ID. Values are serialized with depth, collection, string, and 64 KiB total payload limits. Cycles, accessors, getters, proxies, functions, symbols, `BigInt`, and non-finite numbers are represented safely. `--when` failures and individual expression failures are reported separately. Registry metadata is not trusted from the page payload.

`debug events` is a persistent per-daemon ring capped at 10,000 events and 8 MiB. Use `latestSequence` as the next `--since` cursor. `bufferGap` and `droppedThroughSequence` report ring eviction. `transportGap`, `lastTransportGapSequence`, and the `transport-gap` event report CDP listener lag. The aggregate `gap` field is true for either condition.

See debugging-compiled-js.md for the identity model, lifecycle invalidation, HMR rebinding constraints, Module Federation ownership boundaries, and MCP tool mapping.

## Memory diagnostics

Memory commands require Chrome or Chromium. They reuse the current browser session and return `memory_unsupported_engine` on Lightpanda, Safari, or other unsupported engines.

```bash
agent-browser memory metrics
agent-browser memory status
agent-browser memory sampling start [--sampling-interval <bytes>]
agent-browser memory sampling stop [path] [--top <count>] [--max-size <bytes>]
agent-browser memory snapshot [path] [--no-gc] [--timeout <ms>] [--max-size <bytes>]
agent-browser memory collect-garbage
agent-browser memory cancel
```

`memory metrics` returns the current JavaScript heap used and total sizes plus document, DOM node, and JavaScript event-listener counts. Use it for a cheap trend signal, not as proof of a leak.

`memory sampling start` records allocation call stacks on the current page. The default average sampling interval is 32768 bytes. `memory sampling stop` always stops the original page, saves the full `.heapprofile`, and returns the largest allocation sites with function name, script URL, line, column, and sampled bytes. Switching tabs does not change the capture target.

`memory snapshot` asks for garbage collection by default, then writes each Chrome snapshot chunk directly to a `.heapsnapshot` file. It validates that the artifact contains snapshot metadata, nodes, edges, and strings before reporting success. The default timeout is 120000 milliseconds and the default size limit is 1 GiB. Pass `--no-gc` only when the pre-collection state itself is relevant.

If no output path is supplied, profiles are saved below the runtime temporary directory under `agent-browser-memory/<session>/`. Default artifacts older than 24 hours are cleaned when a new capture starts. Command output contains only summaries and file paths. Raw artifacts are never printed into agent context.

Only one sampling or snapshot task may be active per session. `memory status` includes the capture ID, type, original target, URL, start time, output path when known, and cancellation state. `memory cancel` stops allocation sampling or interrupts a snapshot and removes partial output. Closing the captured page, closing the browser, or stopping the daemon also clears capture state.

JSON failures include a stable `errorCode`: `memory_unsupported_engine`, `memory_capture_active`, `memory_no_capture`, `memory_target_gone`, `memory_capture_cancelled`, `memory_capture_timeout`, `memory_size_limit`, `memory_invalid_artifact`, or `memory_command_failed`.

Heap snapshots and allocation profiles can contain user-visible text, application data, credentials, and tokens. Save them only on trusted local storage, never commit them, and delete them after diagnosis.

## React / Web Vitals

Requires `--enable react-devtools` at launch for the `react ...` commands. `vitals` and `pushstate` are framework-agnostic.

```bash
agent-browser open --enable react-devtools <url>    # Launch with React hook installed
agent-browser react tree                            # Full component tree
agent-browser react inspect <fiberId>               # Props, hooks, state, source
agent-browser react renders start                   # Begin re-render recording
agent-browser react renders stop [--json]           # Stop and print render profile
agent-browser react suspense [--only-dynamic] [--json]  # Suspense boundaries + classifier
                                                         # --only-dynamic hides the "static" list
agent-browser vitals [url] [--json]                 # LCP/CLS/TTFB/FCP/INP + hydration
agent-browser pushstate <url>                       # SPA client-side nav (auto-detects Next router)
```

`vitals` prints a summary by default and uses the same fields as the structured `--json` response.

## Accessibility audit

Runs an embedded axe-core audit with no CDN fetch. The vendored engine runs private partial audits through CDP across the page's frame tree and merges serialized results without page messaging, so page CSP does not block it, page-provided `window.axe` values remain intact, and iframe violations retain their frame selector paths. Accessibility audits require a CDP browser and are not available with Safari or iOS WebDriver sessions. Reports WCAG violations with impact, rule id, fix guidance URL, and failing-node selectors.

```bash
agent-browser a11y                                  # Audit the current page
agent-browser a11y <url>                            # Navigate, then audit
agent-browser a11y --tags wcag2a,wcag2aa            # Only rules with these axe tags
agent-browser a11y --selector "#main"               # Scope audit to a subtree
agent-browser a11y <url> --json                     # Structured results for automation
```

`--json` returns `counts` plus `violations`/`incomplete` arrays; each entry has `id`, `impact`, `help`, `helpUrl`, `tags`, `nodeCount`, and up to 10 `nodes` (`target` selector path arrays, `html` snippet, `failureSummary`). Nested `target` arrays preserve shadow DOM boundaries. `incomplete` lists rules axe could not evaluate automatically — review those manually.

## Init scripts

```bash
agent-browser open --init-script <path>             # Register before first navigation (repeatable)
# `addinitscript` is not accepted by this pinned parser; do not use it through `raw`.
agent-browser removeinitscript <identifier>         # Remove a previously registered init script
```

## cURL cookie import

```bash
agent-browser cookies set --curl <file>                             # Auto-detects JSON/cURL/Cookie-header
agent-browser cookies set --curl <file> --domain example.com        # Scope to a domain
```

Supported formats: JSON array of `{name, value}`, a cURL dump from DevTools -> Network -> Copy as cURL, or a bare Cookie header. Errors never echo cookie values.

## Network route by resource type

```bash
agent-browser network route '*' --abort --resource-type script       # Block scripts only (SSR-lock pattern)
agent-browser network route '*' --resource-type image,font --body '' # Stub images and fonts
```

## Environment Variables

```bash
AGENT_BROWSER_SESSION="mysession"            # Default session name
AGENT_BROWSER_EXECUTABLE_PATH="/path/chrome" # Custom browser path
AGENT_BROWSER_EXTENSIONS="/ext1,/ext2"       # Comma-separated extension paths
AGENT_BROWSER_INIT_SCRIPTS="/a.js,/b.js"     # Comma-separated init script paths
AGENT_BROWSER_ENABLE="react-devtools"        # Comma-separated built-in init script features
AGENT_BROWSER_HIDE_SCROLLBARS="false"        # Keep native scrollbars visible in headless Chromium screenshots
AGENT_BROWSER_WEBGPU="1"                     # Enable the WebGPU launch preset (see references/webgpu.md)
AGENT_BROWSER_NO_XVFB="1"                    # Disable automatic Xvfb for headed mode on displayless Linux
AGENT_BROWSER_PROVIDER="browserbase"         # Browser provider or configured provider plugin
AGENT_BROWSER_STREAM_PORT="9223"             # Override WebSocket streaming port (default: OS-assigned)
AGENT_BROWSER_CONFIG="./agent-browser.json"  # Custom config file
AGENT_BROWSER_CDP="9222"                     # Connect daemon to CDP port or WebSocket URL
AGENT_BROWSER_ALLOWED_DOMAINS="example.com"  # Restrict network domains; requires a fresh controllable browser context without profile/session startup args, restore/state replay, or direct-page provider plugins
AGENT_BROWSER_PLUGINS='[{"name":"vault","command":"agent-browser-plugin-vault","capabilities":["credential.read"]},{"name":"stealth","command":"agent-browser-plugin-stealth","capabilities":["launch.mutate"]}]'
```
