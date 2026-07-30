# Divebell CLI Extension Development

This reference describes the required development workflow for a Divebell CLI
Extension.

Use an Extension for reusable work that can be completed outside the page,
including account or environment preparation, page-context recognition,
focused diagnostics, and team verification. Use Runtime SDK only when the
application itself must expose internal state, events, or allowed Actions. Use
the CLI directly for one-off page operations.

## Extension structure

A typical TypeScript Extension package contains:

```text
my-extension/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.mts
│   ├── commands/
│   └── hooks/
└── dist/
```

Start a public single-Extension package with:

```json
{
  "name": "@scope/my-extension",
  "version": "1.0.0",
  "description": "Divebell CLI Extension",
  "type": "module",
  "main": "./dist/extension.mjs",
  "types": "./dist/extension.d.mts",
  "exports": {
    ".": {
      "types": "./dist/extension.d.mts",
      "import": "./dist/extension.mjs"
    }
  },
  "files": [
    "dist/**/*"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json --pretty false"
  },
  "engines": {
    "node": ">=24.0.0 <25"
  },
  "devDependencies": {
    "@divebell/cli": "^0.1.3",
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0"
  },
  "divebell": {
    "schemaVersion": 1,
    "extensions": ["./dist/extension.mjs"]
  },
  "publishConfig": {
    "access": "public"
  }
}
```

`main`, `types`, and `exports` are standard npm entries.
`divebell.extensions` is the Divebell loading manifest and may list more than
one Extension file. `files` limits the published package to built output.

Use:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.mts"]
}
```

Published Extensions must be self-contained. Do not publish runtime
`dependencies`, `optionalDependencies`, or `peerDependencies`; bundle required
implementation code and assets into the output. Keep build tools and types in
`devDependencies`.

## Entry design

The Extension entry declares capabilities only.

```ts
import type { DivebellExtensionDefinition } from "@divebell/cli";

const extension: DivebellExtensionDefinition = {
  schemaVersion: 1,
  name: "my-extension",
  commands: [{
    name: "foo",
    commandReferences: [{
      category: "Extensions",
      usage: "divebell foo inspect",
      description: "Inspect the current page."
    }],
    run: async options =>
      await (await import("./commands/foo.mjs")).runFoo(options)
  }]
};

export default extension;
```

Rules:

- Load Command and Hook implementations with dynamic imports.
- Do not statically import implementation modules into the entry.
- Do not perform initialization, file reads, network requests, or top-level
  awaits in the entry.
- Include `.js` or `.mjs` in relative dynamic import paths.
- Keep the entry small enough that unrelated CLI commands do not load business
  logic early.

## Commands

A Command is the main Agent-facing capability.

```ts
import type { CliExtensionRunOptions } from "@divebell/cli";

