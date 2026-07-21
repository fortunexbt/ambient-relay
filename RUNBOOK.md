# Operator runbook

## Verified mode: synthetic replay

```bash
npm start
```

Expected footer:

```text
events 4  ·  drafted 2  ·  blocked 1  ·  observed 1
network 0  ·  outbound 0
```

No install or environment configuration is required. If the counts or checked-in receipt IDs change, review the fixture, policy, station templates, and artifact diff together.

## Verification

```bash
npm ci --ignore-scripts
npm run check
npm audit --audit-level=high
```

`npm run check` performs syntax checks, 14 focused tests, deterministic artifact comparison, and a high-signal credential/placeholder scan.

## Experimental mode: Discord observe

Observe mode opens a Discord gateway connection and receives content from one exact guild/channel pair. It never calls `message.reply`.

Before starting:

- use a disposable test guild;
- create a dedicated bot with Message Content intent enabled;
- grant View Channel and Read Message History only;
- provide `AMBIENT_RELAY_MODE=discord-observe` through a controlled process environment;
- provide the token plus exact guild and channel IDs without storing them in the repository;
- confirm stdout is not redirected to an insecure or long-lived destination.

Then run `npm run live`. Expect a `discord.connected` JSON record followed by reduced receipt records. Stop with `Ctrl-C`.

## Experimental mode: Discord send

Send mode adds Send Messages permission and must remain attended. In addition to observe configuration, set `AMBIENT_RELAY_MODE=discord-send` and provide the exact acknowledgement described in the README.

Start in a quiet test channel. Send one technical question and verify exactly one fixed Builder response. Immediately stop the process if it replies outside the allowlisted channel, expands a mention, emits message content to stdout, or sends more than once inside the configured cooldown.

## Incident response

1. Terminate the process.
2. Revoke and rotate the Discord token in the Developer Portal.
3. Remove the bot from the guild if the scope is uncertain.
4. Inspect shell history, process-manager configuration, redirected stdout, crash reports, and commits for credential exposure—without copying the token into a ticket.
5. Review receipt metadata for outbound activity, remembering that it is neither durable nor authoritative.
6. Return to synthetic replay until the cause has a focused regression test.

## Configuration reference

| Variable | Required when | Meaning |
| --- | --- | --- |
| `AMBIENT_RELAY_MODE` | Live only | `discord-observe` or `discord-send` |
| `DISCORD_TOKEN` | Live only | Dedicated bot credential; non-enumerable in runtime config |
| `AMBIENT_RELAY_GUILD_ID` | Live only | Exact 17–20 digit guild allowlist |
| `AMBIENT_RELAY_CHANNEL_ID` | Live only | Exact 17–20 digit channel allowlist |
| `AMBIENT_RELAY_COOLDOWN_MS` | Optional live | 1,000–3,600,000 ms; defaults to 60,000 |
| `AMBIENT_RELAY_SEND_ACK` | Send only | Literal acknowledgement required by the runtime gate |
