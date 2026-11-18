import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/martian-mono/latin-400.css';
import './styles.css';

import { createSyntheticConfig } from '../../src/config.js';
import { normalizeEvent } from '../../src/core/event.js';
import { replayFixture } from '../../src/core/session.js';
import { listStations, scoreStations } from '../../src/core/stations.js';
import fixture from '../../src/fixtures/discord-events.json';

type RawEvent = (typeof fixture.events)[number];
type Verdict = 'reply' | 'human' | 'suppressed';

interface Outcome {
  policy: { allowed: boolean; code: string; checks: readonly { code: string; passed: boolean }[] };
  draft: { stationId: string; stationLabel: string; content: string } | null;
  receipt: { receiptId: string; status: string; deliveryCode: string; eventFingerprint: string; outboundPerformed: boolean };
}

interface Policy {
  cooldownMs: number;
  allowedChannelId: string;
  humanReviewStations: string[];
}

const BASE = createSyntheticConfig();
const DEFAULT_POLICY: Policy = {
  cooldownMs: BASE.cooldownMs,
  allowedChannelId: BASE.allowedChannelId,
  humanReviewStations: [...BASE.humanReviewStations],
};
const STATIONS = listStations();
const EVENTS: RawEvent[] = fixture.events;
const GUILD_CHANNELS = [...new Set(EVENTS.filter((e) => !e.directMessage).map((e) => e.channelId))];
const COOLDOWNS = [
  { label: 'Off', value: 0 },
  { label: '60 s', value: 60_000 },
  { label: '5 min', value: 300_000 },
];
// Indexed by the data-scenario buttons in index.html.
const SCENARIOS: { policy: Partial<Policy>; eventId: string }[] = [
  { policy: { cooldownMs: 0 }, eventId: 'evt-03-same-error' },
  { policy: { allowedChannelId: 'lab-random' }, eventId: 'evt-07-slides' },
  { policy: { humanReviewStations: [] }, eventId: 'evt-04-overwhelmed' },
];
// Board column order, left to right.
const VERDICTS: Verdict[] = ['reply', 'human', 'suppressed'];
const VERDICT_LABEL: Record<Verdict, string> = {
  reply: 'Drafted',
  human: 'Held for a human',
  suppressed: 'No reply',
};
const OUTLET_LABEL: Record<Verdict, string> = {
  reply: 'Drafted',
  human: 'Held',
  suppressed: 'No reply',
};
const BLOCK_LABEL: Record<string, string> = {
  'blocked.bot-author': 'bot author',
  'blocked.direct-message': 'direct message',
  'blocked.guild-not-allowlisted': 'server not allowlisted',
  'blocked.channel-not-allowlisted': 'channel not allowlisted',
  'blocked.invalid-mode': 'invalid mode',
  'blocked.cooldown': 'cooldown',
};
const CHECK_LABEL: Record<string, string> = {
  'author.human': 'Author is a person',
  'context.guild-only': 'Posted in a server, not a DM',
  'guild.allowlisted': 'Server is allowlisted',
  'channel.allowlisted': 'Channel is allowlisted',
  'mode.explicit': 'Mode is explicit',
  'cooldown.open': 'Channel cooldown has passed',
};
const STEP_MS = 1100;

interface RelayConfig {
  mode: string;
  allowedGuildId: string;
  allowedChannelId: string;
  cooldownMs: number;
  humanReviewStations: readonly string[];
  outboundEnabled: boolean;
}

const replay = (config: RelayConfig): readonly Outcome[] => replayFixture(fixture, config as typeof BASE).outcomes;
const baseline = replay(BASE);
const state = {
  policy: clonePolicy(DEFAULT_POLICY),
  index: EVENTS.length - 1,
  outcomes: baseline,
  playing: 0,
};

const $ = <T extends Element>(selector: string) => document.querySelector(selector) as T;
const play = $<HTMLButtonElement>('.play');
const events = $<HTMLOListElement>('.events');
const decision = $<HTMLElement>('.decision');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function clonePolicy(policy: Policy): Policy {
  return { ...policy, humanReviewStations: [...policy.humanReviewStations] };
}

function recompute() {
  const config = Object.freeze({
    ...BASE,
    cooldownMs: state.policy.cooldownMs,
    allowedChannelId: state.policy.allowedChannelId,
    humanReviewStations: Object.freeze([...state.policy.humanReviewStations]),
  });
  state.outcomes = replay(config);
}

function verdictOf(outcome: Outcome): Verdict {
  if (outcome.receipt.status === 'drafted') return 'reply';
  if (outcome.receipt.status === 'needs-human') return 'human';
  return 'suppressed';
}

