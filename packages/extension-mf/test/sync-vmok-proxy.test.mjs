import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { synchronizeVmokProxy } from "../scripts/sync-vmok-proxy.mjs";

test("Vmok Proxy SDK sync and check use one fixed self-contained bundle", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-vmok-proxy-sync-"));
  try {
    const packageRoot = createProxyPackage(directory);
    const assetDirectory = join(directory, "assets");
    const synced = await synchronizeVmokProxy({
      mode: "sync",
      inputPackageRoot: packageRoot,
      assetDirectory
    });
    assert.equal(synced.packageName, "@vmok/proxy-sdk");
    assert.equal(synced.packageVersion, "1.25.1");
    assert.match(synced.bundleSha256, /^[0-9a-f]{64}$/);
    assert.equal(
      JSON.parse(readFileSync(join(assetDirectory, "proxy-sdk-build.json"), "utf8"))
        .packageVersion,
      "1.25.1"
    );
    await synchronizeVmokProxy({
      mode: "check",
      inputPackageRoot: packageRoot,
      assetDirectory
    });

    writeFileSync(
      join(assetDirectory, "vmok-proxy-sdk.iife.js"),
      "var VmokProxySdk = {};"
    );
    await assert.rejects(
      synchronizeVmokProxy({
        mode: "check",
        inputPackageRoot: packageRoot,
        assetDirectory
      }),
      /assets are stale/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Vmok Proxy SDK sync rejects the wrong package and unsafe bundles", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-vmok-proxy-invalid-"));
  try {
    const wrongPackage = createProxyPackage(directory, {
      name: "@example/not-proxy"
    });
    await assert.rejects(
      synchronizeVmokProxy({
        mode: "sync",
        inputPackageRoot: wrongPackage,
        assetDirectory: join(directory, "wrong-assets")
      }),
      /Expected package name/
    );

    const unsafeRoot = join(directory, "unsafe");
    createProxyPackage(unsafeRoot, {
      bundle: "var VmokProxySdk={bootstrapProxy(){require('unsafe')}};"
    });
    await assert.rejects(
      synchronizeVmokProxy({
        mode: "sync",
        inputPackageRoot: join(unsafeRoot, "proxy-sdk"),
        assetDirectory: join(directory, "unsafe-assets")
      }),
      /contains require/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createProxyPackage(
  directory,
  {
    name = "@vmok/proxy-sdk",
    bundle = "var VmokProxySdk={bootstrapProxy(){return true}};"
  } = {}
) {
  const packageRoot = join(directory, "proxy-sdk");
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({
    name,
    version: "1.25.1"
  }));
  writeFileSync(join(packageRoot, "dist/iife.js"), bundle);
  return packageRoot;
}
