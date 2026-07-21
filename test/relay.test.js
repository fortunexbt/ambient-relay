import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSyntheticConfig } from '../src/config.js';
import { EventValidationError } from '../src/core/event.js';
import { RelayEngine } from '../src/core/relay-engine.js';
import { runSyntheticReplay } from '../src/replay.js';

describe('synthetic replay', () => {
  test('is deterministic and never performs outbound work', async () => {
    const first = await runSyntheticReplay();
    const second = await runSyntheticReplay();

    assert.deepEqual(first, second);
    assert.equal(first.networkRequests, 0);
    assert.equal(first.outboundMessages, 0);
    assert.equal(first.outcomes.length, 4);
    assert.equal(first.outcomes[0].draft.stationId, 'builder');
    assert.equal(first.outcomes[1].receipt.status, 'blocked');
    assert.equal(first.outcomes[2].draft.stationId, 'care');
    assert.equal(first.outcomes[3].receipt.status, 'observed');
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
