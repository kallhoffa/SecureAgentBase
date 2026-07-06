import { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../firestore-utils/auth-context';
import { Plus, Trash2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';

const FeatureFlags = ({ db }) => {
  const { user } = useAuth();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const loadFlags = async () => {
    try {
      setLoading(true);
      setError(null);
      const ref = collection(db, 'featureFlags');
      const q = query(ref, orderBy('__name__'));
      const snap = await getDocs(q);
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFlags(loaded);
    } catch (err) {
      console.error('Error loading flags:', err);
      setError('Failed to load flags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (db) loadFlags();
  }, [db]);

  const addFlag = async () => {
    if (!newName.trim()) return;
    try {
      setAdding(true);
      setError(null);
      const ref = doc(db, 'featureFlags', newName.trim());
      await setDoc(ref, { enabled: false });
      setNewName('');
      await loadFlags();
    } catch (err) {
      console.error('Error adding flag:', err);
      setError('Failed to add flag');
    } finally {
      setAdding(false);
    }
  };

  const toggleFlag = async (flagId, currentValue) => {
    try {
      const ref = doc(db, 'featureFlags', flagId);
      await setDoc(ref, { enabled: !currentValue }, { merge: true });
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, enabled: !currentValue } : f));
    } catch (err) {
      console.error('Error toggling flag:', err);
      setError('Failed to toggle flag');
    }
  };

  const deleteFlag = async (flagId) => {
    try {
      const ref = doc(db, 'featureFlags', flagId);
      await deleteDoc(ref);
      setFlags(prev => prev.filter(f => f.id !== flagId));
    } catch (err) {
      console.error('Error deleting flag:', err);
      setError('Failed to delete flag');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Feature Flags</h2>
      <p className="text-sm text-gray-500 mb-6">
        Toggle features on and off in real-time. All flags are stored in Firestore and
        replicated instantly via onSnapshot.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && addFlag()}
          placeholder="New flag name (e.g. beta-feature)"
          className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 text-sm"
        />
        <button
          onClick={addFlag}
          disabled={adding || !newName.trim()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
        >
          {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Add
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="animate-spin text-indigo-600 inline" size={24} />
        </div>
      ) : flags.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No feature flags yet. Add one above.
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map((flag) => (
            <div key={flag.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <span className="font-medium text-gray-900 text-sm">{flag.id}</span>
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  flag.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {flag.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleFlag(flag.id, flag.enabled)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    flag.enabled
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {flag.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {flag.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => deleteFlag(flag.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeatureFlags;
