import assert from 'node:assert/strict';
import { createHash as nodeCreateHash } from 'node:crypto';
import { test } from 'node:test';

import { createHash as browserCreateHash } from '../web/src/node-crypto.js';

test('browser hash stand-in matches node:crypto SHA-256', () => {
  const samples = ['', 'Morning everyone.', '{"content":"naïve café ☕ 日本"}', 'x'.repeat(1_000)];
  for (const sample of samples) {
    assert.equal(
      browserCreateHash('sha256').update(sample, 'utf8').digest('hex'),
      nodeCreateHash('sha256').update(sample, 'utf8').digest('hex'),
    );
  }
});
