import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../firestore-utils/auth-context';
import { safeCreate, safeUpdate, safeDelete, safeQuery } from '../../guardrails/safe-firestore';
import { validate } from '../../guardrails/validate';
import { useRateLimit } from '../../guardrails/useRateLimit';
import { Plus, Trash2, Loader2, CheckCircle, Circle } from 'lucide-react';

const TASK_SCHEMA = {
  title: { type: 'string', required: true, minLength: 1, maxLength: 200, label: 'Task title' },
};

const ALLOW_FIELDS = ['title', 'completed'];

const Tasks = ({ db }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const rateLimit = useRateLimit('add-task', 20);

  const loadTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const results = await safeQuery(db, 'tasks', user.uid, { maxResults: 100 });
      const loaded = results.map((d) => ({
        id: d.id,
        title: d.title || '',
        completed: d.completed || false,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
      }));
      setTasks(loaded);
    } catch (err) {
      console.error('Error loading tasks:', err);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [db, user]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const addTask = async () => {
    if (!user || !newTitle.trim()) return;
    if (!rateLimit.check()) {
      setError(`Rate limit reached. Try again in ${Math.ceil(rateLimit.resetIn / 1000)}s.`);
      return;
    }
    const errors = validate({ title: newTitle.trim() }, TASK_SCHEMA);
    if (errors) {
      setError(Object.values(errors)[0]);
      return;
    }
    try {
      setAdding(true);
      setError(null);
      await safeCreate(db, 'tasks', { title: newTitle.trim(), completed: false }, user.uid, { allowFields: ALLOW_FIELDS });
      setNewTitle('');
      await loadTasks();
    } catch (err) {
      console.error('Error adding task:', err);
      setError('Failed to add task');
    } finally {
      setAdding(false);
    }
  };

  const toggleTask = async (task) => {
    try {
      setError(null);
      await safeUpdate(db, 'tasks', task.id, { completed: !task.completed }, user.uid, { allowFields: ALLOW_FIELDS, requireOwnership: true });
      await loadTasks();
    } catch (err) {
      console.error('Error toggling task:', err);
      setError('Failed to update task');
    }
  };

  const deleteTask = async (taskId) => {
    try {
      setError(null);
      await safeDelete(db, 'tasks', taskId, user.uid, { requireOwnership: true });
      await loadTasks();
    } catch (err) {
      console.error('Error deleting task:', err);
      setError('Failed to delete task');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !adding) {
      addTask();
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Tasks</h1>
          <p className="text-gray-600 mb-4">Sign in to manage your tasks.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Tasks</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 mb-6">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a new task..."
            className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={addTask}
            disabled={adding || !newTitle.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            {adding ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Add
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="animate-spin text-blue-600 inline" size={32} />
            <p className="mt-2 text-gray-600">Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <CheckCircle className="text-gray-300 mx-auto mb-2" size={48} />
            <p className="text-gray-500">No tasks yet. Add one above!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow"
              >
                <button
                  onClick={() => toggleTask(task)}
                  className="flex-shrink-0"
                >
                  {task.completed ? (
                    <CheckCircle className="text-green-500" size={22} />
                  ) : (
                    <Circle className="text-gray-400" size={22} />
                  )}
                </button>
                <span
                  className={`flex-1 ${
                    task.completed ? 'line-through text-gray-400' : 'text-gray-900'
                  }`}
                >
                  {task.title}
                </span>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Tasks;
