import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
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
const VERDICT_LABEL: Record<Verdict, string> = {
  reply: 'Would reply',
  human: 'Needs human',
  suppressed: 'Suppressed',
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
const AVATAR_HUES = [24, 152, 205, 268, 330, 88];
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
const scrub = $<HTMLInputElement>('.scrub');
const play = $<HTMLButtonElement>('.play');
const messages = $<HTMLOListElement>('.messages');
const decision = $<HTMLElement>('.decision');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width: 820px)');

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

function hue(id: string) {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return AVATAR_HUES[sum % AVATAR_HUES.length];
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
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
    text += ` Tied with ${stationLabel(runnerUp.stationId)}; ties go to the fixed order Builder, Care, Guide.`;
  }
  if (outcome.receipt.status === 'needs-human') text += ` ${label} drafts are held for a person to read. Nothing is sent.`;
  return text;
}

function verdictBlock(outcome: Outcome) {
  const verdict = verdictOf(outcome);
  if (verdict === 'suppressed') {
    return `<p class="quiet"><span class="dot" aria-hidden="true"></span>Relay stays quiet · ${escape(shortReason(outcome))}</p>`;
  }
  const tag = verdict === 'reply' ? 'Draft · not sent' : 'Held for a human';
  return `<div class="ghost ghost-${verdict}">
    <span class="avatar relay-avatar" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 22a10 10 0 0 1 0-12M26 10a10 10 0 0 1 0 12M11 19a5 5 0 0 1 0-6M21 13a5 5 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="16" r="2.6" fill="currentColor"/></svg></span>
    <div class="body">
      <p class="meta"><span class="name">relay</span><span class="tag tag-${verdict}">${tag}</span><span class="station">${escape(outcome.draft!.stationLabel)}</span></p>
      <p class="text">${escape(outcome.draft!.content)}</p>
    </div>
  </div>`;
}

function buildMessages() {
  messages.innerHTML = EVENTS.map((event, i) => {
    const offChannel = event.directMessage || event.channelId !== 'lab-build';
    return `<li class="msg" data-index="${i}">
      <div class="post">
        <span class="avatar" style="--h:${hue(event.author.id)}" aria-hidden="true">${escape(author(event)[0].toUpperCase())}</span>
        <div class="body">
          <p class="meta">
            <button class="hit" type="button" data-index="${i}"><span class="name">${escape(author(event))}</span></button>
            ${event.author.bot ? '<span class="tag tag-bot">Bot</span>' : ''}
            <time class="mono" datetime="${event.timestamp}">${time(event)}</time>
            ${offChannel ? `<span class="where">${escape(channelLabel(event))}</span>` : ''}
          </p>
          <p class="text">${event.mentioned
            ? `<span class="mention">@relay</span> ${escape(event.content.replace(/^@relay\s*/, ''))}`
            : escape(event.content)}</p>
        </div>
      </div>
      <div class="verdict"></div>
    </li>`;
  }).join('');
}

function renderMessages() {
  messages.querySelectorAll<HTMLLIElement>('.msg').forEach((item, i) => {
    item.hidden = i > state.index;
    item.classList.toggle('current', i === state.index);
    item.classList.toggle('changed', changed(i));
    const button = item.querySelector('.hit')!;
    button.setAttribute('aria-current', i === state.index ? 'true' : 'false');
    button.setAttribute('aria-label', `${author(EVENTS[i])} at ${time(EVENTS[i])}: ${VERDICT_LABEL[verdictOf(state.outcomes[i])]}`);
    const slot = item.querySelector<HTMLElement>('.verdict')!;
    const key = signature(state.outcomes[i]);
    if (slot.dataset.key !== key) {
      slot.dataset.key = key;
      slot.innerHTML = verdictBlock(state.outcomes[i]);
    }
  });
}

function scrollToCurrent(instant = reducedMotion.matches) {
  const stream = messages.parentElement!;
  const current = messages.querySelector<HTMLElement>('.msg.current');
  if (!current) return;
  const view = stream.getBoundingClientRect();
  const item = current.getBoundingClientRect();
  const top = view.top + $<HTMLElement>('.stream-head').offsetHeight;
  const delta = item.bottom > view.bottom ? Math.min(item.bottom - view.bottom + 16, item.top - top) : item.top < top ? item.top - top : 0;
  if (delta) stream.scrollBy({ top: delta, behavior: instant ? 'auto' : 'smooth' });
}

