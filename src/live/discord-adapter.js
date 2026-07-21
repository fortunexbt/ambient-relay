import { RelayEngine } from '../core/relay-engine.js';

export class LiveAdapterError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LiveAdapterError';
    this.code = code;
  }
}

export async function startDiscordRelay(config, logger = createSafeLogger()) {
  if (!['discord-observe', 'discord-send'].includes(config.mode)) {
    throw new LiveAdapterError('live.mode-required');
  }

  let discord;
  try {
    discord = await import('discord.js');
  } catch {
    throw new LiveAdapterError('live.discord-library-missing');
  }

  const { Client, Events, GatewayIntentBits } = discord;
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  const engine = new RelayEngine(config);

  client.once(Events.ClientReady, () => {
    logger.info('discord.connected', { mode: config.mode });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.guildId !== config.allowedGuildId || message.channelId !== config.allowedChannelId) return;
    try {
      let outcome = engine.route(toRelayEvent(message, client.user));
      if (outcome.draft && config.outboundEnabled) {
        try {
          await message.reply(buildDeliveryPayload(outcome.draft));
          outcome = engine.finalizeDelivery(outcome, {
            performed: true,
            failed: false,
            code: 'discord.reply.sent',
          });
        } catch {
          outcome = engine.finalizeDelivery(outcome, {
            performed: false,
            failed: true,
            code: 'discord.reply.failed',
          });
        }
      }
      logger.receipt(outcome.receipt);
    } catch (error) {
      logger.error('discord.event-rejected', { type: safeErrorType(error) });
    }
  });

  client.on(Events.Error, () => logger.error('discord.client-error'));

  try {
    await client.login(config.discordToken);
  } catch {
    client.destroy();
    throw new LiveAdapterError('live.discord-login-failed');
  }

  return client;
}

export function toRelayEvent(message, botUser) {
  return {
    eventId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    timestamp: new Date(message.createdTimestamp).toISOString(),
    directMessage: message.guildId === null,
    mentioned: botUser ? message.mentions.has(botUser) : false,
    content: message.content,
    author: {
      id: message.author.id,
      bot: message.author.bot,
    },
  };
}

export function buildDeliveryPayload(draft) {
  return Object.freeze({
    content: `**[${draft.stationLabel}]** ${draft.content}`,
    allowedMentions: Object.freeze({ parse: Object.freeze([]), repliedUser: false }),
  });
}

export function createSafeLogger(output = process.stdout) {
  return Object.freeze({
    info(code, fields = {}) {
      output.write(`${JSON.stringify({
        level: 'info',
        code,
        ...(typeof fields.mode === 'string' ? { mode: fields.mode } : {}),
      })}\n`);
    },
    error(code, fields = {}) {
      output.write(`${JSON.stringify({
        level: 'error',
        code,
        ...(typeof fields.type === 'string' ? { type: fields.type } : {}),
      })}\n`);
    },
    receipt(receipt) {
      output.write(`${JSON.stringify({
        level: 'receipt',
        receiptId: receipt.receiptId,
        createdAt: receipt.createdAt,
        mode: receipt.mode,
        status: receipt.status,
        policyCode: receipt.policyCode,
        action: receipt.action,
        stationId: receipt.stationId,
        deliveryCode: receipt.deliveryCode,
        outboundPerformed: receipt.outboundPerformed,
        eventFingerprint: receipt.eventFingerprint,
        draftFingerprint: receipt.draftFingerprint,
      })}\n`);
    },
  });
}

function safeErrorType(error) {
  if (error?.name === 'EventValidationError') return 'EventValidationError';
  if (error?.name === 'TypeError') return 'TypeError';
  return 'UnknownError';
}
