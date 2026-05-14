const Step6 = ({
  expanded, prevComplete, itselfComplete,
  discordClientId, setDiscordClientId,
  discordBotTokenInput, setDiscordBotTokenInput,
  discordBotToken, discordInviteUrl,
  discordGuildId,
  setDiscordInviteUrl,
  handleCreateDiscordBot,
  discordDetecting, error
}) => {
  if (!expanded) return null;

  if (!prevComplete) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
        Complete Step 5 first to unlock this step.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
      {itselfComplete ? (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
          <Check size={20} />
          <span className="font-medium">Discord bot configured</span>
        </div>
      ) : (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-blue-800 font-medium mb-2">Create a Discord bot:</p>
            <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm">
              <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="underline font-medium">Discord Developer Portal</a></li>
              <li>Click "New Application" → give it a name (e.g., "Kimaki")</li>
              <li>Go to "Bot" in the left sidebar → click "Add Bot"</li>
              <li>Go to "OAuth2" → "General" → set <strong>"Default Install Link" to "None"</strong></li>
              <li>Go to "Bot" → "General Information" → <strong>disable "Public Bot"</strong></li>
              <li>In "Bot", scroll to "Privileged Gateway Intents" → enable <strong>Message Content Intent</strong></li>
              <li>Go to "Bot" → click "Reset Token" → copy the token</li>
              <li>Enter the token below, then click "Generate Invite Link" to invite the bot to your server</li>
              <li>Enable Developer Mode in Discord (<strong>User Settings → Advanced → Developer Mode</strong>), then right-click your server name → <strong>Copy Server ID</strong></li>
            </ol>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Discord Application Client ID:</label>
            <input
              type="text"
              value={discordClientId}
              onChange={(e) => setDiscordClientId(e.target.value)}
              placeholder="1183128561748410098"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
            <p className="text-gray-500 text-xs mt-1">
              Found in Discord Developer Portal → General Information → Application ID
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Discord Bot Token:</label>
            <input
              type="password"
              value={discordBotTokenInput}
              onChange={(e) => {
                setDiscordBotTokenInput(e.target.value);
                setDiscordInviteUrl('');
              }}
              placeholder="MTE4MzEyODU2MTc0ODQxMDA5OH.GxXxXx.xxxxxxxx"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
            <p className="text-gray-500 text-xs mt-1">
              Your bot token from Discord Developer Portal → Bot → Reset Token
            </p>
          </div>

          {discordInviteUrl && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 text-sm mb-2 font-medium">Invite URL generated!</p>
              <a
                href={discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline text-sm break-all"
              >
                {discordInviteUrl}
              </a>
              <p className="text-green-700 text-xs mt-2">
                Open this link to invite your bot to your Discord server.
              </p>
            </div>
          )}

          {discordBotToken && !discordGuildId && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-700 text-sm">
                Bot token saved but no Discord server detected. Make sure the bot is in your server using the invite link above.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={handleCreateDiscordBot}
            disabled={!discordBotTokenInput.trim() || discordDetecting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            {discordDetecting ? (
              <>
                <span className="animate-spin">⟳</span>
                Saving...
              </>
            ) : (
              'Save Discord Bot'
            )}
          </button>
        </>
      )}
    </div>
  );
};

export default Step6;
