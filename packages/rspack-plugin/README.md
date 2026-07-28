# @divebell/rspack-plugin

This optional Rspack plugin emits `divebell-chunks.json` for deeper code
usage analysis. Basic Divebell memory commands do not require this plugin.

```ts
import { DivebellChunkMapRspackPlugin } from "@divebell/rspack-plugin";

export default {
  plugins: [new DivebellChunkMapRspackPlugin()]
};
```

Keep JavaScript source maps in the same build output. Record the target page
with `divebell coverage`, then pass the exact build metadata path to the CLI:

```sh
divebell extensions add @divebell/extension-code-usage
divebell code-usage analyze \
  --chunk-map /path/to/dist/divebell-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --output /tmp/code-usage-report.json
```

Use the artifacts from the exact deployed build when analyzing an online page.
If the Chunk Map is stored outside the build output, pass the build directory
with `--assets`.
