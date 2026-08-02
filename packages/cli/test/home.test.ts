import assert from "node:assert/strict";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import {
  DIVEBELL_HOME_ENV,
  resolveDivebellHomeDirectory
} from "../dist/utils/home.js";

test("uses an explicit Divebell home without probing it", () => {
  const root = mkdtempSync(join(tmpdir(), "divebell-home-explicit-"));
  const explicit = join(root, "not-created");

  try {
    assert.equal(
      resolveDivebellHomeDirectory({ [DIVEBELL_HOME_ENV]: explicit }),
      explicit
    );
    assert.throws(() => lstatSync(explicit));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps the normal user directory when it is writable", () => {
  const root = mkdtempSync(join(tmpdir(), "divebell-home-writable-"));
  const temporaryDirectory = join(root, "tmp");
  mkdirSync(temporaryDirectory);
  const uid = typeof process.geteuid === "function" ? process.geteuid() : undefined;

  try {
    const resolved = resolveDivebellHomeDirectory({}, {
      homeDirectory: root,
      temporaryDirectory,
      ...(uid === undefined ? {} : { uid })
    });
    assert.equal(resolved, join(root, ".divebell"));
    assert.equal(lstatSync(resolved).isDirectory(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("falls back to a private temporary directory when the user directory is unavailable", () => {
  const root = mkdtempSync(join(tmpdir(), "divebell-home-fallback-"));
  const temporaryDirectory = join(root, "tmp");
  mkdirSync(temporaryDirectory);
  writeFileSync(join(root, ".divebell"), "not a directory");
  const uid = typeof process.geteuid === "function" ? process.geteuid() : undefined;

  try {
    const resolved = resolveDivebellHomeDirectory({}, {
      homeDirectory: root,
      temporaryDirectory,
      ...(uid === undefined ? {} : { uid }),
      pid: 1234
    });
    assert.equal(
      resolved,
      join(temporaryDirectory, uid === undefined ? "divebell" : `divebell-${uid}`)
    );
    assert.equal(lstatSync(resolved).isDirectory(), true);
    if (process.platform !== "win32") {
      assert.equal(lstatSync(resolved).mode & 0o777, 0o700);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
