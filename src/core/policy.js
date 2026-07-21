export function evaluatePolicy(event, config, lastDraftAt) {
  const checks = [
    check('author.human', !event.author.bot),
    check('context.guild-only', !event.directMessage && event.guildId !== null),
    check('guild.allowlisted', event.guildId === config.allowedGuildId),
    check('channel.allowlisted', event.channelId === config.allowedChannelId),
    check('mode.explicit', ['synthetic', 'discord-observe', 'discord-send'].includes(config.mode)),
  ];

  const eventTime = Date.parse(event.timestamp);
  const cooldownOpen = lastDraftAt === undefined || eventTime - lastDraftAt >= config.cooldownMs;
  checks.push(check('cooldown.open', cooldownOpen));

  const failed = checks.find((item) => !item.passed);
  if (!failed) {
    return Object.freeze({ allowed: true, code: 'allowed.route-evaluation', checks });
  }

  const codes = {
    'author.human': 'blocked.bot-author',
    'context.guild-only': 'blocked.direct-message',
    'guild.allowlisted': 'blocked.guild-not-allowlisted',
    'channel.allowlisted': 'blocked.channel-not-allowlisted',
    'mode.explicit': 'blocked.invalid-mode',
    'cooldown.open': 'blocked.cooldown',
  };
  return Object.freeze({ allowed: false, code: codes[failed.code], checks });
}

function check(code, passed) {
  return Object.freeze({ code, passed });
}
