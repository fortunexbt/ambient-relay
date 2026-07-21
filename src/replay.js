import { readFile } from 'node:fs/promises';

import { createSyntheticConfig } from './config.js';
import { RelayEngine } from './core/relay-engine.js';

const FIXTURE_URL = new URL('./fixtures/discord-events.json', import.meta.url);

export async function runSyntheticReplay() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
  if (!Array.isArray(fixture.events)) throw new Error('fixture.events-invalid');

  const engine = new RelayEngine(createSyntheticConfig());
  const outcomes = fixture.events.map((event) => ({
    eventId: event.eventId,
    ...engine.route(event),
  }));

  return Object.freeze({
    fixtureId: fixture.fixtureId,
    fixtureVersion: fixture.fixtureVersion,
    mode: 'synthetic',
    networkRequests: 0,
    outboundMessages: 0,
    outcomes: Object.freeze(outcomes),
  });
}
