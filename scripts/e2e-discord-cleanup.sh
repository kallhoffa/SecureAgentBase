#!/usr/bin/env bash
# Removes the Discord channels created by the e2e rig.
#
# The e2e VM's `kimaki project add` creates a GUILD TEXT channel named after
# the project dir (E2E_PROJECT_NAME, default "agentbase-testing") in every
# guild the bot is in (see kimaki's createProjectChannels()). Leftover
# channels accumulate across runs. This script deletes only those channels.
#
# SAFETY: never deletes anything but guild text channels (type == 0) whose
# name matches E2E_PROJECT_NAME EXACTLY. Categories, voice channels, the
# default kimaki/kimaki-<bot> channel, and any other text channel are
# untouched. Optional E2E_DISCORD_GUILD_ID scopes cleanup to one guild.
#
# Requires the bot to have MANAGE_CHANNELS in the target guild (the wizard's
# invite link permissions=2147551248 includes it); otherwise DELETE returns
# 403 and the script logs a warning and continues.
set -u

TOKEN="${E2E_DISCORD_BOT_TOKEN:-}"
GUILD_ONLY="${E2E_DISCORD_GUILD_ID:-}"
CHANNEL_NAME="${E2E_PROJECT_NAME:-agentbase-testing}"

if [ -z "$TOKEN" ]; then
  echo "e2e-discord-cleanup: E2E_DISCORD_BOT_TOKEN not set — skipping"
  exit 0
fi

API="https://discord.com/api/v10"
AUTH=(-H "Authorization: Bot ${TOKEN}" -H "Content-Type: application/json")

echo "e2e-discord-cleanup: looking for #${CHANNEL_NAME} channels$([ -n "$GUILD_ONLY" ] && echo " in guild ${GUILD_ONLY}")"

guilds=$(curl -s "${AUTH[@]}" "${API}/users/@me/guilds")
if ! echo "$guilds" | jq -e 'type == "array"' >/dev/null 2>&1; then
  echo "e2e-discord-cleanup: WARNING could not list guilds (bad token / not in any guild): $(echo "$guilds" | head -c 200)"
  exit 0
fi

deleted=0
for guild_id in $(echo "$guilds" | jq -r '.[].id'); do
  if [ -n "$GUILD_ONLY" ] && [ "$guild_id" != "$GUILD_ONLY" ]; then
    continue
  fi

  channels=$(curl -s "${AUTH[@]}" "${API}/guilds/${guild_id}/channels")
  if ! echo "$channels" | jq -e 'type == "array"' >/dev/null 2>&1; then
    echo "e2e-discord-cleanup: WARNING could not list channels for guild ${guild_id}: $(echo "$channels" | head -c 200)"
    continue
  fi

  ids=$(echo "$channels" | jq -r --arg n "$CHANNEL_NAME" '.[] | select(.type == 0 and .name == $n) | .id')
  for channel_id in $ids; do
    resp=$(curl -s -X DELETE "${AUTH[@]}" "${API}/channels/${channel_id}")
    if echo "$resp" | jq -e '(.id // empty) != ""' >/dev/null 2>&1; then
      echo "e2e-discord-cleanup: deleted #${CHANNEL_NAME} channel ${channel_id} in guild ${guild_id}"
      deleted=$((deleted + 1))
    else
      echo "e2e-discord-cleanup: WARNING delete of ${channel_id} failed: $(echo "$resp" | head -c 200)"
    fi
  done
done

echo "e2e-discord-cleanup: done — ${deleted} channel(s) deleted"