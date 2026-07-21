const STATIONS = Object.freeze([
  Object.freeze({
    id: 'builder',
    label: 'Builder station',
    categories: ['technical'],
    keywords: ['api', 'bug', 'build', 'code', 'database', 'deploy', 'error', 'script', 'server', 'test'],
    response: 'I would isolate the failing boundary, reproduce it with the smallest fixture, then add a regression check before changing behavior.',
  }),
  Object.freeze({
    id: 'care',
    label: 'Care station',
    categories: ['emotional'],
    keywords: ['anxious', 'exhausted', 'feel', 'frustrated', 'overwhelmed', 'sad', 'stuck', 'worried'],
    response: 'That sounds heavy. Name the smallest part you want witnessed or untangled, and we can stay with that.',
  }),
  Object.freeze({
    id: 'guide',
    label: 'Guide station',
    categories: ['question'],
    keywords: ['?', 'explain', 'help', 'how', 'what', 'when', 'where', 'why'],
    response: 'Start by defining the outcome and constraint; then choose one reversible next step and a signal that tells you it worked.',
  }),
]);

export function selectStation(event) {
  const lowered = event.content.toLowerCase();
  const candidates = STATIONS.map((station, index) => {
    const matches = station.keywords.filter((keyword) => lowered.includes(keyword)).length;
    const mentionBoost = station.id === 'guide' && event.mentioned ? 1 : 0;
    return { station, score: matches + mentionBoost, index };
  })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  if (candidates.length === 0) return null;
  const winner = candidates[0];
  return Object.freeze({
    stationId: winner.station.id,
    stationLabel: winner.station.label,
    category: winner.station.categories[0],
    score: winner.score,
    content: winner.station.response,
  });
}

export function listStations() {
  return STATIONS.map(({ id, label, categories }) => ({ id, label, categories: [...categories] }));
}
