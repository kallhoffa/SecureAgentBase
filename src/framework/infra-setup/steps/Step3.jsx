const Step3 = ({
  expanded, prevComplete, stepComplete,
  projectId, serviceAccountJson,
  setProjectId, setStep3Complete, expandNextStep, setError
}) => {
  if (!expanded) return null;

  if (!prevComplete) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
        Complete Step 2 first to unlock this step.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
      {stepComplete ? (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
          <Check size={20} />
          <span className="font-medium">Project configured: {projectId}</span>
        </div>
      ) : (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-blue-800 font-medium mb-2">Enter your GCP Project ID:</p>
            <p className="text-blue-700 text-sm mb-3">
              This is the project where your VM will be created. It should match the <code className="bg-blue-100 px-1">project_id</code> in your service account JSON.
            </p>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="my-gcp-project-123"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
            {serviceAccountJson?.project_id && (
              <p className="text-blue-600 text-sm mt-2">
                From your service account: <code className="bg-blue-100 px-1">{serviceAccountJson.project_id}</code>
                <button
                  onClick={() => setProjectId(serviceAccountJson.project_id)}
                  className="ml-2 text-blue-600 underline text-xs"
                >
                  Use this
                </button>
              </p>
            )}
          </div>
          <button
            onClick={() => {
              if (projectId.trim()) {
                setStep3Complete(true);
                expandNextStep(3);
              } else {
                setError('Please enter a GCP project ID');
              }
            }}
            disabled={!projectId.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
};

export default Step3;
