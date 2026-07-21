import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderTerminalProof } from '../src/presentation/terminal.js';
import { runSyntheticReplay } from '../src/replay.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = join(projectRoot, 'artifacts/demo-session.txt');
const expected = renderTerminalProof(await runSyntheticReplay(), { color: false });

if (process.argv.includes('--check')) {
  const current = await readFile(artifactPath, 'utf8');
  if (current !== expected) {
    process.stderr.write('Terminal proof is stale. Run npm run artifact.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('Terminal proof matches the deterministic replay.\n');
  }
} else {
  await writeFile(artifactPath, expected, { encoding: 'utf8', mode: 0o644 });
  process.stdout.write('Updated artifacts/demo-session.txt\n');
}
