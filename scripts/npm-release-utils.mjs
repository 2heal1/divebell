export function createNpmPublishArgs(archive, otp) {
  return [
    "publish",
    archive,
    "--access",
    "public",
    "--registry",
    "https://registry.npmjs.org",
    ...(otp === undefined ? [] : ["--otp", otp])
  ];
}

export function redactCommandArgs(args, sensitiveOptions = ["--otp"]) {
  const options = new Set(sensitiveOptions);
  let redactNext = false;
  return args.map((arg) => {
    if (redactNext) {
      redactNext = false;
      return "***";
    }
    if (options.has(arg)) {
      redactNext = true;
      return arg;
    }
    for (const option of options) {
      if (arg.startsWith(`${option}=`)) return `${option}=***`;
    }
    return arg;
  });
}

export function redactSensitiveText(value, sensitiveValues = []) {
  let result = String(value);
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue.length > 0) result = result.replaceAll(sensitiveValue, "***");
  }
  return result;
}
