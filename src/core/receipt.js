import { fingerprint } from './hash.js';

export function createReceipt({ event, config, policy, draft, delivery }) {
  const eventFingerprint = fingerprint({
    eventId: event.eventId,
    guildId: event.guildId,
    channelId: event.channelId,
    authorId: event.author.id,
    timestamp: event.timestamp,
    content: event.content,
  });
  const draftFingerprint = draft
    ? fingerprint({ stationId: draft.stationId, content: draft.content })
    : null;

  const status = statusFor(policy, draft, delivery);
  const seed = {
    eventFingerprint,
    draftFingerprint,
    mode: config.mode,
    policyCode: policy.code,
    deliveryCode: delivery.code,
    outboundPerformed: delivery.performed,
  };

  return Object.freeze({
    receiptId: `relay_${fingerprint(seed).slice(0, 16)}`,
    createdAt: event.timestamp,
    mode: config.mode,
    status,
    policyCode: policy.code,
    action: draft ? 'draft.reply' : 'none',
    stationId: draft?.stationId ?? null,
    deliveryCode: delivery.code,
    outboundPerformed: delivery.performed,
    eventFingerprint,
    draftFingerprint,
  });
}

export function reviseReceipt(receipt, delivery) {
  const seed = {
    priorReceiptId: receipt.receiptId,
    deliveryCode: delivery.code,
    outboundPerformed: delivery.performed,
  };
  return Object.freeze({
    ...receipt,
    receiptId: `relay_${fingerprint(seed).slice(0, 16)}`,
    status: delivery.performed ? 'sent' : delivery.failed ? 'failed' : receipt.status,
    deliveryCode: delivery.code,
    outboundPerformed: delivery.performed,
  });
}

function statusFor(policy, draft, delivery) {
  if (!policy.allowed) return 'blocked';
  if (!draft) return 'observed';
  if (delivery.performed) return 'sent';
  if (delivery.failed) return 'failed';
  return 'drafted';
}
