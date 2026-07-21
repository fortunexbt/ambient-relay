import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
for (const directory of ['src', 'test', 'scripts']) {
  await collectJavaScript(join(projectRoot, directory), files);
}

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}
process.stdout.write(`Syntax checked ${files.length} JavaScript files.\n`);

async function collectJavaScript(directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectJavaScript(path, output);
    if (entry.isFile() && entry.name.endsWith('.js')) output.push(path);
  }
}
