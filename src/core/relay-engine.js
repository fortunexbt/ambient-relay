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

    const delivery = initialDelivery(this.config, draft);
    const receipt = createReceipt({ event, config: this.config, policy, draft, delivery });
    const trace = Object.freeze([
      stage('normalize', 'complete', 'event.valid'),
      stage('policy', policy.allowed ? 'complete' : 'held', policy.code),
      stage('route', draft ? 'complete' : 'quiet', draft ? `station.${draft.stationId}` : 'route.no-draft'),
      stage('delivery', delivery.performed ? 'complete' : delivery.held ? 'held' : 'dry-run', delivery.code),
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

function initialDelivery(config, draft) {
  if (!draft) return delivery('delivery.not-requested');
  if (config.humanReviewStations.includes(draft.stationId)) return delivery('held.human-review', true);
  if (config.mode === 'discord-send') return delivery('delivery.awaiting-explicit-send');
  if (config.mode === 'discord-observe') return delivery('observe.no-send');
  return delivery('dry-run.synthetic-default');
}

function delivery(code, held = false) {
  return Object.freeze({ performed: false, failed: false, held, code });
}

function stage(stageName, status, code) {
  return Object.freeze({ stage: stageName, status, code });
}