function signature(outcome: Outcome) {
  return `${outcome.receipt.status}|${outcome.policy.code}|${outcome.draft?.stationId ?? ''}`;
}

function changed(i: number) {
  return signature(state.outcomes[i]) !== signature(baseline[i]);
}

function shortReason(outcome: Outcome) {
  if (!outcome.policy.allowed) return BLOCK_LABEL[outcome.policy.code] ?? outcome.policy.code;
  if (!outcome.draft) return 'no keyword match';
  return stationLabel(outcome.draft.stationId);
}

function stationLabel(id: string) {
  return STATIONS.find((s) => s.id === id)?.label.replace(' station', '') ?? id;
}

function author(event: RawEvent) {
  return event.author.bot ? `${event.author.id.replace(/^bot-/, '')}-bot` : event.author.id.replace(/^person-/, '');
}

function channelLabel(event: RawEvent) {
  return event.directMessage ? `DM from ${author(event)}` : `#${event.channelId}`;
}

function time(event: RawEvent) {
  return event.timestamp.slice(11, 19);
}

function duration(ms: number) {
  return ms >= 60_000 ? `${ms / 60_000} min` : `${ms / 1000} s`;
}

function quoteList(words: readonly string[]) {
  return words.map((w) => `“${w}”`).join(', ');
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function messageHtml(event: RawEvent) {
  return event.mentioned
    ? `<span class="mention">@relay</span> ${escape(event.content.replace(/^@relay\s*/, ''))}`
    : escape(event.content);
}

function reasonFor(outcome: Outcome, event: RawEvent) {
  const code = outcome.policy.code;
  if (code === 'blocked.bot-author') return 'Sent by a bot. Bot messages never trigger the relay, so two bots can’t talk each other into a loop.';
  if (code === 'blocked.direct-message') return 'A direct message. The relay only answers inside the allowlisted server channel.';
  if (code === 'blocked.guild-not-allowlisted') return 'This server isn’t on the allowlist.';
  if (code === 'blocked.channel-not-allowlisted') {
    return `#${event.channelId} isn’t the allowlisted channel. The relay only reads #${state.policy.allowedChannelId}.`;
  }
  if (code === 'blocked.cooldown') {
    return `The relay drafted something in #${event.channelId} less than ${duration(state.policy.cooldownMs)} ago. One draft per channel per window.`;
  }
  if (!outcome.draft) return 'No Builder, Care or Guide keyword matched, so the relay stays quiet.';

  const [winner, runnerUp] = scoreStations(normalizeEvent(event));
  const label = stationLabel(winner.stationId);
  let text = `${label} matched ${quoteList(winner.matches)} (score ${winner.score}).`;
  if (runnerUp.score === winner.score) {
    text += ` Tied with ${stationLabel(runnerUp.stationId)}, and ties go to the fixed order Builder, Care, Guide.`;
  }
  if (outcome.receipt.status === 'needs-human') text += ` ${label} drafts are held for a person to read. Nothing is sent.`;
  return text;
}

function buildEvents() {
  events.innerHTML = EVENTS.map((event, i) => `<li class="ev" data-index="${i}" style="--i:${i}">
      <button class="ev-hit" type="button" data-index="${i}">
        <time class="ev-time" datetime="${event.timestamp}">${time(event)}</time>
        <span class="ev-who">${escape(author(event))}${event.author.bot ? '<span class="tag-bot">bot</span>' : ''}</span>
        <span class="ev-where${event.directMessage ? ' dm' : ''}">${escape(event.directMessage ? 'DM' : `#${event.channelId}`)}</span>
        <span class="ev-text">${messageHtml(event)}</span>
        <span class="track" aria-hidden="true">
          <span class="rail"></span>
          ${VERDICTS.map((v) => `<span class="socket socket-${v}"></span>`).join('')}
          <span class="ghost"></span>
          <span class="lamp"></span>
        </span>
      </button>
    </li>`).join('');
}

function renderEvents() {
  const pendingFrom = state.playing ? state.index + 1 : EVENTS.length;
  events.querySelectorAll<HTMLLIElement>('.ev').forEach((item, i) => {
    const verdict = verdictOf(state.outcomes[i]);
    const was = verdictOf(baseline[i]);
    item.style.setProperty('--col', String(VERDICTS.indexOf(verdict)));
    item.style.setProperty('--was', String(VERDICTS.indexOf(was)));
    item.dataset.verdict = verdict;
    item.classList.toggle('current', i === state.index);
    item.classList.toggle('changed', changed(i));
    item.classList.toggle('moved', verdict !== was);
    item.classList.toggle('pending', i >= pendingFrom);
    const button = item.querySelector('.ev-hit')!;
    button.setAttribute('aria-current', i === state.index ? 'true' : 'false');
    button.setAttribute('aria-label', `${author(EVENTS[i])} at ${time(EVENTS[i])} in ${channelLabel(EVENTS[i])}: ${VERDICT_LABEL[verdict]}${changed(i) ? ', changed from the default policy' : ''}`);
    item.querySelector<HTMLElement>('.ev-where')!.classList.toggle('open', EVENTS[i].channelId === state.policy.allowedChannelId);
  });
}

function renderHead() {
  const event = EVENTS[state.index];
  const verdict = verdictOf(state.outcomes[state.index]);
  $<HTMLOutputElement>('.position').innerHTML = `Event ${state.index + 1} of ${EVENTS.length}<span class="sr">, ${time(event)}, ${VERDICT_LABEL[verdict]}</span>`;

  const counts = { reply: 0, human: 0, suppressed: 0 };
  const defaults = { reply: 0, human: 0, suppressed: 0 };
  state.outcomes.forEach((o) => counts[verdictOf(o)]++);
  baseline.forEach((o) => defaults[verdictOf(o)]++);
  $<HTMLOListElement>('.outlets').innerHTML = VERDICTS.map((v) => {
    const delta = counts[v] - defaults[v];
    const note = delta ? `<span class="delta">${delta > 0 ? '+' : '−'}${Math.abs(delta)}<span class="sr"> against the default policy</span></span>` : '';
    return `<li class="outlet outlet-${v}"><span class="outlet-name">${OUTLET_LABEL[v]}</span> <span class="outlet-count">${counts[v]}${note}</span></li>`;
  }).join('');
}

function renderDecision() {
  const i = state.index;
  const event = EVENTS[i];
  const outcome = state.outcomes[i];
  const verdict = verdictOf(outcome);
  const firstFail = outcome.policy.checks.find((c) => !c.passed)?.code;
  const scores = outcome.policy.allowed ? scoreStations(normalizeEvent(event)) : [];
  const before = baseline[i];

  decision.dataset.verdict = verdict;
  decision.innerHTML = `
    <h2 class="sr">Decision</h2>
    <header class="d-head">
      <p class="d-event"><span class="d-id">${escape(event.eventId)}</span><span>${time(event)}</span><span>${escape(channelLabel(event))}</span></p>
      <blockquote class="d-quote"><span class="d-author">${escape(author(event))}${event.author.bot ? ' <span class="tag-bot">bot</span>' : ''}</span> ${messageHtml(event)}</blockquote>
      <p class="signal"><span class="signal-lamp" aria-hidden="true"></span><span class="signal-word">${VERDICT_LABEL[verdict]}</span></p>
      ${changed(i) ? `<p class="was">The default policy gave ${VERDICT_LABEL[verdictOf(before)].toLowerCase()}, ${escape(shortReason(before))}.</p>` : ''}
      <p class="reason">${escape(reasonFor(outcome, event))}</p>
    </header>
    <ol class="steps">
      <li class="step"><h3>Policy gate</h3>
        <ul class="checks">${outcome.policy.checks.map((c) => `<li class="${c.passed ? 'pass' : 'fail'}${c.code === firstFail ? ' first' : ''}">
          <span class="tick" aria-hidden="true"></span>
          <span>${CHECK_LABEL[c.code] ?? c.code}</span><span class="sr">${c.passed ? 'passed' : 'failed'}</span></li>`).join('')}
        </ul>
      </li>
      <li class="step"><h3>Station router</h3>
        ${scores.length ? `<table class="scores"><thead><tr><th scope="col">Station</th><th scope="col">Score</th><th scope="col">Matched</th></tr></thead><tbody>
          ${scores.map((s, n) => `<tr class="${n === 0 && s.score > 0 ? 'win' : ''}"><th scope="row">${stationLabel(s.stationId)}</th><td class="num">${s.score}</td><td>${s.matches.length ? escape(s.matches.join(' ')) : '–'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="skip-note">Not reached. The gate stopped this event first.</p>'}
      </li>
      ${outcome.draft ? `<li class="step"><h3>Draft from ${escape(outcome.draft.stationLabel)}, ${verdict === 'reply' ? 'not sent' : 'held for a human'}</h3><p class="draft">${escape(outcome.draft.content)}</p></li>` : ''}
      <li class="step"><h3>Receipt</h3>
        <dl class="receipt">
          <dt>id</dt><dd>${outcome.receipt.receiptId}</dd>
          <dt>status</dt><dd>${outcome.receipt.status}</dd>
          <dt>policy</dt><dd>${outcome.policy.code}</dd>
          <dt>delivery</dt><dd>${outcome.receipt.deliveryCode}</dd>
          <dt>event</dt><dd>${outcome.receipt.eventFingerprint.slice(0, 16)}…</dd>
          <dt>sent</dt><dd>${outcome.receipt.outboundPerformed ? 'yes' : 'no'}</dd>
        </dl>
      </li>
    </ol>`;
}

function segmented(container: HTMLElement, name: string, options: { label: string; value: string }[], onPick: (value: string) => void) {
  container.innerHTML = options.map((o) => `<label><input type="radio" name="${name}" value="${o.value}" /><span>${o.label}</span></label>`).join('');
  container.addEventListener('change', (e) => onPick((e.target as HTMLInputElement).value));
}

function buildPolicies() {
  segmented($('[data-policy="cooldown"]'), 'cooldown', COOLDOWNS.map((c) => ({ label: c.label, value: String(c.value) })), (v) => {
    state.policy.cooldownMs = Number(v);
    update();
  });
  segmented($('[data-policy="channel"]'), 'channel', GUILD_CHANNELS.map((id) => ({ label: `#${id}`, value: id })), (v) => {
    state.policy.allowedChannelId = v;
    update();
  });
  const review = $<HTMLElement>('[data-policy="review"]');
  review.innerHTML = STATIONS.map((s) => `<label class="switch"><input type="checkbox" role="switch" value="${s.id}" /><span class="knob" aria-hidden="true"></span><span>${s.label.replace(' station', '')}</span></label>`).join('');
  review.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const set = new Set(state.policy.humanReviewStations);
    if (input.checked) set.add(input.value);
    else set.delete(input.value);
    state.policy.humanReviewStations = STATIONS.map((s) => s.id).filter((id) => set.has(id));
    update();
  });

  $<HTMLElement>('.try').addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-scenario]');
    if (!button) return;
    stop();
    const key = button.dataset.scenario!;
    if (key === 'reset') {
      state.policy = clonePolicy(DEFAULT_POLICY);
      state.index = EVENTS.length - 1;
    } else {
      const scenario = SCENARIOS[Number(key)];
      state.policy = { ...clonePolicy(DEFAULT_POLICY), ...scenario.policy };
      state.index = EVENTS.findIndex((ev) => ev.eventId === scenario.eventId);
    }
    update();
    if ($('.board').getBoundingClientRect().top < 0) {
      $('.board').scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    }
  });
}

