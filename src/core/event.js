const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_CONTENT_LENGTH = 1_000;

export class EventValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'EventValidationError';
    this.code = code;
  }
}

export function normalizeEvent(input) {
  if (!isRecord(input)) throw new EventValidationError('event.invalid-object');
  if (!isRecord(input.author)) throw new EventValidationError('event.invalid-author');

  const content = cleanContent(input.content);
  const timestamp = normalizeTimestamp(input.timestamp);
  const directMessage = input.directMessage === true;
  const guildId = directMessage ? null : readIdentifier(input.guildId, 'event.invalid-guild');

  return Object.freeze({
    eventId: readIdentifier(input.eventId, 'event.invalid-id'),
    guildId,
    channelId: readIdentifier(input.channelId, 'event.invalid-channel'),
    timestamp,
    directMessage,
    mentioned: input.mentioned === true,
    content,
    author: Object.freeze({
      id: readIdentifier(input.author.id, 'event.invalid-author-id'),
      bot: input.author.bot === true,
    }),
  });
}

function cleanContent(value) {
  if (typeof value !== 'string') throw new EventValidationError('event.invalid-content');
  const content = value.replace(CONTROL_CHARACTERS, '').trim();
  if (content.length === 0) throw new EventValidationError('event.empty-content');
  if (content.length > MAX_CONTENT_LENGTH) throw new EventValidationError('event.content-too-long');
  return content;
}

function readIdentifier(value, code) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new EventValidationError(code);
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string') throw new EventValidationError('event.invalid-timestamp');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new EventValidationError('event.invalid-timestamp');
  return date.toISOString();
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
