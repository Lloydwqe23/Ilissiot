import { useEffect, useRef } from 'react';
import { useAuth } from './use-auth';

export function useWebSocketNotifications(
  onNewMessage?: (senderName: string, message: string, senderImage?: string) => void
) {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isVisibleRef = useRef(!document.hidden);

  useEffect(() => {
    // Track visibility changes
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      console.log('[WS-Notifications] Page visibility:', isVisibleRef.current ? 'VISIBLE' : 'HIDDEN');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!user?.id || !onNewMessage) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      if (
        wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      console.log('[WS-Notifications] Connecting to WebSocket for notifications');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS-Notifications] WebSocket connected');
        ws.send(JSON.stringify({
          type: 'CONNECT',
          payload: { userId: user.id },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Listen for MESSAGE_NEW events
          if (data.type === 'MESSAGE_NEW') {
            const message = data.payload;
            
            console.log('[WS-Notifications] MESSAGE_NEW received:', {
              senderId: message.senderId,
              userId: user.id,
              pageVisible: isVisibleRef.current,
              content: message.content?.substring(0, 50),
            });

            // Only show notification if message is from another user AND page is not visible
            if (message.senderId !== user.id && !isVisibleRef.current) {
              console.log('[WS-Notifications] Showing notification!');
              
              // Get sender info from message (this contains the sender object if available)
              const senderName = message.sender
                ? [message.sender.firstName, message.sender.lastName].filter(Boolean).join(' ') || message.sender.email || 'Unknown'
                : 'Unknown';
              const messagePreview = message.content?.substring(0, 100) || '📎 Attachment';
              const senderImage = message.sender?.profileImageUrl;

              console.log('[WS-Notifications] Calling onNewMessage:', { senderName, messagePreview });
              onNewMessage(senderName, messagePreview, senderImage);
            } else if (message.senderId === user.id) {
              console.log('[WS-Notifications] Message is from current user - no notification');
            } else if (isVisibleRef.current) {
              console.log('[WS-Notifications] Page is visible - no notification');
            }
          }
        } catch (err) {
          console.error('[WS-Notifications] Error processing message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS-Notifications] WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('[WS-Notifications] WebSocket closed');
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.id, onNewMessage]);
}
