const Step2 = ({
  expanded, prevComplete, itselfComplete,
  serviceAccountJson, serviceAccountError,
  setServiceAccountJson, setServiceAccountError,
  setStep2Complete, setExpandedSteps
}) => {
  if (!expanded) return null;

  if (!prevComplete) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
        Complete Step 1 first to unlock this step.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
      {itselfComplete ? (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
          <Check size={20} />
          <span className="font-medium">Service account configured</span>
        </div>
      ) : (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-blue-800 font-medium mb-2">Create a service account in your GCP project:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
              <li>Go to <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud IAM → Service Accounts</a></li>
              <li>Select your project from the dropdown at the top</li>
              <li>Click "+ Create Service Account"</li>
              <li>Name: <code className="bg-blue-100 px-1">secureagent</code></li>
              <li>Grant roles: <strong>Compute Admin</strong>, <strong>Service Account User</strong>, <strong>Project Billing Manager</strong>, and <strong>Service Usage Admin</strong></li>
              <li>After creation, click <strong>Actions → Manage keys → Add key → Create new key</strong></li>
              <li>Select <strong>JSON</strong> and download</li>
              <li>Open the JSON file, copy all content, paste below</li>
            </ol>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Paste service account JSON key:</label>
            <textarea
              value={serviceAccountJson ? JSON.stringify(serviceAccountJson, null, 2) : ''}
              onChange={(e) => {
                setServiceAccountError(null);
                try {
                  const parsed = JSON.parse(e.target.value);
                  if (!parsed.private_key) throw new Error('invalid');
                  setServiceAccountJson(parsed);
                } catch (err) {
                  setServiceAccountError('Invalid JSON. Paste the complete service account JSON file.');
                }
              }}
              placeholder='{"type": "service_account", "project_id": "...", "private_key": "..."}'
              className="w-full h-40 px-4 py-2 border-2 border-gray-200 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-400"
            />
            {serviceAccountError && <p className="text-red-600 text-sm mt-1">{serviceAccountError}</p>}
          </div>

          <button
            onClick={() => {
              if (serviceAccountJson && serviceAccountJson.project_id) {
                setStep2Complete(true);
                setExpandedSteps(prev => [...prev, 3]);
              } else {
                setServiceAccountError('Please paste a valid service account JSON');
              }
            }}
            disabled={!serviceAccountJson}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
          >
            Continue
          </button>

          <div className="mt-4 pt-4 border-t">
            <p className="text-gray-600 text-sm">Don't want to create a service account?</p>
            <button
              onClick={() => { setStep2Complete(true); setExpandedSteps(prev => [...prev, 3]); }}
              className="text-blue-600 hover:text-blue-700 text-sm underline"
            >
              Skip to manual VM setup
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Step2;
