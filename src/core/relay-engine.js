import { normalizeEvent } from './event.js';
import { evaluatePolicy } from './policy.js';
import { createReceipt, reviseReceipt } from './receipt.js';
import { selectStation } from './stations.js';

export class RelayEngine {
  #lastDraftByChannel = new Map();

  constructor(config) {
    this.config = config;
  }

  route(input) {
    const event = normalizeEvent(input);
    const lastDraftAt = this.#lastDraftByChannel.get(event.channelId);
    const policy = evaluatePolicy(event, this.config, lastDraftAt);
    const draft = policy.allowed ? selectStation(event) : null;

    if (draft) {
      this.#lastDraftByChannel.set(event.channelId, Date.parse(event.timestamp));
    }

    const delivery = initialDelivery(this.config.mode, Boolean(draft));
    const receipt = createReceipt({ event, config: this.config, policy, draft, delivery });
    const trace = Object.freeze([
      stage('normalize', 'complete', 'event.valid'),
      stage('policy', policy.allowed ? 'complete' : 'held', policy.code),
      stage('route', draft ? 'complete' : 'quiet', draft ? `station.${draft.stationId}` : 'route.no-draft'),
      stage('delivery', delivery.performed ? 'complete' : 'dry-run', delivery.code),
      stage('receipt', 'complete', 'receipt.body-free'),
    ]);

    return Object.freeze({ policy, draft, receipt, trace });
  }

  finalizeDelivery(outcome, delivery) {
    return Object.freeze({
      ...outcome,
      receipt: reviseReceipt(outcome.receipt, delivery),
      trace: Object.freeze(outcome.trace.map((item) => (
        item.stage === 'delivery'
          ? stage('delivery', delivery.performed ? 'complete' : 'held', delivery.code)
          : item
      ))),
    });
  }
}

function initialDelivery(mode, hasDraft) {
  if (!hasDraft) return Object.freeze({ performed: false, failed: false, code: 'delivery.not-requested' });
  if (mode === 'discord-send') return Object.freeze({ performed: false, failed: false, code: 'delivery.awaiting-explicit-send' });
  if (mode === 'discord-observe') return Object.freeze({ performed: false, failed: false, code: 'observe.no-send' });
  return Object.freeze({ performed: false, failed: false, code: 'dry-run.synthetic-default' });
}

function stage(stageName, status, code) {
  return Object.freeze({ stage: stageName, status, code });
}
