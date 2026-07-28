export function validateReleaseChangedFiles(source, requiredFiles) {
  const required = new Set(requiredFiles);
  const seen = new Set();
  const files = [];
  const changesets = [];

  for (const line of source.split(/\r?\n/).filter(Boolean)) {
    const separator = line.indexOf("\t");
    if (separator <= 0 || separator === line.length - 1) {
      throw new Error(`Invalid release change record: ${line}`);
    }

    const status = line.slice(0, separator);
    const file = line.slice(separator + 1);
    if (seen.has(file)) throw new Error(`Release PR changed ${file} more than once.`);
    seen.add(file);
    files.push(file);

    if (required.has(file)) {
      if (status !== "modified") {
        throw new Error(`Release PR must modify required version file ${file}; received ${status}.`);
      }
      continue;
    }

    if (/^\.changeset\/[^/]+\.md$/.test(file)) {
      if (status !== "removed") {
        throw new Error(`Release PR may only remove changeset files; received ${status} for ${file}.`);
      }
      changesets.push(file);
      continue;
    }

    throw new Error(`Release PR may not change ${file}.`);
  }

  for (const file of required) {
    if (!seen.has(file)) throw new Error(`Release PR did not change required file: ${file}`);
  }
  if (changesets.length === 0) {
    throw new Error("Release PR must remove at least one published changeset.");
  }

  return { files, changesets };
}
