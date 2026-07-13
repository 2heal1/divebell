# OpenRuntime Release Flow

OpenRuntime uses one controlled release chain for all four npm packages and the recording skill runtime. Merging an ordinary feature branch into `main` does not publish anything.

```text
Run Prepare OpenRuntime Release manually
→ create release/openruntime-vX.Y.Z
→ update versions and open a pull request
→ maintainer reviews and merges after CI passes
→ publish four npm packages through OIDC
→ create the GitHub Release only after npm succeeds
→ upload the recording runtime and SHA-256 file
```

## One-time bootstrap

npm trusted publishers can only be configured for packages that already exist. Before enabling OIDC, publish the current version once with a maintainer account:

```bash
npm login
npm install --global npm@11.15.0
pnpm run build
node scripts/npm-release.mjs publish --output-dir /tmp/openruntime-npm-bootstrap
```

Packages are published in dependency order:

- `@openruntime/core`
- `@openruntime/bridge`
- `@openruntime/modern-plugin`
- `@openruntime/cli`

An existing package version is skipped, so an interrupted bootstrap can be rerun.

After all packages exist, open **Settings > Trusted Publisher** for each npm package and use:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `2heal1` |
| Repository | `openruntime` |
| Workflow filename | `release.yml` |
| Environment name | Leave empty |
| Allowed actions | `npm publish` |

The workflow filename is case-sensitive. Enter only the filename, without `.github/workflows/`. A maintainer with account-level two-factor authentication can configure all four packages from the CLI instead:

```bash
npm trust github @openruntime/core --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/bridge --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/modern-plugin --repo 2heal1/openruntime --file release.yml --allow-publish --yes
npm trust github @openruntime/cli --repo 2heal1/openruntime --file release.yml --allow-publish --yes
```

`npm trust` rejects a package that does not exist, so complete the bootstrap publish first. Then verify the baseline:

```bash
node scripts/npm-release.mjs check
```

After one successful OIDC release, traditional publish tokens can be disabled under npm Publishing access.

## Later releases

1. Open the repository **Actions** page.
2. Select **Prepare OpenRuntime Release**.
3. Run it with a `patch`, `minor`, or `major` increment.
4. The workflow confirms that the current version exists on npm and in GitHub Releases.
5. It creates `release/openruntime-v<version>` and opens a pull request.
6. Review the version changes and wait for CI.
7. Merge the pull request into `main`.
8. **Publish OpenRuntime Release** publishes all npm packages through OIDC.
9. Only after npm succeeds, it creates the GitHub Release and uploads the recording runtime.

The release pull request may only change four `package.json` files and the recording runtime manifest. The branch name, npm package versions, and runtime version must match exactly.

## Release output

Every release publishes the same version of all four npm packages and adds these GitHub Release assets:

```text
openruntime-recording-runtime-<version>.tgz
openruntime-recording-runtime-<version>.tgz.sha256
```

The skill reads pinned URLs from `skills/record-openruntime-workflow/references/openruntime-cli-runtime.json`, verifies SHA-256, and caches by version. It never follows a latest-release URL.

## Retry behavior

- An npm package version that already exists is skipped.
- GitHub Release creation does not begin until every npm package is published.
- A draft GitHub Release can be rerun and its assets replaced.
- A published Release with both assets is treated as complete.
- A published Release missing an asset causes a failure without mutating it.

## Local verification

```bash
pnpm run build
node scripts/npm-release.mjs pack --output-dir /tmp/openruntime-npm-packages
pnpm run build:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
```

npm OIDC requires a GitHub-hosted runner, Node.js 22.14.0 or newer, and npm 11.5.1 or newer. The workflow does not use `NPM_TOKEN`.
