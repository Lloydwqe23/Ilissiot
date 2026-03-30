import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { WS_BASE_URL } from '../config';
import { getSessionCookie } from '../api';
import { WS_EVENTS } from '../types';
import { setTypingStart, setTypingStop, setWsSendForTyping } from './useTyping';
import { setUserStatus, setOnlineUsers } from './useUserStatus';
import { isChatMuted } from '../lib/chat-mute';
import { showIncomingMessageNotification } from '../lib/notifications';
import type { Message, Chat } from '../types';

type WebSocketHookOptions = {
  userId: string | undefined;
  activeChatId: number | null;
  onMessageReceived?: (message: Message) => void;
  onCallOffer?: (data: any) => void;
  onCallAnswer?: (data: any) => void;
  onCallIceCandidate?: (data: any) => void;
  onCallHangup?: (data: any) => void;
  onCallReject?: (data: any) => void;
  onCallBusy?: (data: any) => void;
};

export function useWebSocket(options: WebSocketHookOptions) {
  const {
    userId,
    activeChatId,
    onMessageReceived,
    onCallOffer,
    onCallAnswer,
    onCallIceCandidate,
    onCallHangup,
    onCallReject,
    onCallBusy,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const shouldReconnectRef = useRef(true);
  const activeChatIdRef = useRef(activeChatId);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const maybeShowIncomingNotification = useCallback(
    async (message: Message) => {
      if (!userId) return;
      if (message.senderId === userId) return;
      if (activeChatIdRef.current === message.chatId) return;

      const muted = await isChatMuted(message.chatId, userId);
      if (muted) return;

      const chats = queryClient.getQueryData<Chat[]>(['/api/chats']) || [];
      const chat = chats.find((item) => item.id === message.chatId);

      const senderParts = [message.sender?.firstName, message.sender?.lastName]
        .map((value) => (value || '').trim())
        .filter(Boolean);
      const senderName =
        senderParts.join(' ') ||
        message.sender?.username ||
        message.sender?.email ||
        'Someone';

      const dmOtherUser = chat?.members.find((member) => member.userId !== userId)?.user;
      const dmNameParts = [dmOtherUser?.firstName, dmOtherUser?.lastName]
        .map((value) => (value || '').trim())
        .filter(Boolean);
      const resolvedDmName =
        dmNameParts.join(' ') ||
        dmOtherUser?.username ||
        dmOtherUser?.email ||
        senderName;

      const rawChatName = (chat?.name || '').trim();
      const chatName =
        rawChatName ||
        (chat?.isChannel ? 'Channel' : chat?.isGroup ? 'Group chat' : resolvedDmName);

      await showIncomingMessageNotification({
        chatId: message.chatId,
        chatName,
        senderName,
        content: message.content,
        attachmentCount: message.attachments?.length || 0,
        isGroup: !!chat?.isGroup,
        isChannel: !!chat?.isChannel,
      });
    },
    [queryClient, userId],
  );

  const connect = useCallback(() => {
    if (!userId) return;
    if (appStateRef.current !== 'active') return;

    const cookie = getSessionCookie();
    const wsUrl = cookie
      ? `${WS_BASE_URL}?cookie=${encodeURIComponent(cookie)}`
      : WS_BASE_URL;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: WS_EVENTS.CONNECT, payload: { userId } }));
      setWsSendForTyping((msg) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        switch (type) {
          case WS_EVENTS.MESSAGE_NEW: {
            const message = payload as Message;
            // Update messages cache
            queryClient.setQueryData<Message[]>(
              ['/api/chats', message.chatId, 'messages'],
              (old) => old ? [...old, message] : [message]
            );
            // Update chat list
            queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
            onMessageReceived?.(message);
            void maybeShowIncomingNotification(message).catch(() => {});
            break;
          }

          case WS_EVENTS.MESSAGE_EDIT: {
            const { messageId, content, chatId } = payload as any;
            queryClient.setQueryData<Message[]>(
              ['/api/chats', chatId, 'messages'],
              (old) =>
                old?.map((m) =>
                  m.id === messageId ? { ...m, content, isEdited: true } : m
                )
            );
            break;
          }

          case WS_EVENTS.MESSAGE_DELETE: {
            const { messageIds, chatId } = payload as any;
            queryClient.setQueryData<Message[]>(
              ['/api/chats', chatId, 'messages'],
              (old) => old?.filter((m) => !messageIds.includes(m.id))
            );
            queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
            break;
          }

          case WS_EVENTS.MESSAGE_READ: {
            const { chatId } = payload as any;
            queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
            queryClient.invalidateQueries({ queryKey: ['/api/chats', chatId, 'messages'] });
            break;
          }

          case WS_EVENTS.MESSAGE_REACTION_ADD:
          case WS_EVENTS.MESSAGE_REACTION_REMOVE: {
            const { chatId } = payload as any;
            queryClient.invalidateQueries({ queryKey: ['/api/chats', chatId, 'messages'] });
            break;
          }

          case WS_EVENTS.POLL_NEW:
          case WS_EVENTS.POLL_VOTE:
          case WS_EVENTS.POLL_CLOSE: {
            const { chatId } = payload as any;
            queryClient.invalidateQueries({ queryKey: ['/api/chats', chatId, 'messages'] });
            break;
          }

          case WS_EVENTS.USER_STATUS: {
            const { userId: statusUserId, status, lastSeen } = payload as any;
            setUserStatus(statusUserId, status, lastSeen);
            break;
          }

          case WS_EVENTS.ONLINE_USERS: {
            const { userIds } = payload as any;
            setOnlineUsers(Array.isArray(userIds) ? userIds : []);
            break;
          }

          case WS_EVENTS.TYPING_START:
          case WS_EVENTS.TYPING_STOP: {
            const { chatId, userId: typingUserId, userName } = payload as any;
            if (type === WS_EVENTS.TYPING_START) {
              setTypingStart(queryClient, chatId, typingUserId, userName || 'Someone');
            } else {
              setTypingStop(queryClient, chatId, typingUserId);
            }
            break;
          }

          case WS_EVENTS.CHAT_DELETED: {
            queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
            break;
          }

          // Call signaling
          case WS_EVENTS.CALL_OFFER:
            onCallOffer?.(payload);
            break;
          case WS_EVENTS.CALL_ANSWER:
            onCallAnswer?.(payload);
            break;
          case WS_EVENTS.CALL_ICE_CANDIDATE:
            onCallIceCandidate?.(payload);
            break;
          case WS_EVENTS.CALL_HANGUP:
            onCallHangup?.(payload);
            break;
          case WS_EVENTS.CALL_REJECT:
            onCallReject?.(payload);
            break;
          case WS_EVENTS.CALL_BUSY:
            onCallBusy?.(payload);
            break;
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setWsSendForTyping(null);
      // Auto-reconnect only while app is active
      if (shouldReconnectRef.current && appStateRef.current === 'active') {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [userId, queryClient, onMessageReceived, onCallOffer, onCallAnswer, onCallIceCandidate, onCallHangup, onCallReject, onCallBusy, maybeShowIncomingNotification]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;

      if (nextState === 'active') {
        if (wsRef.current?.readyState !== WebSocket.OPEN && wsRef.current?.readyState !== WebSocket.CONNECTING) {
          connect();
        }
      } else {
        // Going background/inactive: close socket so server marks user offline immediately.
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: WS_EVENTS.USER_STATUS,
            payload: { status: 'offline', lastSeen: new Date().toISOString() },
          }));
        }
        wsRef.current?.close();
      }
    });

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      appStateSub.remove();
      setWsSendForTyping(null);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: WS_EVENTS.USER_STATUS,
          payload: { status: 'offline', lastSeen: new Date().toISOString() },
        }));
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((type: string, payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const sendTypingStart = useCallback(
    (chatId: number) => {
      send(WS_EVENTS.TYPING_START, { chatId });
    },
    [send]
  );

  const sendTypingStop = useCallback(
    (chatId: number) => {
      send(WS_EVENTS.TYPING_STOP, { chatId });
    },
    [send]
  );

  return { send, sendTypingStart, sendTypingStop, ws: wsRef };
}
