#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { createRuntimeConfig, RuntimeConfigurationError } from './config.js';
import { startDiscordRelay, LiveAdapterError } from './live/discord-adapter.js';
import { renderTerminalProof } from './presentation/terminal.js';
import { runSyntheticReplay } from './replay.js';

export async function main(argumentsList = process.argv.slice(2)) {
  const command = argumentsList.find((argument) => !argument.startsWith('--')) || 'replay';
  const json = argumentsList.includes('--json');
  const noColor = argumentsList.includes('--no-color') || process.env.NO_COLOR !== undefined;

  if (command === 'help' || argumentsList.includes('--help')) {
    process.stdout.write(helpText());
    return;
  }

  if (command === 'replay') {
    const session = await runSyntheticReplay();
    process.stdout.write(json
      ? `${JSON.stringify(session, null, 2)}\n`
      : renderTerminalProof(session, { color: process.stdout.isTTY && !noColor }));
    return;
  }

  if (command === 'live') {
    const config = createRuntimeConfig();
    if (config.mode === 'synthetic') throw new RuntimeConfigurationError('live.mode-required');
    const client = await startDiscordRelay(config);
    const shutdown = () => {
      client.destroy();
      process.exitCode = 0;
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return;
  }

  throw new RuntimeConfigurationError('cli.command-invalid');
}

function helpText() {
  return [
    'Ambient Relay — local Discord automation lab',
    '',
    '  ambient-relay replay [--json] [--no-color]   deterministic offline proof',
    '  ambient-relay live                           explicitly configured Discord adapter',
    '  ambient-relay help                           show this help',
    '',
    'Replay is always synthetic and ignores live credentials.',
  ].join('\n') + '\n';
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    const code = error instanceof RuntimeConfigurationError || error instanceof LiveAdapterError
      ? error.code
      : 'runtime.failed-safely';
    process.stderr.write(`Ambient Relay refused to start: ${code}\n`);
    process.exitCode = 1;
  });
}
