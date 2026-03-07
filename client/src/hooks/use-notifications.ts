import { useEffect, useState, useCallback } from 'react';

export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

export function useNotificationManager() {
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    senderName: string;
    senderImage?: string;
    message: string;
    timestamp: number;
  }>>([]);

  const addNotification = useCallback((senderName: string, message: string, senderImage?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    const notif = {
      id,
      senderName,
      message: message.substring(0, 100), // Truncate long messages
      senderImage,
      timestamp: Date.now(),
    };

    setNotifications(prev => [...prev, notif]);
    
    // Update browser tab title to alert user of new message when page not visible
    if (document.hidden) {
      document.title = `📬 New message from ${senderName}`;
    }
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      // Reset tab title when all notifications are dismissed
      if (updated.length === 0 && document.hidden) {
        document.title = 'Ilissiot Web';
      }
      return updated;
    });
  }, []);

  // Reset tab title when user switches back to the tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        document.title = 'Ilissiot Web';
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    notifications,
    addNotification,
    dismissNotification,
  };
}
