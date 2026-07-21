# Security review

## Executive summary

The original prototype was not publishable as a credentialed bot. On 2026-07-22 its lockfile reported **14 known vulnerabilities, 9 high severity**, and its credential-free test command failed before running an assertion because of a broken NLP module export. It also started from network credentials, used random ambient triggers, contained token-shaped documentation placeholders, wrote broad file logs, and mixed Discord/API calls throughout a 17K-line surface.

The revival replaces that surface with a standard-library replay core and one isolated optional Discord dependency. The current lock audits clean. Synthetic replay is the default and verified path; live Discord behavior remains explicitly experimental.

## Resolved findings

### AR-01 — High — Vulnerable dependency graph

**Impact:** installing the original lock pulled multiple vulnerable and deprecated transitive packages into a token-bearing process.

The dependency graph was reduced from Discord, environment loading, YAML, NLP, sentiment, logging, and Redis packages to one exact optional `discord.js` version. The websocket transitive was refreshed to a patched release. `npm audit --audit-level=high` currently reports zero vulnerabilities.

### AR-02 — High — Network-first, secret-required default

**Impact:** a basic demo or test required live credentials and could initialize outbound-capable code.

`npm start` is now a synthetic replay that does not read credential fields and has no network-capable import. Live code requires the explicit `live` command and a live mode. No `.env` loader ships.

### AR-03 — High — Ambient, probabilistic outbound behavior

**Impact:** random triggers made costs and unsolicited messages difficult to reproduce or review.

Routing is deterministic. Send mode requires one exact guild, one exact channel, a bounded cooldown, and a literal acknowledgement. Bot authors and DMs are denied; unknown configuration fails closed.

### AR-04 — Moderate — Message/error bodies in logs

Broad logging could serialize message content, metadata, provider errors, and stack traces to local files. The revival writes no log files. The live logger selects enumerated receipt fields explicitly and discards raw exception messages.

### AR-05 — Moderate — Mention amplification

Discord content can contain mass mentions and crafted formatting. User content is never copied into deterministic drafts, and delivery sets `allowedMentions.parse` to an empty list with `repliedUser` disabled.

### AR-06 — Moderate — Tests tolerated missing configuration and broken setup

The previous tests caught setup failures and continued, while the actual suite did not load. The new Node test suite runs under an empty environment, fails on malformed events/configuration, and proves the checked-in artifact against executable output.

### AR-07 — Low — Token-shaped documentation placeholders

Credential-shaped examples were removed. The environment example is comment-only with blank values, is ignored by the secret scanner, and is never loaded automatically.

## Residual risk

- **Live Discord is not end-to-end verified.** The adapter compiles and its pure boundaries are tested, but no account, token, guild, permission set, rate limit, or real delivery was exercised.
- A Discord token remains a high-value process environment secret in live mode. Process inspection, shell history, crash tooling, or a compromised host can expose it.
- Message Content is a privileged intent. Observe mode still receives allowlisted channel content in memory even though it does not send or persist bodies.
- Cooldown state is in memory and resets on restart. Multiple processes would not share it and are unsupported.
- Receipts are stdout records, not signed, durable, append-only, or tamper evident. Fingerprints of predictable messages are vulnerable to guessing.
- There is no emergency stop control beyond terminating the local process or revoking the Discord token. Keep send mode attended.
- The Care station is a keyword-routed acknowledgement, not a mental-health or crisis system. It has no risk assessment, escalation, or trained-human handoff.
- Discord library behavior and advisories change. Dependabot and CI audit the lock, but operators must review updates before live use.
- CI actions are SHA-pinned, but npm registry packages and the Node runner remain supply-chain dependencies.
- The high-signal secret scan cannot prove that every possible credential format is absent.

## Reporting

Do not put tokens, real Discord messages, guild exports, or exploit payloads in public issues. Use GitHub private vulnerability reporting if enabled. Revoke a Discord token immediately if it may have entered a log, shell history, artifact, or commit.
