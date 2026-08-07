# Contributing to Divebell

Thank you for contributing to Divebell. This guide explains how to set up
the repository, develop its packages, run the current CLI locally, and verify a
change before opening a pull request.

## Prerequisites

- Node.js 24.13.0. The exact version is recorded in `.nvmrc` and
  `.node-version`.
- pnpm 10.18.1. The required range is recorded in the root `package.json`.
- Git.

If Corepack is available, prepare the repository's pnpm version with:

```bash
corepack enable
corepack prepare pnpm@10.18.1 --activate
```

## Set Up the Repository

Clone the repository and install the root and package dependencies:

```bash
git clone https://github.com/2heal1/divebell.git
cd divebell
pnpm --filter . --filter "./packages/*" install --frozen-lockfile
pnpm build
```

The filtered install matches CI and avoids installing optional demos that may
depend on another local framework checkout.

## Run the Current CLI Locally

From the repository root, run:

```bash
./divebell --help
```

`./divebell` points directly to `packages/cli/dist/bin.js` in this checkout. It
does not use a globally installed or published `divebell` command.

After changing the CLI, Runtime SDK, or Bridge, rebuild the CLI and its referenced
packages before trying the command again:

```bash
pnpm --filter @divebell/cli build
./divebell <command> [options]
```

The CLI keeps page and browser context by working directory. Run
`./divebell` from the repository root for normal CLI development. When a
test needs a different working directory, invoke the same built entry from that
directory:

```bash
/absolute/path/to/divebell/divebell <command> [options]
```

## Repository Layout

- `packages/core`: optional page-side Runtime SDK API.
- `packages/bridge`: connection between a page Runtime and the CLI.
- `packages/cli`: the `divebell` command-line entry point.
- `packages/extension-*`: focused Extension packages.
- `packages/chunk-map`, `packages/modern-plugin`, and
  `packages/rspack-plugin`: build and framework integrations.
- `demos`: representative applications and Extension examples.
- `docs`: user and developer documentation.
- `skills`: reusable instructions and runtime assets for coding agents.
- `scripts`: repository checks, documentation generation, and release tooling.

## Development Workflow

1. Create a focused branch from the latest `main`.
2. Make the smallest complete change that solves the problem.
3. Add or update tests close to the affected package.
4. Build and run the relevant package tests while developing.
5. Run the complete repository check before opening a pull request.

Useful commands:

```bash
# Build every package
pnpm build

# Build one package
pnpm --filter @divebell/cli build

# Test one package
pnpm --filter @divebell/cli test

# Test every package
pnpm test

# Lint package and repository scripts
pnpm lint

# Run the complete pre-submission check
pnpm check
```

Package tests live beside their packages under `test`. Keep tests deterministic
and avoid relying on personal accounts, uncommitted files, or machine-specific
paths.

## Documentation and CLI Help

Keep the documentation aligned with current behavior.

CLI reference pages are generated from the CLI help definitions. After changing
a command name, option, or help text, update and verify them with:

```bash
pnpm docs:cli
pnpm docs:cli:check -- --no-build
```

Do not edit `docs/cli-reference.md` by hand.

## Architecture Boundaries

- Divebell is a web development debugging tool for coding agents. Do not
  reintroduce the old “Agent Runtime” product name.
- Runtime SDK is optional. Browser operations, diagnostics, login reuse, and
  Extensions must continue to work for pages that do not integrate it.
- Put reusable capabilities outside the page in an Extension when possible.
  Use Runtime SDK only for application-internal facts, declared actions, or
  stable wait conditions.
- Modern.js integration belongs in a Modern.js plugin, and Module Federation
  integration belongs in the Module Federation observability plugin. Prefer
  framework hooks over fragile page probing.
- Reproduce and verify a fix with the same account, environment, and user path
  as the reported issue whenever the relevant setup is available.

Read the following before making a change that affects the development loop,
Extensions, or Runtime SDK:

- [Coding Agent Development Debugging Loop](./docs/agent-devloop.md)
- [CLI Extension Development](./docs/cli-extensions.md)
- [Runtime SDK API](./docs/runtime-sdk-api.md)

## Changesets

Add a changeset for a change that affects a published package:

```bash
pnpm changeset
```

Choose the affected package or packages and describe the user-visible result.
Documentation-only changes and repository-local tooling such as the
`./divebell` launcher do not need a changeset.

The release preparation workflow uses each pending changeset in the release
pull request summary, then removes it in that same pull request.

## Pull Request Checklist

Before opening a pull request, confirm that:

- the change has focused tests and they pass;
- `pnpm check` passes;
- generated CLI reference pages are current when CLI help changed;
- documentation matches the current product behavior;
- published package changes include a changeset; and
- no credentials, browser state, local artifacts, or machine-specific paths
  were committed.

Keep the pull request description focused on the problem, the resulting
behavior, and the evidence used to verify it. See
[Release Process](./docs/release.md) for release-maintainer steps; ordinary
contributions should not publish packages manually.
