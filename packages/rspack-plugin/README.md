# @openruntime/rspack-plugin

This optional Rspack plugin emits `openruntime-chunks.json` for deeper code
usage analysis. Basic OpenRuntime memory commands do not require this plugin.

```ts
import { OpenRuntimeChunkMapRspackPlugin } from "@openruntime/rspack-plugin";

export default {
  plugins: [new OpenRuntimeChunkMapRspackPlugin()]
};
```

Keep JavaScript source maps in the same build output. Record the target page
with `openruntime coverage`, then pass the exact build metadata path to the CLI:

```sh
openruntime commands add @openruntime/command-code-usage
openruntime code-usage analyze \
  --chunk-map /path/to/dist/openruntime-chunks.json \
  --coverage /tmp/first-screen.coverage.json \
  --output /tmp/code-usage-report.json
```

Use the artifacts from the exact deployed build when analyzing an online page.
If the Chunk Map is stored outside the build output, pass the build directory
with `--assets`.
