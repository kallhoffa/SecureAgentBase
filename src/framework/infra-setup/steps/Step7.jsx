const Step7 = ({
  expanded, prevComplete,
  isVmComplete, showRecreateOptions,
  vmIp, vmZone, setVmZone, vmMachineType, setVmMachineType,
  useOptimizedBundle, setUseOptimizedBundle,
  creatingVm, deletingVm, step4Status, step4Message, step4Logs,
  handleCreateVm, handleDeleteVm, setShowRecreateOptions,
  vmLogs, loadingVmLogs, refreshVmLogs,
  vmHttpsUrl
}) => {
  if (!expanded) return null;

  if (!prevComplete) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
        Complete Step 6 first to unlock this step.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
      {isVmComplete && !showRecreateOptions ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
            <Check size={20} />
            <span className="font-medium">VM created and ready at {vmIp}</span>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-700 flex items-center gap-2">
                <Server size={16} />
                Serial Port Logs
              </h4>
              <button
                onClick={refreshVmLogs}
                disabled={loadingVmLogs}
                className="text-blue-600 hover:text-blue-700 text-sm disabled:text-gray-400"
              >
                {loadingVmLogs ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs h-48 overflow-y-auto whitespace-pre-wrap">
              {vmLogs || 'Waiting for logs...'}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={() => setShowRecreateOptions(true)}
              className="text-blue-600 hover:text-blue-700 text-sm underline"
            >
              Recreate VM
            </button>
            <button
              onClick={handleDeleteVm}
              disabled={deletingVm}
              className="text-red-600 hover:text-red-700 text-sm underline disabled:text-gray-400"
            >
              {deletingVm ? 'Deleting...' : 'Delete VM'}
            </button>
            {vmHttpsUrl && (
              <a
                href={vmHttpsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm underline"
              >
                Open App
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GCP Zone:</label>
              <select
                value={vmZone}
                onChange={(e) => setVmZone(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              >
                <option value="us-east1-b">us-east1-b</option>
                <option value="us-east1-c">us-east1-c</option>
                <option value="us-west1-a">us-west1-a</option>
                <option value="us-central1-a">us-central1-a</option>
                <option value="us-central1-f">us-central1-f</option>
                <option value="europe-west1-b">europe-west1-b</option>
                <option value="asia-east1-a">asia-east1-a</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Machine Type:</label>
              <select
                value={vmMachineType}
                onChange={(e) => setVmMachineType(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              >
                <option value="e2-micro">e2-micro (2 vCPU, 1 GB)</option>
                <option value="e2-small">e2-small (2 vCPU, 2 GB)</option>
                <option value="e2-medium">e2-medium (2 vCPU, 4 GB)</option>
                <option value="e2-standard-2">e2-standard-2 (2 vCPU, 8 GB)</option>
                <option value="e2-standard-4">e2-standard-4 (4 vCPU, 16 GB)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useOptimizedBundle"
              checked={useOptimizedBundle}
              onChange={(e) => setUseOptimizedBundle(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="useOptimizedBundle" className="text-sm text-gray-700">
              Use optimized deployment (pre-bundled packages for faster VM setup)
            </label>
          </div>

          {step4Status === 'enabling' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-700 mb-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="font-medium">{step4Message || 'Setting up VM...'}</span>
              </div>
              {step4Logs.length > 0 && (
                <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs h-32 overflow-y-auto">
                  {step4Logs.map((log, i) => (
                    <div key={i} className="mb-1">
                      <span className="text-gray-500">[{log.time}]</span> {log.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step4Status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 font-medium mb-2">VM creation failed</p>
              <p className="text-red-600 text-sm">{step4Message}</p>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={handleCreateVm}
              disabled={creatingVm || step4Status === 'enabling'}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg flex items-center gap-2"
            >
              {creatingVm ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Server size={18} />
                  {showRecreateOptions ? 'Recreate VM' : 'Enable APIs & Create VM'}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step7;
