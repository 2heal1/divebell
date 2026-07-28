# OpenRuntime Release Process

Chinese version: [OpenRuntime 发版流程](release.zh-CN.md)

OpenRuntime publishes all public packages and the browser-recording runtime through one controlled release. Merging an ordinary feature or fix pull request into `main` does not publish anything.

## Release scope

One release uses the same version for:

- Runtime Core, Bridge, Chunk Map, the Modern.js plugin, and the Rspack plugin;
- OpenRuntime CLI;
- `@openruntime/extension-code-usage`;
- `@openruntime/extension-troubleshooting`;
- `@openruntime/extension-imitate`;
- `@openruntime/extension-memory`; and
- the runtime bundle used by `record-openruntime-workflow`.

The GitHub Release contains the recording runtime bundle and its SHA-256 checksum. npm packages are published before the GitHub Release is made public.

## One-time setup for new packages

npm can configure trusted publishing only after a package exists. When a package name is new, publish the current OpenRuntime version once with a maintainer account, then configure its GitHub Actions trust relationship.

Prerequisites:

- the package rename and release-script updates are already merged locally;
- the maintainer has write access to every npm package and account-level two-factor authentication enabled;
- Node.js 24.x is installed; and
- npm is 11.15.0 or newer.

Sign in, build, check the package archives, and publish the first version:

```bash
npm install --global npm@11.15.0
npm login
pnpm install --frozen-lockfile
pnpm run build
pnpm run release:npm:pack -- --output-dir /tmp/openruntime-npm-bootstrap
pnpm run publish:packages -- --output-dir /tmp/openruntime-npm-bootstrap --otp 123456
```

Replace `123456` with the current one-time password from the maintainer's authenticator. The same value is forwarded to each `npm publish`; if it expires before all packages finish, rerun the command with a new code. Versions already published by the interrupted run are skipped.

The release script checks all public packages in dependency order and skips versions that already exist. After the four `@openruntime/extension-*` packages exist, configure GitHub Actions as their trusted publisher. Running the complete list is also appropriate when the existing packages have not yet been configured:

```bash
npm trust github @openruntime/core --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/bridge --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/chunk-map --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/rspack-plugin --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/modern-plugin --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/cli --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/extension-code-usage --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/extension-troubleshooting --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/extension-imitate --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/extension-memory --repo 2heal1/openruntime --file release.yml --allow-publish --yes
```

Use only the workflow filename, `release.yml`, not its full `.github/workflows/` path. The repository release workflow already uses a GitHub-hosted runner and grants `id-token: write`, which npm requires for OIDC publishing.

After one successful OIDC release, restrict traditional publishing tokens in npm package settings. See npm's [trusted publishing guide](https://docs.npmjs.com/trusted-publishers/) and [`npm trust` reference](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

After this rename has landed on `main`, publish the recording runtime for the bootstrap version as well. The next automated release uses it as the current-release baseline:

```bash
pnpm run build:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
gh release create recording-skill-runtime-v0.1.2 \
  /tmp/openruntime-recording-runtime/openruntime-recording-runtime-0.1.2.tgz \
  /tmp/openruntime-recording-runtime/openruntime-recording-runtime-0.1.2.tgz.sha256 \
  --target main \
  --title "OpenRuntime 0.1.2" \
  --notes "Bootstrap recording runtime release for OpenRuntime 0.1.2."
```

If that release already exists, do not overwrite it. First confirm that it already contains both assets shown above.

## Prepare a release

1. Open the repository's **Actions** page.
2. Select **Prepare OpenRuntime Release**.
3. Run the workflow from `main` with a `patch`, `minor`, or `major` increment.
4. Review the generated `release/openruntime-vX.Y.Z` pull request and wait for CI.
5. Confirm that the pull request changes only the public package versions and the recording runtime manifest.
6. Merge the release pull request into `main`.

The preparation workflow first confirms that the current npm packages and GitHub Release exist. It then updates every published package and the recording runtime to the same version.

## Publish a release

Merging a `release/openruntime-vX.Y.Z` pull request starts **Publish OpenRuntime Release**. The workflow:

1. validates the branch name, changed files, package versions, and recording runtime version;
2. builds all packages;
3. publishes the npm packages through trusted publishing;
4. builds and verifies the recording runtime bundle; and
5. creates the GitHub Release and uploads the bundle and checksum only after npm publishing succeeds.

The workflow is safe to rerun after an interruption. Existing npm versions are skipped, and an unfinished draft GitHub Release can have its assets replaced. A published Release with missing assets is left untouched and reported as an error.

## Local checks

Before preparing a release, run:

```bash
pnpm run check
pnpm run release:npm:check
pnpm run release:npm:pack -- --output-dir /tmp/openruntime-npm-packages
pnpm run build:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
```

Do not publish packages manually as part of the normal flow. The release workflow is the source of truth for package order, version consistency, and GitHub Release assets.

## Temporary browser package

OpenRuntime CLI currently includes a temporary OpenRuntime build of `agent-browser` for memory and code-coverage capture. Its purpose, replacement conditions, and migration checklist are documented in [Temporary OpenRuntime agent-browser Build](temporary-agent-browser-fork.md).
