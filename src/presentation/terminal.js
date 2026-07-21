const WIDTH = 76;

export function renderTerminalProof(session, options = {}) {
  const useColor = options.color === true;
  const tone = colorizer(useColor);
  const lines = [];
  lines.push('╭' + '─'.repeat(WIDTH - 2) + '╮');
  lines.push(frame('AMBIENT RELAY  /  LOCAL DISCORD AUTOMATION LAB'));
  lines.push(frame('MODE synthetic  ·  NETWORK none  ·  OUTBOUND disabled'));
  lines.push('╰' + '─'.repeat(WIDTH - 2) + '╯');
  lines.push('');

  for (const outcome of session.outcomes) {
    const policyTone = outcome.policy.allowed ? tone.green : tone.red;
    lines.push(tone.dim(`┌─ EVENT ${outcome.eventId}`));
    lines.push(`│ policy   ${policyTone(outcome.policy.code)}`);
    lines.push(`│ route    ${outcome.draft ? tone.green(`station.${outcome.draft.stationId}`) : tone.dim('no draft')}`);
    if (outcome.draft) {
      const wrapped = wrap(outcome.draft.content, 62);
      lines.push(`│ draft    ${wrapped[0]}`);
      for (const continuation of wrapped.slice(1)) lines.push(`│          ${continuation}`);
    }
    lines.push(`│ receipt  ${outcome.receipt.receiptId}  /  ${outcome.receipt.status}`);
    lines.push(`│ event    ${shortHash(outcome.receipt.eventFingerprint)}`);
    lines.push(`│ outbound ${tone.orange('NOT SENT')}  /  ${outcome.receipt.deliveryCode}`);
    lines.push(tone.dim('└' + '─'.repeat(WIDTH - 1)));
    lines.push('');
  }

  const drafted = session.outcomes.filter((item) => item.draft).length;
  const blocked = session.outcomes.filter((item) => item.receipt.status === 'blocked').length;
  const observed = session.outcomes.filter((item) => item.receipt.status === 'observed').length;
  lines.push('REPLAY RECEIPT');
  lines.push(`fixture ${session.fixtureId}@${session.fixtureVersion}`);
  lines.push(`events ${session.outcomes.length}  ·  drafted ${drafted}  ·  blocked ${blocked}  ·  observed ${observed}`);
  lines.push(`network ${session.networkRequests}  ·  outbound ${session.outboundMessages}`);
  lines.push('proof: synthetic fixture only; no Discord session or AI provider was contacted.');
  return lines.join('\n') + '\n';
}

function frame(content) {
  const inner = WIDTH - 4;
  return `│ ${content.padEnd(inner)} │`;
}

function wrap(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function shortHash(value) {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function colorizer(enabled) {
  const apply = (code) => (value) => enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
  return {
    dim: apply('2'),
    green: apply('32'),
    red: apply('31'),
    orange: apply('38;5;208'),
  };
}
