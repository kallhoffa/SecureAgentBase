const Step4 = ({
  expanded, prevComplete, itselfComplete,
  firebaseConfigStaging, firebaseConfigProduction,
  firebaseStagingData, firebaseProductionData,
  setFirebaseConfigStaging, setFirebaseConfigProduction,
  handleSetupFirebase
}) => {
  if (!expanded) return null;

  if (!prevComplete) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
        Complete Step 3 first to unlock this step.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
      {itselfComplete ? (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
          <Check size={20} />
          <span className="font-medium">Firebase configured: Staging ({firebaseStagingData.projectId}), Production ({firebaseProductionData.projectId})</span>
        </div>
      ) : (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-blue-800 font-medium mb-3">Set up Firebase for staging and production:</p>
            <p className="text-blue-700 text-sm mb-4">
              Follow these steps for <strong>each</strong> environment (staging and production):
            </p>
            <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm mb-4">
              <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">Firebase Console</a></li>
              <li>Click "Add project" → enter name (e.g., "my-app-staging") → disable Google Analytics → Create</li>
              <li>Once created, click "Build" → "Hosting" → "Get started" → "Continue" (skip the CLI steps)</li>
              <li>Click the gear icon ⚙️ → "Project settings"</li>
              <li>Scroll to "Your apps" → click the web icon &lt;/&gt; → Register app → "Add Firebase SDK" → copy just the <code className="bg-blue-100 px-1">firebaseConfig</code> object</li>
            </ol>
            <p className="text-blue-700 text-sm font-medium">
              Repeat for both staging and production, then paste both configs below.
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Staging Firebase SDK config:</label>
            <textarea
              value={firebaseConfigStaging}
              onChange={(e) => setFirebaseConfigStaging(e.target.value)}
              placeholder='{"apiKey": "AIza...", "authDomain": "my-app-staging.firebaseapp.com", "projectId": "my-app-staging", ...}'
              className="w-full h-28 px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-400"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Production Firebase SDK config:</label>
            <textarea
              value={firebaseConfigProduction}
              onChange={(e) => setFirebaseConfigProduction(e.target.value)}
              placeholder='{"apiKey": "AIza...", "authDomain": "my-app-production.firebaseapp.com", "projectId": "my-app-production", ...}'
              className="w-full h-28 px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-400"
            />
          </div>

          <button
            onClick={handleSetupFirebase}
            disabled={!firebaseConfigStaging.trim() || !firebaseConfigProduction.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
          >
            Configure Firebase
          </button>
        </>
      )}
    </div>
  );
};

export default Step4;
