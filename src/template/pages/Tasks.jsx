import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../firestore-utils/auth-context';
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, query, where, orderBy, serverTimestamp
} from 'firebase/firestore';
import { Plus, Trash2, Loader2, CheckCircle, Circle } from 'lucide-react';

const Tasks = ({ db }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const tasksRef = collection(db, 'tasks');
      const q = query(
        tasksRef,
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const loaded = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title,
          completed: data.completed || false,
          createdAt: data.createdAt?.toDate() || new Date(),
        };
      });
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
    try {
      setAdding(true);
      const tasksRef = collection(db, 'tasks');
      await addDoc(tasksRef, {
        title: newTitle.trim(),
        completed: false,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
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
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, { completed: !task.completed });
      await loadTasks();
    } catch (err) {
      console.error('Error toggling task:', err);
      setError('Failed to update task');
    }
  };

  const deleteTask = async (taskId) => {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await deleteDoc(taskRef);
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
