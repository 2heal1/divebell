export function parseChangeset(source, filename = "changeset") {
  const normalized = String(source).replaceAll("\r\n", "\n").trim();
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n+([\s\S]+)$/);
  if (match === null) {
    throw new Error(`${filename} must contain changeset frontmatter and a summary.`);
  }

  const packages = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const release = line.match(/^(?:"([^"]+)"|'([^']+)'|([^:]+)):\s*(patch|minor|major)\s*$/);
      if (release === null) {
        throw new Error(`${filename} contains an invalid release entry: ${line}`);
      }
      return release[1] ?? release[2] ?? release[3].trim();
    });
  if (packages.length === 0) {
    throw new Error(`${filename} does not name any affected packages.`);
  }

  const summary = match[2].trim().replace(/\s+/g, " ");
  if (summary.length === 0) {
    throw new Error(`${filename} does not contain a change summary.`);
  }

  return { packages, summary };
}

export function renderReleasePullRequestBody({ version, tag, changesets }) {
  if (changesets.length === 0) {
    throw new Error("At least one changeset is required to describe a release.");
  }

  const affectedPackages = [...new Set(changesets.flatMap((changeset) => changeset.packages))].sort();
  const lines = [
    `## Changes in ${version}`,
    "",
    ...changesets.map((changeset) => `- ${changeset.summary}`),
    "",
    "## Affected packages",
    "",
    ...affectedPackages.map((packageName) => `- \`${packageName}\``),
    "",
    "## Release",
    "",
    `This PR bumps all Divebell packages and the recording runtime to \`${version}\`.`,
    `After it passes CI and is merged, the trusted release workflow publishes the npm packages and creates \`${tag}\` with the recording runtime assets.`,
    ""
  ];
  return lines.join("\n");
}
