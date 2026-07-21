import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildDeliveryPayload,
  createSafeLogger,
  toRelayEvent,
} from '../src/live/discord-adapter.js';

describe('Discord adapter pure boundary', () => {
  test('suppresses every allowed-mention expansion', () => {
    const payload = buildDeliveryPayload({
      stationLabel: 'Builder station',
      content: 'A deterministic draft.',
    });

    assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false });
    assert.equal(payload.content, '**[Builder station]** A deterministic draft.');
  });

  test('maps only the event fields required by the relay engine', () => {
    const event = toRelayEvent({
      id: '123456789012345678',
      guildId: '223456789012345678',
      channelId: '323456789012345678',
      createdTimestamp: Date.parse('2026-07-21T18:00:00.000Z'),
      content: 'How do we test this?',
      author: { id: '423456789012345678', bot: false, username: 'not-copied' },
      mentions: { has: () => false },
      attachments: new Map([['private', { url: 'not-copied' }]]),
    }, { id: 'bot' });

    assert.equal(event.content, 'How do we test this?');
    assert.equal('username' in event.author, false);
    assert.equal('attachments' in event, false);
  });

  test('safe logger serializes receipt metadata without arbitrary context', () => {
    let output = '';
    const logger = createSafeLogger({ write: (chunk) => { output += chunk; } });
    logger.receipt({ receiptId: 'relay_test', status: 'drafted' });

    assert.match(output, /"level":"receipt"/);
    assert.doesNotMatch(output, /content|token|username/i);
  });
});
