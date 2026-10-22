import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSyntheticConfig } from '../src/config.js';
import { EventValidationError } from '../src/core/event.js';
import { RelayEngine } from '../src/core/relay-engine.js';
import { scoreStations } from '../src/core/stations.js';
import { runSyntheticReplay } from '../src/replay.js';

describe('synthetic replay', () => {
  test('is deterministic and never performs outbound work', async () => {
    const first = await runSyntheticReplay();
    const second = await runSyntheticReplay();

    assert.deepEqual(first, second);
    assert.equal(first.networkRequests, 0);
    assert.equal(first.outboundMessages, 0);
    assert.deepEqual(first.outcomes.map((outcome) => outcome.receipt.status), [
      'drafted', 'blocked', 'blocked', 'needs-human', 'observed', 'blocked', 'blocked',
      'drafted', 'blocked', 'drafted', 'blocked', 'observed', 'needs-human',
    ]);
    assert.equal(first.outcomes[0].draft.stationId, 'builder');
    assert.equal(first.outcomes[3].draft.stationId, 'care');
    assert.ok(first.outcomes.every((outcome) => outcome.receipt.outboundPerformed === false));
  });

  test('receipts contain fingerprints and no message or draft bodies', async () => {
    const session = await runSyntheticReplay();
    const serializedReceipts = JSON.stringify(session.outcomes.map((outcome) => outcome.receipt));

    assert.doesNotMatch(serializedReceipts, /deploy script fails/i);
    assert.doesNotMatch(serializedReceipts, /isolate the failing boundary/i);
    assert.doesNotMatch(serializedReceipts, /person-alex/i);
    for (const outcome of session.outcomes) {
      assert.match(outcome.receipt.eventFingerprint, /^[a-f0-9]{64}$/);
      assert.equal('content' in outcome.receipt, false);
    }
  });

  test('blocks bot authors, direct messages, and non-allowlisted channels', () => {
    const engine = new RelayEngine(createSyntheticConfig());
    const base = fixtureEvent();

    assert.equal(engine.route({ ...base, author: { ...base.author, bot: true } }).policy.code, 'blocked.bot-author');
    assert.equal(engine.route({ ...base, eventId: 'evt-dm', directMessage: true, guildId: null }).policy.code, 'blocked.direct-message');
    assert.equal(engine.route({ ...base, eventId: 'evt-other', channelId: 'lab-other' }).policy.code, 'blocked.channel-not-allowlisted');
  });

  test('enforces a deterministic per-channel cooldown', () => {
    const engine = new RelayEngine(createSyntheticConfig());
    const first = engine.route(fixtureEvent());
    const second = engine.route({
      ...fixtureEvent(),
      eventId: 'evt-second',
      timestamp: '2026-07-21T18:00:30.000Z',
    });

    assert.equal(first.receipt.status, 'drafted');
    assert.equal(second.policy.code, 'blocked.cooldown');
    assert.equal(second.draft, null);
  });

  test('holds drafts from human-review stations instead of delivering them', () => {
    const care = { ...fixtureEvent(), content: 'I feel stuck and worried.' };
    const held = new RelayEngine({ ...createSyntheticConfig(), mode: 'discord-send' }).route(care);
    const released = new RelayEngine({ ...createSyntheticConfig(), humanReviewStations: [] }).route(care);

    assert.equal(held.draft.stationId, 'care');
    assert.equal(held.receipt.status, 'needs-human');
    assert.equal(held.receipt.deliveryCode, 'held.human-review');
    assert.equal(held.trace[3].status, 'held');
    assert.equal(released.receipt.status, 'drafted');
  });

  test('breaks score ties by fixed station order and reports matched keywords', () => {
    const [winner, runnerUp] = scoreStations({ content: 'Worried the build broke again.', mentioned: false });

    assert.deepEqual([winner.stationId, winner.score, winner.matches], ['builder', 1, ['build']]);
    assert.deepEqual([runnerUp.stationId, runnerUp.score, runnerUp.matches], ['care', 1, ['worried']]);
  });

  test('rejects malformed and oversized events before routing', () => {
    const engine = new RelayEngine(createSyntheticConfig());
    assert.throws(() => engine.route({}), EventValidationError);
    assert.throws(
      () => engine.route({ ...fixtureEvent(), content: 'x'.repeat(1_001) }),
      (error) => error.code === 'event.content-too-long',
    );
  });
});

function fixtureEvent() {
  return {
    eventId: 'evt-first',
    guildId: 'lab-guild',
    channelId: 'lab-build',
    timestamp: '2026-07-21T18:00:00.000Z',
    directMessage: false,
    mentioned: false,
    content: 'How should we test this build error?',
    author: { id: 'person-test', bot: false },
  };
}
