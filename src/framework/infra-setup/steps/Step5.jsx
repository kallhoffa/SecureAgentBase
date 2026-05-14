const Step5 = ({
  expanded, prevComplete, itselfComplete,
  githubPat, setGithubPat, setError,
  githubApiFetch, setGithubRepoName,
  setupOidcInfrastructure, uploadGitHubVars,
  oidcSetupStatus, oidcSetupStep,
  githubVarUploaded, githubRepoName,
  gcpSaStagingEmail, gcpSaProductionEmail,
  githubVarUploading, setExpandedSteps,
  expandedSteps, error
}) => {
  if (!expanded) return null;

  if (!prevComplete) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
        Complete Step 4 first to unlock this step.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
      {itselfComplete ? (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
          <Check size={20} />
          <span className="font-medium">GitHub auth configured</span>
        </div>
      ) : (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-blue-800 font-medium mb-2">Create a GitHub Personal Access Token:</p>
            <p className="text-blue-700 text-sm mb-3">
              The VM needs this to push/pull code from your repo. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token.
            </p>
            <p className="text-blue-700 text-sm mb-2">
              <strong>Required scopes:</strong> <code className="bg-blue-100 px-1">repo</code>, <code className="bg-blue-100 px-1">workflow</code>, <code className="bg-blue-100 px-1">read:org</code>
            </p>
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,workflow,read:org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-sm"
            >
              Create Token on GitHub
            </a>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Enter your GitHub PAT:</label>
            <input
              type="password"
              value={githubPat}
              onChange={(e) => setGithubPat(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
            <p className="text-gray-500 text-xs mt-1">
              Will be encrypted and sent to your VM for GitHub authentication
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={async () => {
              setError(null);
              if (githubPat.trim() && githubPat.startsWith('ghp_')) {
                try {
                  const userData = await githubApiFetch(githubPat, '/user');
                  const owner = userData.login;
                  const repoName = `${owner}/SecureAgentBase`;
                  setGithubRepoName(repoName);

                  await setupOidcInfrastructure();

                  await uploadGitHubVars();

                  if (!expandedSteps.includes(6)) {
                    setExpandedSteps(prev => [...prev, 6]);
                  }
                } catch (err) {
                  setError('GitHub setup failed: ' + err.message);
                }
              } else {
                setError('Please enter a valid GitHub PAT (starts with ghp_)');
              }
            }}
            disabled={!githubPat.trim() || githubVarUploading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
          >
            {githubVarUploading ? 'Setting up OIDC...' : 'Save & Setup OIDC Deployment'}
          </button>

          {oidcSetupStatus === 'creating' && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm font-medium">{oidcSetupStep}</span>
              </div>
            </div>
          )}

          {oidcSetupStatus === 'done' && githubVarUploaded && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700">
                <Check size={18} />
                <span className="text-sm font-medium">
                  OIDC configured & GitHub variables uploaded. Repo: {githubRepoName}
                </span>
              </div>
              <p className="text-green-600 text-xs mt-1">
                Staging SA: {gcpSaStagingEmail} | Prod SA: {gcpSaProductionEmail}
              </p>
            </div>
          )}

          {oidcSetupStatus === 'error' && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={18} />
              <span className="text-red-700 text-sm">{oidcSetupStep}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Step5;
