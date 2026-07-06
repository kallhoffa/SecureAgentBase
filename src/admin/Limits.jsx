import { Shield, Clock, DollarSign, Info } from 'lucide-react';

const Limits = ({ db }) => {
  const limits = [
    {
      action: 'add-task',
      limit: '20 / minute',
      scope: 'Per-user, client-side',
      configurable: 'Hardcoded in Tasks.jsx',
    },
    {
      action: 'add-comment',
      limit: '10 / minute',
      scope: 'Per-user, client-side',
      configurable: 'Hardcoded in component',
    },
    {
      action: 'create-post',
      limit: '5 / minute',
      scope: 'Per-user, client-side',
      configurable: 'Hardcoded in component',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock size={20} className="text-indigo-600" />
          Rate Limits
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          All rate limits use a sliding 60-second window and are enforced client-side
          via the <code className="bg-gray-100 px-1 rounded">useRateLimit</code> hook.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-600">Action</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Limit</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Scope</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600">Configured In</th>
              </tr>
            </thead>
            <tbody>
              {limits.map((limit) => (
                <tr key={limit.action} className="border-b border-gray-100">
                  <td className="py-2 px-3 font-medium text-gray-900">{limit.action}</td>
                  <td className="py-2 px-3 text-gray-700">{limit.limit}</td>
                  <td className="py-2 px-3 text-gray-500">{limit.scope}</td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      {limit.configurable}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign size={20} className="text-indigo-600" />
          GCP Budget Controls
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          A budget killswitch Cloud Function monitors GCP billing alerts and automatically
          stops VMs and Cloud Run services when spending exceeds the threshold.
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">Budget Killswitch</p>
              <p>Deployed at <code className="bg-yellow-100 px-1 rounded">functions/budget-killswitch/index.js</code></p>
              <p className="mt-1">Configure threshold via <code className="bg-yellow-100 px-1 rounded">BILLING_THRESHOLD</code> env var (default: $1.00).</p>
              <p className="mt-1">Triggers on GCP budget PubSub alerts — stops VMs + Cloud Run services.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Limits;
