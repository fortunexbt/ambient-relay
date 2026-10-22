import { readFile } from 'node:fs/promises';

import { createSyntheticConfig } from './config.js';
import { replayFixture } from './core/session.js';

const FIXTURE_URL = new URL('./fixtures/discord-events.json', import.meta.url);

export async function runSyntheticReplay() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
  return replayFixture(fixture, createSyntheticConfig());
}
