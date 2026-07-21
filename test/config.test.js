import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createRuntimeConfig,
  createSyntheticConfig,
  RuntimeConfigurationError,
} from '../src/config.js';

describe('runtime configuration boundary', () => {
  test('defaults to synthetic mode without reading credential fields', () => {
    const environment = new Proxy({}, {
      get(_target, property) {
        if (property === 'AMBIENT_RELAY_MODE') return undefined;
        throw new Error(`unexpected environment read: ${String(property)}`);
      },
    });

    assert.deepEqual(createRuntimeConfig(environment), createSyntheticConfig());
  });

  test('requires exact live allowlists and keeps the token non-enumerable', () => {
    const marker = 'unit-test-credential-value-never-sent';
    const config = createRuntimeConfig({
      AMBIENT_RELAY_MODE: 'discord-observe',
      DISCORD_TOKEN: marker,
      AMBIENT_RELAY_GUILD_ID: '123456789012345678',
      AMBIENT_RELAY_CHANNEL_ID: '223456789012345678',
    });

    assert.equal(config.outboundEnabled, false);
    assert.equal(config.discordToken, marker);
    assert.doesNotMatch(JSON.stringify(config), /unit-test-credential/);
  });

  test('refuses send mode without the literal acknowledgement', () => {
    const environment = {
      AMBIENT_RELAY_MODE: 'discord-send',
      DISCORD_TOKEN: 'unit-test-credential-value-never-sent',
      AMBIENT_RELAY_GUILD_ID: '123456789012345678',
      AMBIENT_RELAY_CHANNEL_ID: '223456789012345678',
    };

    assert.throws(
      () => createRuntimeConfig(environment),
      (error) => error instanceof RuntimeConfigurationError && error.code === 'config.send-ack-required',
    );
  });

  test('refuses live mode without credentials rather than falling back', () => {
    assert.throws(
      () => createRuntimeConfig({ AMBIENT_RELAY_MODE: 'discord-observe' }),
      (error) => error.code === 'config.discord-token-required',
    );
  });
});
