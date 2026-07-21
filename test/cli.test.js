import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');

test('default CLI is credential-free and matches the checked-in proof', async () => {
  const result = spawnSync(process.execPath, ['src/cli.js', 'replay', '--no-color'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { NO_COLOR: '1' },
  });
  const artifact = await readFile(join(projectRoot, 'artifacts/demo-session.txt'), 'utf8');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, artifact);
  assert.match(result.stdout, /NETWORK none/);
  assert.match(result.stdout, /outbound 0/);
});

test('live CLI refuses to start without explicit configuration', () => {
  const result = spawnSync(process.execPath, ['src/cli.js', 'live'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {},
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /live\.mode-required/);
  assert.equal(result.stdout, '');
});
