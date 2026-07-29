import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
);
const manifestPath = resolve(packageRoot, 'dist/mf/mf-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const expectedPublicPath = `https://unpkg.com/${packageJson.name}@${packageJson.version}/dist/mf/`;

assert.equal(manifest.name, 'divebell_mf_playground_remote');
assert.equal(manifest.metaData?.buildInfo?.buildName, packageJson.name);
assert.equal(manifest.metaData?.buildInfo?.buildVersion, packageJson.version);
assert.equal(manifest.metaData?.publicPath, expectedPublicPath);
assert.equal(manifest.exposes?.length, 1);
assert.equal(manifest.exposes[0]?.name, '.');

const exposedAssets = [
  ...(manifest.exposes[0]?.assets?.js?.sync ?? []),
  ...(manifest.exposes[0]?.assets?.js?.async ?? []),
  ...(manifest.exposes[0]?.assets?.css?.sync ?? []),
  ...(manifest.exposes[0]?.assets?.css?.async ?? []),
];
assert.ok(
  exposedAssets.length > 0,
  'The exposed component has no build assets.',
);

for (const asset of exposedAssets) {
  await access(resolve(packageRoot, 'dist/mf', asset));
}

const exposedJavaScript = await Promise.all(
  exposedAssets
    .filter((asset) => asset.endsWith('.js'))
    .map((asset) => readFile(resolve(packageRoot, 'dist/mf', asset), 'utf8')),
);
assert.ok(
  exposedJavaScript.some((source) =>
    source.includes('Divebell MF Playground Remote'),
  ),
  'The built remote is missing its actionable prop validation.',
);
assert.ok(
  exposedJavaScript.some(
    (source) =>
      source.includes('Find the issue.') &&
      source.includes('Performance') &&
      source.includes('Network') &&
      source.includes('golden sonar pulse'),
  ),
  'The built remote is missing the bug-clearing game.',
);

console.log('[mf-playground-remote] production build verified.');
