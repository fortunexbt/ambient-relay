import { RelayEngine } from './relay-engine.js';

export function replayFixture(fixture, config) {
  if (!Array.isArray(fixture.events)) throw new Error('fixture.events-invalid');

  const engine = new RelayEngine(config);
  const outcomes = fixture.events.map((event) => ({
    eventId: event.eventId,
    ...engine.route(event),
  }));

  return Object.freeze({
    fixtureId: fixture.fixtureId,
    fixtureVersion: fixture.fixtureVersion,
    mode: config.mode,
    outboundMessages: outcomes.filter((outcome) => outcome.receipt.outboundPerformed).length,
    outcomes: Object.freeze(outcomes),
  });
}
