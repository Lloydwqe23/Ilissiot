import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, WS_EVENTS, type MessageResponse, type ChatResponse } from '@shared/routes';
import { setUserStatus, setOnlineUsers } from './use-user-status';
import { useCall } from './use-call';

export function useChatWebSocket(userId: string | undefined) {
  const queryClient = useQueryClient();
  const call = useCall();
  const wsRef = useRef<WebSocket | null>(null);
  const isVisibleRef = useRef(!document.hidden);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalRef = useRef(false);
  // Keep fresh references so the WS callback always sees the latest handlers
  const callRef = useRef(call);
  callRef.current = call;

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

        // Register WS sender for call signaling
        callRef.current.setWsSend((msg: any) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        });
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

          // ── WebRTC Call Signaling ─────────────────────────────────
          if (data.type === WS_EVENTS.CALL_OFFER) {
            callRef.current.handleIncomingOffer(data.payload);
          }
          if (data.type === WS_EVENTS.CALL_ANSWER) {
            callRef.current.handleAnswer(data.payload);
          }
          if (data.type === WS_EVENTS.CALL_ICE_CANDIDATE) {
            callRef.current.handleIceCandidate(data.payload);
          }
          if (data.type === WS_EVENTS.CALL_HANGUP) {
            callRef.current.handleRemoteHangup();
          }
          if (data.type === WS_EVENTS.CALL_REJECT) {
            callRef.current.handleRemoteReject();
          }
          if (data.type === WS_EVENTS.CALL_BUSY) {
            callRef.current.handleRemoteBusy();
          }

        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        wsRef.current = null;
        // Always auto-reconnect unless cleanup is running
        if (!intentionalRef.current) {
          reconnectRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    };

    // ── Tab visibility: update status but keep WS alive for calls ──
    const onVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;

      if (document.hidden) {
        // Tab hidden → tell server we're "away" but keep connection open
        // so incoming calls can still arrive
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: WS_EVENTS.TYPING_STOP, // lightweight event; status updated server-side below
            payload: {},
          }));
        }
      } else {
        // Tab visible → reconnect if WS was lost, otherwise just ensure online
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    // Always connect (even if tab is hidden) so we can receive calls
    connect();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      intentionalRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [userId, queryClient]);

  return wsRef;
}