function renderPolicies() {
  const current = JSON.stringify(state.policy);
  SCENARIOS.forEach((scenario, n) => {
    const pressed = JSON.stringify({ ...DEFAULT_POLICY, ...scenario.policy }) === current;
    $(`[data-scenario="${n}"]`).setAttribute('aria-pressed', String(pressed));
  });
  document.querySelectorAll<HTMLInputElement>('input[name="cooldown"]').forEach((i) => { i.checked = Number(i.value) === state.policy.cooldownMs; });
  document.querySelectorAll<HTMLInputElement>('input[name="channel"]').forEach((i) => { i.checked = i.value === state.policy.allowedChannelId; });
  document.querySelectorAll<HTMLInputElement>('[data-policy="review"] input').forEach((i) => { i.checked = state.policy.humanReviewStations.includes(i.value); });
}

function update() {
  recompute();
  renderEvents();
  renderHead();
  renderDecision();
  renderPolicies();
}

function select(index: number, focus = false) {
  state.index = Math.min(EVENTS.length - 1, Math.max(0, index));
  renderEvents();
  renderHead();
  renderDecision();
  const button = events.querySelectorAll<HTMLButtonElement>('.ev-hit')[state.index];
  if (focus) button.focus();
  else if (state.playing) button.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

function stop() {
  window.clearInterval(state.playing);
  state.playing = 0;
  play.classList.remove('playing');
  play.setAttribute('aria-label', 'Play replay');
  renderEvents();
}

function start() {
  play.classList.add('playing');
  play.setAttribute('aria-label', 'Pause replay');
  state.playing = window.setInterval(() => {
    if (state.index >= EVENTS.length - 1) return stop();
    select(state.index + 1);
  }, STEP_MS);
  select(state.index >= EVENTS.length - 1 ? 0 : state.index);
}

buildEvents();
buildPolicies();
update();
// Lamp transitions are for policy changes, not for the first paint.
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('ready')));

play.addEventListener('click', () => (state.playing ? stop() : start()));
events.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('.ev');
  if (!item) return;
  stop();
  select(Number(item.dataset.index));
});
events.addEventListener('keydown', (e) => {
  const step = { ArrowDown: 1, ArrowUp: -1, Home: -EVENTS.length, End: EVENTS.length }[e.key];
  if (!step) return;
  e.preventDefault();
  stop();
  select(state.index + step, true);
});
