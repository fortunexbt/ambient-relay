import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildDeliveryPayload,
  createSafeLogger,
  isDeliverable,
  reviewUrl,
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

  test('delivers only drafted receipts, never held or blocked ones', () => {
    const send = { outboundEnabled: true };
    const observe = { outboundEnabled: false };

    assert.equal(isDeliverable({ receipt: { status: 'drafted' } }, send), true);
    assert.equal(isDeliverable({ receipt: { status: 'drafted' } }, observe), false);
    assert.equal(isDeliverable({ receipt: { status: 'needs-human' } }, send), false);
    assert.equal(isDeliverable({ receipt: { status: 'blocked' } }, send), false);
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
    assert.doesNotMatch(output, /reviewUrl/);
  });

  test('held receipts carry a link to the message, not its text', () => {
    let output = '';
    const logger = createSafeLogger({ write: (chunk) => { output += chunk; } });
    const message = { id: '323456789012345679', guildId: '123456789012345678', channelId: '223456789012345678' };
    logger.receipt({ receiptId: 'relay_test', status: 'needs-human' }, reviewUrl(message));

    assert.equal(
      JSON.parse(output).reviewUrl,
      'https://discord.com/channels/123456789012345678/223456789012345678/323456789012345679',
    );
  });
});
