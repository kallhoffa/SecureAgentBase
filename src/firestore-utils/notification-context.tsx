import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X } from 'lucide-react';
import type { NotificationContextType, Notification, NotificationType } from '../types';

const NotificationContext = createContext<NotificationContextType | null>(null);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((message: string, type: NotificationType = 'info', duration = 3000): void => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }
  }, []);

  const removeNotification = useCallback((id: string): void => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {notifications.map(n => (
          <div
            key={n.id}
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[250px] ${
              n.type === 'error' ? 'bg-red-600 text-white' :
              n.type === 'success' ? 'bg-green-600 text-white' :
              'bg-blue-600 text-white'
            }`}
          >
            <span className="flex-1">{n.message}</span>
            <button onClick={() => removeNotification(n.id)} className="hover:opacity-80">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};
