# Publish the Recording Skill Runtime

The recording skill runtime is not committed to Git. The repository stores only a version manifest. GitHub Actions builds the archive and uploads the archive plus its checksum to a GitHub Release. Users download it once and reuse a versioned local cache.

## Initial setup

Under **Settings > Actions > General > Workflow permissions**, enable:

- **Read and write permissions**
- **Allow GitHub Actions to create and approve pull requests**

When this change first reaches `main`, **Publish Recording Skill Runtime** automatically builds and verifies the bundle, creates the `recording-skill-runtime-v0.1.0` Release, uploads both assets, and publishes the Release.

Use **Squash and merge** for the initial feature pull request, then delete the feature branch. This prevents the `.tgz` files committed during early development from becoming reachable from `main`.

## Later releases

1. Open the repository **Actions** page.
2. Select **Prepare Recording Skill Runtime Release**.
3. Run it with a `patch`, `minor`, or `major` increment.
4. The workflow creates a `release/recording-skill-runtime-v<version>` branch and pull request.
5. Review and merge the pull request.
6. The merge to `main` automatically publishes the matching GitHub Release.

No manual asset upload is required. Every runtime Release contains:

```text
openruntime-recording-runtime-<version>.tgz
openruntime-recording-runtime-<version>.tgz.sha256
```

The skill reads the pinned URLs in `skills/record-openruntime-workflow/references/openruntime-cli-runtime.json`. It never follows a latest-release URL. Each release pull request updates the version, tag, filenames, and download URLs together.

## Retry behavior

- A draft Release can be rerun; its assets are replaced and then published.
- A published Release with both expected assets is treated as complete.
- A published Release missing an asset causes a failure instead of silently mutating published content.

## Local verification

```bash
pnpm run build
pnpm run build:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
pnpm run verify:recording-runtime -- --output-dir /tmp/openruntime-recording-runtime
```

Verification installs the runtime in a fresh temporary directory, runs the CLI, and runs it again to confirm cache reuse.
