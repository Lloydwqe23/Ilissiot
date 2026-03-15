import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, WS_EVENTS, type MessageResponse, type ChatResponse } from '@shared/routes';
import { setUserStatus, setOnlineUsers } from './use-user-status';
import { setTypingStart, setTypingStop, setWsSendForTyping } from './use-typing';
import { useCall } from './use-call';
import { isChatMuted } from '@/lib/chat-mute';

export function useChatWebSocket(
  userId: string | undefined, 
  onMessageReceived?: (opts: {
    chatId: number;
    chatName?: string;
    isGroup?: boolean;
    senderName: string;
    message: string;
    senderImage?: string;
    chatImage?: string;
  }) => void,
  activeChatId?: number | null
) {
  const queryClient = useQueryClient();
  const call = useCall();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalRef = useRef(false);
  const isVisibleRef = useRef(!document.hidden);
  // Keep fresh references so the WS callback always sees the latest handlers
  const callRef = useRef(call);
  callRef.current = call;
  const onMessageReceivedRef = useRef(onMessageReceived);
  onMessageReceivedRef.current = onMessageReceived;
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  




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

        // Register WS sender for typing events
        setWsSendForTyping((msg: any) => {
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

            // Trigger notification for incoming messages from other users in different chats
            if (onMessageReceivedRef.current && message.senderId !== userId && message.chatId !== activeChatIdRef.current) {
              // Skip if this chat is muted
              if (!isChatMuted(message.chatId)) {
                const senderName = (message as any).sender 
                  ? [(message as any).sender.firstName, (message as any).sender.lastName].filter(Boolean).join(' ') || (message as any).sender.email || 'Unknown'
                  : 'Unknown';
                const messagePreview = message.content?.substring(0, 100) || '📎 Attachment';
                const senderImage = (message as any).sender?.profileImageUrl;

                // Look up chat info from cache for group name
                const chats = queryClient.getQueryData<ChatResponse[]>([api.chats.list.path]);
                const chatInfo = chats?.find(c => c.id === message.chatId);

                onMessageReceivedRef.current({
                  chatId: message.chatId,
                  chatName: chatInfo?.name || undefined,
                  chatImage: chatInfo?.avatarUrl || undefined,
                  isGroup: !!chatInfo?.isGroup,
                  senderName,
                  message: messagePreview,
                  senderImage,
                });
              }
            }

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
            const { chatId, readByUserId } = data.payload;

            // Update messages in the chat: mark all own messages as read
            const msgKey = [api.messages.list.path, String(chatId)];
            queryClient.setQueryData<MessageResponse[]>(msgKey, (old) => {
              if (!old) return old;
              return old.map(msg =>
                msg.senderId === userId && !msg.isRead
                  ? { ...msg, isRead: true }
                  : msg
              );
            });

            // Also update sidebar chat list
            queryClient.invalidateQueries({
              queryKey: [api.chats.list.path],
            });
          }

          // ── Message deletions ─────────────────────────────────────
          if (data.type === WS_EVENTS.MESSAGE_DELETE) {
            const { messageIds, chatId } = data.payload as { messageIds: number[]; chatId: number };
            const deleteSet = new Set(messageIds);

            // Remove from the open chat's message list
            const msgKey = [api.messages.list.path, String(chatId)];
            queryClient.setQueryData<MessageResponse[]>(msgKey, (old) => {
              if (!old) return old;
              return old.filter(msg => !deleteSet.has(msg.id));
            });

            // Refresh sidebar (last message may have changed)
            queryClient.invalidateQueries({
              queryKey: [api.chats.list.path],
            });

            // Remove deleted messages from pinned list
            queryClient.invalidateQueries({
              queryKey: ['pinned-messages', chatId],
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

          // ── Message Reactions ─────────────────────────────────────
          if (data.type === WS_EVENTS.MESSAGE_REACTION_ADD) {
            const reaction = data.payload;
            const messageId = reaction.messageId;
            const reactionUserId = reaction.userId;
            
            // Skip reactions from current user - mutations handle those
            if (reactionUserId === userId) return;
            
            // Update all message lists (including search results) that might contain this message
            const keys = queryClient.getQueryCache().getAll();
            keys.forEach(cache => {
              const isMainMessages = cache.queryKey[0] === api.messages.list.path;
              const isSearchMessages = cache.queryKey[0] === 'messages.search';
              
              if (isMainMessages || isSearchMessages) {
                queryClient.setQueryData<MessageResponse[]>(cache.queryKey, (old) => {
                  if (!old) return old;
                  return old.map(msg => {
                    if (msg.id === messageId) {
                      // Remove this user's previous reactions, then add the new one
                      let reactions = (msg.reactions || []).filter(
                        r => r.userId !== reactionUserId
                      );
                      reactions = [...reactions, reaction];
                      return { ...msg, reactions };
                    }
                    return msg;
                  });
                });
              }
            });
          }

          if (data.type === WS_EVENTS.MESSAGE_REACTION_REMOVE) {
            const { messageId, userId: reactionUserId, emoji } = data.payload;
            
            // Skip reactions from current user - mutations handle those
            if (reactionUserId === userId) return;
            
            // Update all message lists (including search results) that might contain this message
            const keys = queryClient.getQueryCache().getAll();
            keys.forEach(cache => {
              const isMainMessages = cache.queryKey[0] === api.messages.list.path;
              const isSearchMessages = cache.queryKey[0] === 'messages.search';
              
              if (isMainMessages || isSearchMessages) {
                queryClient.setQueryData<MessageResponse[]>(cache.queryKey, (old) => {
                  if (!old) return old;
                  return old.map(msg => {
                    if (msg.id === messageId) {
                      const reactions = (msg.reactions || []).filter(
                        r => !(r.userId === reactionUserId && r.emoji === emoji)
                      );
                      return { ...msg, reactions };
                    }
                    return msg;
                  });
                });
              }
            });
          }

          // ── Poll Events ────────────────────────────────────────
          if (data.type === WS_EVENTS.POLL_NEW || data.type === WS_EVENTS.POLL_VOTE || data.type === WS_EVENTS.POLL_CLOSE) {
            const { chatId } = data.payload;
            
            // Invalidate messages for this chat to refetch with updated poll data
            queryClient.invalidateQueries({
              queryKey: [api.messages.list.path, String(chatId)],
            });
          }

          // ── Pin / Unpin Events ─────────────────────────────────
          if (data.type === WS_EVENTS.MESSAGE_PIN || data.type === WS_EVENTS.MESSAGE_UNPIN) {
            const { chatId } = data.payload;
            queryClient.invalidateQueries({
              queryKey: ['pinned-messages', chatId],
            });
          }

          // ── Chat Deleted (group was deleted by creator) ────────
          if (data.type === WS_EVENTS.CHAT_DELETED) {
            const { chatId: deletedChatId } = data.payload;
            // Remove chat from the list cache
            queryClient.setQueryData<ChatResponse[]>([api.chats.list.path], (old) => {
              if (!old) return old;
              return old.filter(c => c.id !== deletedChatId);
            });
            // Also invalidate the specific chat query
            queryClient.removeQueries({
              queryKey: [api.chats.get.path, String(deletedChatId)],
            });
            // If user is currently viewing the deleted chat, navigate away
            if (window.location.pathname === `/chat/${deletedChatId}`) {
              window.location.href = '/';
            }
          }

          // ── Typing Events ──────────────────────────────────────
          if (data.type === WS_EVENTS.TYPING_START) {
            const { chatId, userId: typingUserId, userName } = data.payload;
            setTypingStart(chatId, typingUserId, userName || 'Someone');
          }
          if (data.type === WS_EVENTS.TYPING_STOP) {
            const { chatId, userId: typingUserId } = data.payload;
            setTypingStop(chatId, typingUserId);
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
      setWsSendForTyping(null);
      wsRef.current?.close();
    };
  }, [userId, queryClient]);

  return wsRef;
}
