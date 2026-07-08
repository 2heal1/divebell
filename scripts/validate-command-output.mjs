#!/usr/bin/env node

const ERROR_KINDS = new Set([
  "validation",
  "needs_input",
  "auth",
  "browser",
  "runtime",
  "not_found",
  "internal"
]);

async function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const input = await readStdin();
  const result = validateCommandOutputText(input);
  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    process.exitCode = 1;
  }
}

function validateCommandOutputText(input) {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return invalid("output is empty");
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return invalid(`output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  return validateCommandOutput(parsed);
}

function validateCommandOutput(value) {
  if (!isRecord(value)) {
    return invalid("output must be a JSON object");
  }

  if (value.status !== "ok" && value.status !== "needs_input" && value.status !== "error") {
    return invalid('output.status must be "ok", "needs_input", or "error"');
  }

  const metaResult = validateMeta(value.meta);
  if (!metaResult.ok) {
    return metaResult;
  }

  if (value.status === "ok") {
    return Object.hasOwn(value, "data") ? valid() : invalid("ok output must include data");
  }

  if (value.status === "needs_input") {
    if (typeof value.message !== "string" || value.message.length === 0) {
      return invalid("needs_input output must include message");
    }
    if (!Array.isArray(value.options)) {
      return invalid("needs_input output must include options array");
    }
    return valid();
  }

  if (typeof value.message !== "string" || value.message.length === 0) {
    return invalid("error output must include message");
  }
  return validateError(value.error);
}

function validateMeta(value) {
  if (!isRecord(value)) {
    return invalid("output.meta must be an object");
  }
  if (value.version !== 1) {
    return invalid("output.meta.version must be 1");
  }
  if (typeof value.command !== "string" || value.command.length === 0) {
    return invalid("output.meta.command must be a non-empty string");
  }
  return valid();
}

function validateError(value) {
  if (!isRecord(value)) {
    return invalid("error output must include error object");
  }
  if (typeof value.code !== "string" || value.code.length === 0) {
    return invalid("error.code must be a non-empty string");
  }
  if (typeof value.kind !== "string" || !ERROR_KINDS.has(value.kind)) {
    return invalid(`error.kind must be one of: ${[...ERROR_KINDS].join(", ")}`);
  }
  if (typeof value.retryable !== "boolean") {
    return invalid("error.retryable must be a boolean");
  }
  if (value.hint !== undefined && typeof value.hint !== "string") {
    return invalid("error.hint must be a string when present");
  }
  if (value.details !== undefined && !isRecord(value.details)) {
    return invalid("error.details must be an object when present");
  }
  return valid();
}

function runSelfTest() {
  const samples = [
    {
      status: "ok",
      data: {},
      meta: {
        version: 1,
        command: "self-test ok"
      }
    },
    {
      status: "needs_input",
      message: "Pick one.",
      options: [],
      meta: {
        version: 1,
        command: "self-test needs-input"
      }
    },
    {
      status: "error",
      message: "Failed.",
      error: {
        code: "SELF_TEST_ERROR",
        kind: "internal",
        retryable: false
      },
      meta: {
        version: 1,
        command: "self-test error"
      }
    }
  ];

  for (const sample of samples) {
    const result = validateCommandOutput(sample);
    if (!result.ok) {
      throw new Error(result.message);
    }
  }
}

function valid() {
  return {
    ok: true
  };
}

function invalid(message) {
  return {
    ok: false,
    message
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let content = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      content += chunk;
    });
    process.stdin.on("end", () => {
      resolve(content);
    });
    process.stdin.on("error", reject);
  });
}

await main();
