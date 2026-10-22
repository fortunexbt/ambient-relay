import assert from 'node:assert/strict';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { runSyntheticReplay } from '../src/replay.js';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const ALLOWED_BUILTINS = new Set(['node:crypto', 'node:fs/promises']);

test('the replay path imports nothing that can reach a network', async () => {
  const seen = new Set();
  const external = new Set();
  const visit = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = await readFile(file, 'utf8');
    for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*\(\s*)'([^']+)'/g)) {
      if (specifier.startsWith('.')) await visit(resolve(dirname(file), specifier));
      else external.add(specifier);
    }
  };
  await visit(join(sourceRoot, 'replay.js'));
  await visit(join(sourceRoot, 'presentation/terminal.js'));

  assert.ok(seen.size >= 8, `walked ${seen.size} modules`);
  assert.deepEqual([...external].filter((name) => !ALLOWED_BUILTINS.has(name)), []);
});

test('replay completes with every network entry point disabled', async (t) => {
  const refuse = (name) => () => { throw new Error(`network call attempted: ${name}`); };
  t.mock.method(globalThis, 'fetch', refuse('fetch'));
  t.mock.method(net.Socket.prototype, 'connect', refuse('net.connect'));
  t.mock.method(http, 'request', refuse('http.request'));
  t.mock.method(https, 'request', refuse('https.request'));
  t.mock.method(dns, 'lookup', refuse('dns.lookup'));

  const session = await runSyntheticReplay();
  assert.equal(session.outcomes.length, 13);
  assert.equal(session.outboundMessages, 0);
});
