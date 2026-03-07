import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface Notification {
  id: string;
  senderName: string;
  senderImage?: string;
  message: string;
  timestamp: number;
}

export function MessageNotification({ 
  notifications, 
  onDismiss 
}: { 
  notifications: Notification[];
  onDismiss: (id: string) => void;
}) {
  const [visibleNotifications, setVisibleNotifications] = useState<string[]>([]);

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    if (notifications.length === 0) return;

    const latestId = notifications[notifications.length - 1].id;
    
    if (!visibleNotifications.includes(latestId)) {
      setVisibleNotifications(prev => [...prev, latestId]);
    }

    const timers = notifications.map(notif => 
      setTimeout(() => {
        setVisibleNotifications(prev => prev.filter(id => id !== notif.id));
        onDismiss(notif.id);
      }, 5000)
    );

    return () => timers.forEach(t => clearTimeout(t));
  }, [notifications, visibleNotifications, onDismiss]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs pointer-events-none">
      <AnimatePresence>
        {notifications.map(notif => (
          visibleNotifications.includes(notif.id) && (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: 20, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: 20, x: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-card border border-border/50 rounded-lg shadow-lg p-4 pointer-events-auto"
            >
              <div className="flex gap-3">
                <Avatar className="w-10 h-10 shrink-0">
                  <AvatarImage src={notif.senderImage || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {notif.senderName[0]?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{notif.senderName}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {notif.message}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setVisibleNotifications(prev => prev.filter(id => id !== notif.id));
                    onDismiss(notif.id);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )
        ))}
      </AnimatePresence>
    </div>
  );
}
