import assert from "node:assert/strict";
import test from "node:test";

import {
  createNpmPublishArgs,
  redactCommandArgs,
  redactSensitiveText
} from "./npm-release-utils.mjs";

test("adds an OTP to npm publish arguments only when provided", () => {
  const withoutOtp = createNpmPublishArgs("/tmp/divebell.tgz");
  assert.equal(withoutOtp.includes("--otp"), false);

  const withOtp = createNpmPublishArgs("/tmp/divebell.tgz", "123456");
  assert.deepEqual(withOtp.slice(-2), ["--otp", "123456"]);
});

test("redacts OTP values from commands and child output", () => {
  assert.deepEqual(
    redactCommandArgs(["publish", "package.tgz", "--otp", "123456"]),
    ["publish", "package.tgz", "--otp", "***"]
  );
  assert.equal(
    redactSensitiveText("publish failed for OTP 123456", ["123456"]),
    "publish failed for OTP ***"
  );
});
