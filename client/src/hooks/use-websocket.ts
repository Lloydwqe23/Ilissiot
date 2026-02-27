import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, WS_EVENTS, type MessageResponse, type ChatResponse } from '@shared/routes';
import { setUserStatus, setOnlineUsers } from './use-user-status';

export function useChatWebSocket(userId: string | undefined) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const isVisibleRef = useRef(!document.hidden);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      // Don't open a second connection
      if (
        wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING
      ) return;

      intentionalRef.current = false;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        // Tell the server who we are so it can route messages to us
        ws.send(JSON.stringify({
          type: WS_EVENTS.CONNECT,
          payload: { userId },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // ── New message ───────────────────────────────────────────
          if (data.type === WS_EVENTS.MESSAGE_NEW) {
            const message = data.payload as MessageResponse;

            // 1. Append to the open chat's message list
            const msgKey = [api.messages.list.path, message.chatId.toString()];
            queryClient.setQueryData<MessageResponse[]>(msgKey, (old) => {
              if (!old) return [message];
              if (old.some(m => m.id === message.id)) return old;
              return [...old, message];
            });

            // 2. Update sidebar chat list (last message + unread badge)
            queryClient.setQueryData<ChatResponse[]>(
              [api.chats.list.path],
              (old) => {
                if (!old) return old;

                let found = false;
                const updated = old.map(chat => {
                  if (chat.id === message.chatId) {
                    found = true;
                    return {
                      ...chat,
                      lastMessage: message,
                      unreadCount:
                        message.senderId !== userId
                          ? (chat.unreadCount || 0) + 1
                          : chat.unreadCount,
                      updatedAt: message.createdAt,
                    };
                  }
                  return chat;
                });

                // Chat not in list yet (new conversation) → full refetch
                if (!found) {
                  queryClient.invalidateQueries({
                    queryKey: [api.chats.list.path],
                  });
                  return old;
                }

                return updated.sort((a, b) => {
                  const da = a.lastMessage?.createdAt
                    ? new Date(a.lastMessage.createdAt).getTime()
                    : 0;
                  const db = b.lastMessage?.createdAt
                    ? new Date(b.lastMessage.createdAt).getTime()
                    : 0;
                  return db - da;
                });
              },
            );
          }

          // ── Read receipts ─────────────────────────────────────────
          if (data.type === WS_EVENTS.MESSAGE_READ) {
            queryClient.invalidateQueries({
              queryKey: [api.chats.list.path],
            });
          }

          // ── User status change (single user) ─────────────────────
          if (data.type === WS_EVENTS.USER_STATUS) {
            const { userId: uid, status, lastSeen } = data.payload;
            if (uid) setUserStatus(uid, status, lastSeen);
          }

          // ── Bulk online-users list (sent by server on our CONNECT) 
          if (data.type === WS_EVENTS.ONLINE_USERS) {
            const { userIds } = data.payload;
            if (Array.isArray(userIds)) setOnlineUsers(userIds);
          }

        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        wsRef.current = null;
        // Auto-reconnect only if tab is visible & close wasn't intentional
        if (isVisibleRef.current && !intentionalRef.current) {
          reconnectRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    };

    // ── Tab visibility: online only while tab is visible ────────────
    const onVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;

      if (document.hidden) {
        // Tab hidden → close WS → server fires 'close' → marks offline
        intentionalRef.current = true;
        if (reconnectRef.current) {
          clearTimeout(reconnectRef.current);
          reconnectRef.current = null;
        }
        wsRef.current?.close();
      } else {
        // Tab visible → reconnect → CONNECT → server marks online
        connect();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    // Initial connect (only if tab is actually visible)
    if (!document.hidden) connect();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      intentionalRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [userId, queryClient]);

  return wsRef;
}
