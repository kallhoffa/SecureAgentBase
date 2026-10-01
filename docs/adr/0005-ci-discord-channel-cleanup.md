# CI cleans up the Discord channel it creates

The e2e VM runs `kimaki project add`, which creates a guild text channel named after
the project (`agentbase-testing`) in every guild the Discord bot belongs to. Crashed or
cancelled runs left these channels behind; they accumulate as duplicates and clutter
the guild.

We added `scripts/e2e-discord-cleanup.sh`, run as a pre-flight step (clears leftovers
before a run) and as an `if: always()` teardown step (clears the channel a partial run
just created) in both the staging and production gate workflows. For safety the script
only deletes guild-text channels whose name matches `E2E_PROJECT_NAME` exactly — never
categories, voice channels, the default `kimaki`/`kimaki-<bot>` channel, or any other
text channel. Deletion works because the wizard's Discord invite link grants
`MANAGE_CHANNELS` (permissions `2147551248`). An optional `E2E_DISCORD_GUILD_ID`
repository variable scopes cleanup to a dedicated test server.

**Status:** accepted
**Considered Options:** (a) reuse a single channel and clear messages (rejected — channel-per-run is kimaki's model, and message clearing needs additional permissions); (b) delete every kimaki channel (rejected — too broad; the script matches by name instead); (c) idempotent name-scoped pre-flight + always-teardown (adopted)
**Consequences:** the cleanup depends on the bot holding `MANAGE_CHANNELS`; if it does
not, Discord returns 403 and the step logs a warning and continues rather than
failing the run. An `E2E_DISCORD_GUILD_ID` variable further limits the blast radius to
a single test server.