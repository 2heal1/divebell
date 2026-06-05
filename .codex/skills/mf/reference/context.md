# Sub-skill: context

Collect the current project's Module Federation context (MFContext) from `ARGS` (defaults to the current working directory if empty), then output the aggregated summary.

## 1. Basic Info

Read `{projectRoot}/package.json` and extract:
- `name`: project name
- Merge `dependencies` + `devDependencies` into a full dependency map

Detect the package manager (check files in order):
- `pnpm-lock.yaml` → pnpm
- `yarn.lock` → yarn
- `package-lock.json` → npm

## 2. Bundler & MF Config

Find config files in the following priority order (`.ts` / `.mts` take precedence over `.js` / `.mjs` / `.cjs`):

| Priority | Filename |
|---|---|
| 1 | `module-federation.config.{ts,mts,js,mjs,cjs}` |
| 2 | `rsbuild.config.{ts,mts,js,mjs,cjs}` |
| 3 | `rspack.config.{ts,mts,js,mjs,cjs}` |
| 4 | `modern.config.{ts,mts,js,mjs,cjs}` |
| 5 | `next.config.{ts,mts,js,mjs,cjs}` |
| 6 | `webpack.config.{ts,js}` |
| 7 | `vite.config.{ts,mts,js,mjs,cjs}` |

Read the first matched file and extract the `remotes`, `exposes`, and `shared` fields.

Determine the bundler name from the config filename (`rspack` / `rsbuild` / `webpack` / `vite` / `next`). When priority 1 (`module-federation.config.*`) is matched, scan the project root for bundler config files in priorities 2–7 to set `bundler.name` and `bundler.configFile` (the bundler config path, not the MF config path). If no bundler config is found, set `bundler.name` to `unknown` and `bundler.configFile` to the `module-federation.config.*` path.

## 3. Determine MF Role

| Condition | Role |
|---|---|
| Has `remotes` and `exposes` | `host+remote` |
| Only `remotes` | `host` |
| Only `exposes` | `remote` |
| Neither | `unknown` |

## 4. Recent Error Event (optional)

Check if `.mf/observability/latest.json` exists; if so, read its contents.

## 5. Build Artifacts (optional)

Check if `dist/mf-manifest.json` and `dist/mf-stats.json` exist; if so, read them.

---

Aggregate the above information and output the MFContext summary in the following structure:

```
project:
  name, packageManager, mfRole

bundler:
  name, configFile

mfConfig:
  remotes, exposes, shared

dependencies:
  (list installed packages related to MF and their versions)

latestErrorEvent: (if present)
buildArtifacts:   (if present)
```