export async function runFoo(
  options: CliExtensionRunOptions
): Promise<unknown> {
  const action = options.args.command[1] ?? "inspect";
  const name = options.args.options.get("name")?.at(-1) ?? "default";
  return { action, name };
}
```

A Command must:

- Define useful `commandReferences` for `divebell <command> --help`.
- Validate required positional arguments.
- Validate accepted option names and values.
- Handle repeated options and invalid combinations deterministically.
- Return data directly on success.
- Throw a clear error on failure.
- Handle `options.page === undefined` when a page is required.
- Use `options.withLoading` only around noticeable work.

`options.args.command[0]` is the top-level Command name. Later entries are
positional arguments. Repeated options are stored as arrays, and a flag is the
string `"true"`. Use `getOptionValue`, `getOptionValues`, and
`getNumberOption` from `@divebell/cli` when appropriate, but still validate
accepted arguments, option names, values, and invalid combinations.

`options.headers` contains the exact effective headers from the latest
successful `divebell open --headers`, or `undefined`. Protect it as sensitive
data. Wrap noticeable work with `options.withLoading`; work under 400
milliseconds stays silent, while slower work shares one terminal animation.

Use `requiresOpenHook: true` only when the Command depends on setup completed
by its own `open` Hook.

## Extension dependencies

Declare another Extension by stable Extension name:

```ts
{
  schemaVersion: 1,
  name: "order-workflow",
  requires: ["account-tools"]
}
```

Call its Command through `options.runExtension`.

A nested Command:

- Shares the current page, session, Runtime selection, browser access, and
  nested `runExtension` capability.
- Returns its raw result.
- Does not emit a second CLI result.
- Does not trigger lifecycle Hooks.

A Command may call its own Extension without listing itself in `requires`.
Calls to another Extension must be declared. Cyclic calls and chains deeper
than 16 levels fail with the full call chain. Missing required Extensions
prevent the dependent Extension from loading.

Do not use Hook ordering as a substitute for `requires`.

## Hooks

Hooks are optional and should contain only lifecycle-specific work.

### `open`

Runs before the browser opens the page. Use it only for preparation that must
happen at that stage, such as returning page initialization scripts.

The Hook receives the parsed effective `open --headers` value as
`options.headers`, or `undefined`. Divebell stores the same object for later
Commands. Scripts from multiple Extensions are combined in Hook order and
isolated so one script failure does not block later scripts or Divebell's own
page setup.

### `detectStack`

Runs only for:

```bash
divebell stack
```

It may return one detection, multiple detections, or no result.

```ts
return {
  id: "modernjs",
  name: "Modern.js",
  evidence: ["window._MODERNJS_ROUTE_MANIFEST"],
  command: "foo"
};
```

Rules:

- `command` must name a top-level Command from the same Extension.
- Omit `command` when there is no follow-up Command.
- Keep `evidence` short.
- Do not include secrets or full page configuration.
- Do not move stack detection into `open`.

### `close`

Cleans up resources created during the matching successful `open`.

Only Extensions that completed the matching `open` receive `close`. It runs
when the page is stopped or replaced by another `open` in the same working
directory. Cleanup failures are reported without blocking the page lifecycle.

One Hook failure must not make unrelated Extensions or the page unusable.

Hooks run in parallel by default. Use `before` and `after` only when ordering is
genuinely required. They control ordering only; required Extensions belong in
`requires`. Divebell runs `close` in reverse `open` batch order. Hook results
are not passed to later Hooks.

## Command-provided Skills

A complex Command may provide a `SKILL.md`:

```ts
{
  name: "foo",
  skill: {
    path: absoluteSkillPath
  }
}
```

The Skill should contain decision logic and verification guidance that is not
already available from command help.

Do not repeat syntax from `divebell <command> --help`.

## Use the Extension API

Use `options.divebell.browser` to operate the page and collect screenshot,
Network, Console, memory, or code-execution evidence. Use `targets`, `snapshot`,
`events`, `actions`, `runAction`, and `waitFor` only when the page already
exposes a connected Runtime.

Browser capabilities do not require Runtime SDK. After an Action, verify the
page result or wait for explicit Runtime state; `options.page` existing or an
Action returning successfully is not proof of the business result.

## Local development

Build the Extension, then load its generated entry directly:

```bash
pnpm build
DIVEBELL_EXTENSIONS_DIR="$PWD/dist/extension.mjs" divebell --help
DIVEBELL_EXTENSIONS_DIR="$PWD/dist/extension.mjs" divebell foo --help
DIVEBELL_EXTENSIONS_DIR="$PWD/dist/extension.mjs" divebell foo inspect
```

For page-dependent behavior:

```bash
export DIVEBELL_EXTENSIONS_DIR="$PWD/dist/extension.mjs"
divebell open https://example.com --no-bridge
divebell foo
divebell stack --refresh
divebell stop
```

After a change, return to the same account, environment, and user journey.

## Package and install locally

Inspect the real package contents:

```bash
npm pack --dry-run
```

Do not include source secrets, test accounts, login state, recordings, or
unrelated large files. Install the generated archive for the final check:

```bash
divebell extensions add ./scope-my-extension-1.0.0.tgz
divebell extensions list
divebell --help
divebell foo --help
```

## Verification checklist

Before delivery, verify:

1. `divebell --help` discovers the Command without entry-loading errors.
2. `divebell <command> --help` shows correct usage and descriptions.
3. Unrelated commands do not load implementation modules.
4. Page-independent Commands work without `divebell open`.
5. Page-dependent Commands provide a clear next step when no page exists.
6. Invalid arguments and options produce deterministic failures.
7. `open`, `stack`, and `stop` trigger the corresponding Hooks when present.
8. A Hook failure does not block unrelated Extensions.
9. The Command works on a representative real page.
10. Final success is verified from page or Runtime evidence.
11. Tests pass.
12. `npm pack --dry-run` contains only intended distributable files.

When developing inside the Divebell repository, also run the
`@divebell/cli` Extension tests to cover loading, Hook isolation, and structured
output.
