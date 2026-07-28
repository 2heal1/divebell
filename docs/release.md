# Divebell Release Process

Chinese version: [Divebell 发版流程](release.zh-CN.md)

Divebell publishes all public packages and the browser-recording runtime through one controlled release. Merging an ordinary feature or fix pull request into `main` does not publish anything.

## Release scope

One release uses the same version for:

- Runtime SDK, Bridge, Chunk Map, the WIP Modern.js plugin package, and the Rspack plugin;
- Divebell CLI;
- `@divebell/extension-code-usage`;
- `@divebell/extension-troubleshooting`;
- `@divebell/extension-imitate`;
- `@divebell/extension-memory`; and
- the runtime bundle used by `record-divebell-workflow`.

The GitHub Release contains the recording runtime bundle and its SHA-256 checksum. npm packages are published before the GitHub Release is made public.

## One-time setup for new packages

npm can configure trusted publishing only after a package exists. When a package name is new, publish the current Divebell version once with a maintainer account, then configure its GitHub Actions trust relationship.
The initial Divebell release uses `0.0.0` for every package and the recording runtime.

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
pnpm run release:npm:pack -- --output-dir /tmp/divebell-npm-bootstrap
pnpm run publish:packages -- --output-dir /tmp/divebell-npm-bootstrap --otp 123456
```

Replace `123456` with the current one-time password from the maintainer's authenticator. The same value is forwarded to each `npm publish`; if it expires before all packages finish, rerun the command with a new code. Versions already published by the interrupted run are skipped.

The release script checks all public packages in dependency order and skips versions that already exist. After the four `@divebell/extension-*` packages exist, configure GitHub Actions as their trusted publisher. Running the complete list is also appropriate when the existing packages have not yet been configured:

```bash
npm trust github @divebell/core --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/bridge --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/chunk-map --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/rspack-plugin --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/modern-plugin --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/cli --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/extension-code-usage --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/extension-troubleshooting --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/extension-imitate --repo 2heal1/divebell --file release.yml --allow-publish --yes
npm trust github @divebell/extension-memory --repo 2heal1/divebell --file release.yml --allow-publish --yes
```

Use only the workflow filename, `release.yml`, not its full `.github/workflows/` path. The repository release workflow already uses a GitHub-hosted runner and grants `id-token: write`, which npm requires for OIDC publishing.

After one successful OIDC release, restrict traditional publishing tokens in npm package settings. See npm's [trusted publishing guide](https://docs.npmjs.com/trusted-publishers/) and [`npm trust` reference](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

After the initial npm packages are published and trusted publishing is configured, publish the recording runtime for `0.0.0` as well. The next automated release uses it as the current-release baseline:

```bash
pnpm run build:recording-runtime -- --output-dir /tmp/divebell-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/divebell-recording-runtime
gh release create recording-skill-runtime-v0.0.0 \
  /tmp/divebell-recording-runtime/divebell-recording-runtime-0.0.0.tgz \
  /tmp/divebell-recording-runtime/divebell-recording-runtime-0.0.0.tgz.sha256 \
  --target main \
  --title "Divebell 0.0.0" \
  --notes "Bootstrap recording runtime release for Divebell 0.0.0."
```

If that release already exists, do not overwrite it. First confirm that it already contains both assets shown above.

## Prepare a release

1. Open the repository's **Actions** page.
2. Select **Prepare Divebell Release**.
3. Run the workflow from `main` with a `patch`, `minor`, or `major` increment.
4. Review the generated `release/divebell-vX.Y.Z` pull request and wait for CI.
5. Confirm that the pull request changes the public package versions and recording runtime manifest, and removes the changeset files included in this release.
6. Merge the release pull request into `main`.

The preparation workflow first confirms that the current npm packages and GitHub Release exist. It then updates every published package and the recording runtime to the same version. Changeset descriptions are used to build the pull request summary and are removed by that pull request after they have been consumed.

## Publish a release

Merging a `release/divebell-vX.Y.Z` pull request starts **Publish Divebell Release**. The workflow:

1. validates the branch name, changed files, package versions, and recording runtime version;
2. builds all packages;
3. publishes the npm packages through trusted publishing;
4. builds and verifies the recording runtime bundle; and
5. creates the GitHub Release and uploads the bundle and checksum only after npm publishing succeeds.

The workflow is safe to rerun after an interruption. Existing npm versions are skipped, and an unfinished draft GitHub Release can have its assets replaced. A published Release with missing assets is left untouched and reported as an error. Every completed GitHub Release is marked as **Latest**; rerunning the workflow for the current version also restores that marker when its published assets are complete.

## Local checks

Before preparing a release, run:

```bash
pnpm run check
pnpm run release:npm:check
pnpm run release:npm:pack -- --output-dir /tmp/divebell-npm-packages
pnpm run build:recording-runtime -- --output-dir /tmp/divebell-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/divebell-recording-runtime
```

Do not publish packages manually as part of the normal flow. The release workflow is the source of truth for package order, version consistency, and GitHub Release assets.

## Temporary browser package

Divebell CLI currently includes a temporary Divebell build of `agent-browser` for memory and code-coverage capture. Its purpose, replacement conditions, and migration checklist are documented in [Temporary Divebell agent-browser Build](temporary-agent-browser-fork.md).
