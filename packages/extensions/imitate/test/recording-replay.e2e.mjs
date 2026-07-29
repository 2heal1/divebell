import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "../../..");
const cliEntry = resolve(repositoryDirectory, "packages/cli/dist/index.js");
const extensionEntry = resolve(packageDirectory, "dist/extension.js");

const temporaryDirectory = await mkdtemp(join(tmpdir(), "divebell-recording-replay-"));
const recordingDirectory = join(temporaryDirectory, "recording.orrec");
const wrapperPath = join(temporaryDirectory, "divebell-with-recording.mjs");
const projectDirectory = join(temporaryDirectory, "project");
const profileDirectory = join(temporaryDirectory, "browser-profile");
const operationLogDirectory = join(temporaryDirectory, "operations");
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html>
  <head><title>Recording Replay</title></head>
  <body>
    <main>
      <label>Search term <input name="query" placeholder="Search packages"></label>
      <label>Region
        <select name="region">
          <option value="us">United States</option>
          <option value="cn">China</option>
        </select>
      </label>
      <div id="actions"></div>
      <output id="result">Waiting</output>
    </main>
    <script>
      setTimeout(() => {
        document.querySelector("#actions").innerHTML =
          '<button data-testid="run-workflow"><span>Run workflow</span></button>';
        document.querySelector("[data-testid=run-workflow]").addEventListener("click", () => {
          setTimeout(() => {
            const query = document.querySelector("[name=query]").value;
            const region = document.querySelector("[name=region]").value;
            document.querySelector("#result").textContent = query + "|" + region;
            document.title = "Replay Complete";
            history.pushState({}, "", "/done?query=" + encodeURIComponent(query) + "&region=" + region);
          }, 350);
        });
      }, 500);
    </script>
  </body>
</html>`);
});

try {
  await Promise.all([
    import("node:fs/promises").then(({ mkdir }) => mkdir(projectDirectory, { recursive: true })),
    import("node:fs/promises").then(({ mkdir }) => mkdir(profileDirectory, { recursive: true })),
    import("node:fs/promises").then(({ mkdir }) => mkdir(operationLogDirectory, { recursive: true }))
  ]);
  await writeFile(wrapperPath, `#!/usr/bin/env node
import extension from ${JSON.stringify(pathToFileURL(extensionEntry).href)};
import { createDivebellCli } from ${JSON.stringify(pathToFileURL(cliEntry).href)};
const cli = createDivebellCli({ extensions: [extension] });
process.exitCode = await cli.run(process.argv.slice(2));
`, "utf8");
  await chmod(wrapperPath, 0o755);

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const env = {
    ...process.env,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory,
    DIVEBELL_OPERATION_LOG_DIR: operationLogDirectory,
    DIVEBELL_CLI: wrapperPath
  };

  await runCli(["record", "start", "--out", recordingDirectory], env);
  await runCli(["open", url, "--no-bridge"], env);
  await runCli(["fill", "input[name=query]", "module federation"], env);
  await runCli(["select", "select[name=region]", "cn"], env);
  await runCli([
    "wait-eval",
    "document.querySelector('[data-testid=run-workflow]') != null",
    "--timeout",
    "10000"
  ], env);
  await runCli(["click", "[data-testid=run-workflow]"], env);
  await runCli([
    "wait-eval",
    "document.querySelector('#result')?.textContent === 'module federation|cn'",
    "--timeout",
    "10000"
  ], env);
  const stopped = await runCli(["record", "stop", "--out", recordingDirectory], env);
  assert.equal(stopped.status, "ok");
  assert.equal(stopped.data.status, "completed");
  const manifest = JSON.parse(await readFile(join(recordingDirectory, "manifest.json"), "utf8"));
  const transcript = JSON.parse(await readFile(join(recordingDirectory, "transcript.json"), "utf8"));
  assert.equal(manifest.capture.audio.requested, true);
  assert.equal(manifest.capture.audio.status, "not-captured");
  assert.equal(transcript.status, "not-captured");
  await runCli(["stop"], env);

  const replay = await execFileAsync(process.execPath, [
    join(recordingDirectory, "generated-script.mjs"),
    "--headless",
    "--timeout",
    "15000"
  ], {
    cwd: projectDirectory,
    env,
    maxBuffer: 10 * 1024 * 1024
  });
  const replayResult = JSON.parse(replay.stdout);
  assert.equal(replayResult.status, "ok");
  assert.deepEqual(
    replayResult.data.steps.map((step) => step.action),
    ["fill", "select", "click"]
  );
  assert.deepEqual(
    replayResult.data.steps.map((step) => step.matchedBy),
    ["label:Search term", "label:Region", "test-id:run-workflow"]
  );
  assert.equal(replayResult.data.page.title, "Replay Complete");

  const pageResult = await runCli([
    "eval",
    "({ result: document.querySelector('#result')?.textContent, url: location.href })"
  ], env);
  assert.equal(pageResult.result, "module federation|cn");
  assert.match(pageResult.url, /\/done\?query=module%20federation&region=cn$/u);

  const interactions = (await readFile(join(recordingDirectory, "interactions.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(interactions.some((event) => event.target?.locators?.length > 1), true);
  assert.equal(interactions.some((event) => event.target?.label === "Search term"), true);
  assert.equal(interactions.some((event) => event.target?.label === "Region"), true);
  assert.equal(interactions.some((event) => event.target?.selectedValues?.includes("cn")), true);
  process.stdout.write(`${JSON.stringify({
    status: "ok",
    recordingDirectory,
    replay: replayResult.data
  }, null, 2)}\n`);
} finally {
  await runCli(["stop"], {
    ...process.env,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory,
    DIVEBELL_OPERATION_LOG_DIR: operationLogDirectory
  }).catch(() => undefined);
  await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function runCli(args, env) {
  const result = await execFileAsync(process.execPath, [wrapperPath, ...args], {
    cwd: projectDirectory,
    env,
    maxBuffer: 10 * 1024 * 1024
  });
  const output = result.stdout.trim();
  if (output.length === 0) return undefined;
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}
