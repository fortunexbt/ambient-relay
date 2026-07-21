# Architecture

Ambient Relay is split at the network boundary. The replay engine is pure Node.js and cannot import Discord. The Discord adapter is dynamically imported only by the explicit `live` CLI command.

## Invariants

1. `npm start` always runs the synthetic replay and ignores live credentials.
2. Synthetic configuration does not access credential fields, even if the parent environment contains them.
3. The core has no network, filesystem-write, timer, random, AI, Redis, or logging dependency.
4. Every valid event crosses the same human/bot, guild/DM, guild allowlist, channel allowlist, mode, and cooldown checks.
5. Drafts never include user content, so Discord mention/Markdown payloads cannot be reflected into an outbound message.
6. Discord delivery suppresses `@everyone`, role, user, and replied-user mention expansion.
7. Receipts contain fixed metadata and fingerprints, never message bodies, usernames, attachments, drafts, token values, or exception strings.
8. `discord-send` requires a token, exact snowflake allowlists, and a literal acknowledgement. There is no permissive fallback.

## Components

| Component | Responsibility |
| --- | --- |
| `event.js` | Validate a bounded Discord-shaped envelope and discard unused fields |
| `policy.js` | Fail closed on bots, DMs, non-allowlisted locations, unknown modes, and cooldown |
| `stations.js` | Deterministically select one fixed local response template |
| `relay-engine.js` | Order normalization → policy → route → delivery state → receipt |
| `receipt.js` | Reduce events and drafts to SHA-256 fingerprints and enumerated metadata |
| `replay.js` | Load only the packaged fixture and report zero network/outbound operations |
| `discord-adapter.js` | Map allowlisted Discord events and optionally deliver one reply |
| `terminal.js` | Render an inspectable proof from the same outcomes used by tests |

## Data handling

Message content exists transiently inside the normalized event so the station router can classify it. The engine hashes a canonical subset containing event, location, author, timestamp, and content, then drops that envelope from its returned outcome. A returned outcome contains only policy checks, a fixed draft when selected, route trace, and reduced receipt.

The live adapter prints JSON receipt lines to stdout. It does not write files or provide a durable audit store. Operators who redirect stdout are responsible for securing that destination.

SHA-256 is used for deterministic correlation, not anonymization or attestation. Low-entropy messages can be guessed, and a local process can fabricate receipts.

## Live delivery sequence

1. `createRuntimeConfig` verifies an explicit live mode, token presence, exact numeric guild/channel IDs, cooldown bounds, and send acknowledgement when applicable.
2. `discord.js` is dynamically imported. Missing packages fail closed.
3. The client subscribes only to Guilds, Guild Messages, and Message Content intents.
4. Events outside the exact guild/channel pair are dropped before routing.
5. The core gate and deterministic router run.
6. Observe mode emits only a receipt. Send mode emits one fixed-template reply with all allowed mentions disabled.
7. Success or failure revises the receipt using stable delivery codes. Raw provider errors are discarded.

The live path has unit coverage at its pure boundaries but no live-account end-to-end test. It should remain labelled experimental until a disposable test guild verifies login, permissions, observe behavior, send acknowledgement, Discord rate-limit handling, and graceful shutdown.