function renderDecision() {
  const i = state.index;
  const event = EVENTS[i];
  const outcome = state.outcomes[i];
  const verdict = verdictOf(outcome);
  const firstFail = outcome.policy.checks.find((c) => !c.passed)?.code;
  const scores = outcome.policy.allowed ? scoreStations(normalizeEvent(event)) : [];
  const before = baseline[i];

  decision.innerHTML = `
    <h2 class="sr">Decision</h2>
    <header class="d-head">
      <p class="d-event mono">${escape(event.eventId)} · ${time(event)} · ${escape(channelLabel(event))}</p>
      <p class="stamp stamp-${verdict}">${VERDICT_LABEL[verdict]}</p>
      ${changed(i) ? `<p class="was">Default policy: ${VERDICT_LABEL[verdictOf(before)]} · ${escape(shortReason(before))}</p>` : ''}
    </header>
    <p class="reason">${escape(reasonFor(outcome, event))}</p>
    <ol class="steps">
      <li class="step"><h3>Policy gate</h3>
        <ul class="checks">${outcome.policy.checks.map((c) => `<li class="${c.passed ? 'pass' : 'fail'}${c.code === firstFail ? ' first' : ''}">
          <span class="mark-${c.passed ? 'pass' : 'fail'}" aria-hidden="true"></span>
          <span>${CHECK_LABEL[c.code] ?? c.code}</span><span class="sr">${c.passed ? 'passed' : 'failed'}</span></li>`).join('')}
        </ul>
      </li>
      <li class="step"><h3>Station router</h3>
        ${scores.length ? `<table class="scores"><thead><tr><th scope="col">Station</th><th scope="col">Score</th><th scope="col">Matched</th></tr></thead><tbody>
          ${scores.map((s, n) => `<tr class="${n === 0 && s.score > 0 ? 'win' : ''}"><th scope="row">${stationLabel(s.stationId)}</th><td class="mono">${s.score}</td><td>${s.matches.length ? escape(s.matches.join(' ')) : '–'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="skip-note">Not reached. The gate stopped this event first.</p>'}
      </li>
      ${outcome.draft ? `<li class="step"><h3>Draft</h3><p class="draft">${escape(outcome.draft.content)}</p></li>` : ''}
      <li class="step"><h3>Receipt</h3>
        <dl class="receipt mono">
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

function buildTimeline() {
  scrub.max = String(EVENTS.length);
  $<HTMLOListElement>('.ticks').innerHTML = EVENTS.map(() => '<li></li>').join('');
}

function renderTimeline() {
  scrub.value = String(state.index + 1);
  const event = EVENTS[state.index];
  scrub.setAttribute('aria-valuetext', `Event ${state.index + 1} of ${EVENTS.length}, ${time(event)}, ${VERDICT_LABEL[verdictOf(state.outcomes[state.index])]}`);
  $<HTMLOutputElement>('.position').innerHTML = `${state.index + 1}/${EVENTS.length} · ${time(event)}<span class="sr">, ${VERDICT_LABEL[verdictOf(state.outcomes[state.index])]}</span>`;
  $<HTMLOListElement>('.ticks').querySelectorAll('li').forEach((tick, i) => {
    tick.className = `tick-${verdictOf(state.outcomes[i])}${changed(i) ? ' changed' : ''}${i <= state.index ? ' seen' : ''}${i === state.index ? ' at' : ''}`;
  });
}

function buildRail() {
  $<HTMLUListElement>('.channels').innerHTML = GUILD_CHANNELS.map((id) => `<li data-channel="${id}"><span class="hash" aria-hidden="true">#</span>${id}<span class="allow">allowlisted</span></li>`).join('');
  $<HTMLUListElement>('.dms').innerHTML = EVENTS.filter((e) => e.directMessage).map((e) => `<li>${escape(author(e))}</li>`).join('');
}

function renderRail() {
  document.querySelectorAll<HTMLLIElement>('.channels li').forEach((li) => {
    li.classList.toggle('allowed', li.dataset.channel === state.policy.allowedChannelId);
  });
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

  const tryGroup = $<HTMLElement>('.try');
  tryGroup.addEventListener('click', (e) => {
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
    scrollToCurrent();
    if ($('.channel').getBoundingClientRect().bottom > innerHeight) {
      $(narrow.matches ? '.channel' : '.timeline').scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
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

  const counts = { reply: 0, human: 0, suppressed: 0 };
  const defaults = { reply: 0, human: 0, suppressed: 0 };
  state.outcomes.forEach((o) => counts[verdictOf(o)]++);
  baseline.forEach((o) => defaults[verdictOf(o)]++);
  const diff = (v: Verdict) => {
    const delta = counts[v] - defaults[v];
    return delta ? `<span class="delta">${delta > 0 ? '+' : '−'}${Math.abs(delta)}</span>` : '';
  };
  $<HTMLElement>('.tally').innerHTML = (['reply', 'human', 'suppressed'] as Verdict[])
    .map((v) => `<div class="tally-${v}"><dt>${VERDICT_LABEL[v]}</dt><dd><span class="mono">${counts[v]}</span>${diff(v)}</dd></div>`).join('');
}

function update() {
  recompute();
  renderMessages();
  renderTimeline();
  renderDecision();
  renderRail();
  renderPolicies();
}

function select(index: number) {
  state.index = Math.min(EVENTS.length - 1, Math.max(0, index));
  renderMessages();
  renderTimeline();
  renderDecision();
  scrollToCurrent();
}

function stop() {
  window.clearInterval(state.playing);
  state.playing = 0;
  play.classList.remove('playing');
  play.setAttribute('aria-label', 'Play replay');
}

function start() {
  if (state.index >= EVENTS.length - 1) select(0);
  play.classList.add('playing');
  play.setAttribute('aria-label', 'Pause replay');
  state.playing = window.setInterval(() => {
    if (state.index >= EVENTS.length - 1) return stop();
    select(state.index + 1);
  }, STEP_MS);
}

buildTimeline();
buildMessages();
buildRail();
buildPolicies();
update();
scrollToCurrent(true);
// Entrance transitions are for scrubbing, not for the first paint.
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('ready')));

scrub.addEventListener('input', () => {
  stop();
  select(Number(scrub.value) - 1);
});
play.addEventListener('click', () => (state.playing ? stop() : start()));
messages.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('.msg');
  if (!item) return;
  stop();
  select(Number(item.dataset.index));
});
