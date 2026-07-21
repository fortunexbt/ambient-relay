const LIVE_MODES = new Set(['discord-observe', 'discord-send']);
const SNOWFLAKE = /^\d{17,20}$/;

export class RuntimeConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RuntimeConfigurationError';
    this.code = code;
  }
}

export function createSyntheticConfig() {
  return Object.freeze({
    mode: 'synthetic',
    allowedGuildId: 'lab-guild',
    allowedChannelId: 'lab-build',
    cooldownMs: 60_000,
    outboundEnabled: false,
  });
}

export function createRuntimeConfig(environment = process.env) {
  const mode = environment.AMBIENT_RELAY_MODE || 'synthetic';
  if (mode === 'synthetic') return createSyntheticConfig();
  if (!LIVE_MODES.has(mode)) throw new RuntimeConfigurationError('config.mode-invalid');

  const token = requireString(environment.DISCORD_TOKEN, 'config.discord-token-required');
  const allowedGuildId = requireSnowflake(
    environment.AMBIENT_RELAY_GUILD_ID,
    'config.guild-allowlist-required',
  );
  const allowedChannelId = requireSnowflake(
    environment.AMBIENT_RELAY_CHANNEL_ID,
    'config.channel-allowlist-required',
  );

  if (mode === 'discord-send' && environment.AMBIENT_RELAY_SEND_ACK !== 'I_ACCEPT_ONE_CHANNEL_SENDS') {
    throw new RuntimeConfigurationError('config.send-ack-required');
  }

  const config = {
    mode,
    allowedGuildId,
    allowedChannelId,
    cooldownMs: readCooldown(environment.AMBIENT_RELAY_COOLDOWN_MS),
    outboundEnabled: mode === 'discord-send',
  };
  Object.defineProperty(config, 'discordToken', {
    value: token,
    enumerable: false,
    writable: false,
  });
  return Object.freeze(config);
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.trim().length < 20) {
    throw new RuntimeConfigurationError(code);
  }
  return value;
}

function requireSnowflake(value, code) {
  if (typeof value !== 'string' || !SNOWFLAKE.test(value)) {
    throw new RuntimeConfigurationError(code);
  }
  return value;
}

function readCooldown(value) {
  if (value === undefined || value === '') return 60_000;
  if (!/^\d+$/.test(value)) throw new RuntimeConfigurationError('config.cooldown-invalid');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 3_600_000) {
    throw new RuntimeConfigurationError('config.cooldown-invalid');
  }
  return parsed;
}
