import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_EVENTS } from '../types';

type WsTypingSender = (msg: { type: string; payload: { chatId: number } }) => void;

let globalWsSend: WsTypingSender | null = null;
const typingTimeouts = new Map<number, Map<string, ReturnType<typeof setTimeout>>>();

export function setWsSendForTyping(sendFn: WsTypingSender | null) {
  globalWsSend = sendFn;
}

export function setTypingStart(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: number,
  userId: string,
  userName: string
) {
  if (!typingTimeouts.has(chatId)) {
    typingTimeouts.set(chatId, new Map());
  }

  const chatTimeouts = typingTimeouts.get(chatId)!;
  const existingTimeout = chatTimeouts.get(userId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  queryClient.setQueryData<Record<string, string>>(['typing', chatId], (old) => ({
    ...(old || {}),
    [userId]: userName,
  }));

  chatTimeouts.set(
    userId,
    setTimeout(() => {
      setTypingStop(queryClient, chatId, userId);
    }, 4000)
  );
}

export function setTypingStop(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: number,
  userId: string
) {
  const chatTimeouts = typingTimeouts.get(chatId);
  const existingTimeout = chatTimeouts?.get(userId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    chatTimeouts?.delete(userId);
  }
  if (chatTimeouts && chatTimeouts.size === 0) {
    typingTimeouts.delete(chatId);
  }

  queryClient.setQueryData<Record<string, string>>(['typing', chatId], (old) => {
    if (!old) return {};
    const next = { ...old };
    delete next[userId];
    return next;
  });
}

export function useTyping(chatId: number | null) {
  const queryClient = useQueryClient();

  const typingUsers = queryClient.getQueryData<Record<string, string>>(['typing', chatId]) || {};

  return {
    typingUsers,
    typingText: getTypingText(typingUsers),
  };
}

export function useSendTyping(chatId: number) {
  const lastSentRef = useRef(0);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastSentRef.current < 2000) {
      return;
    }

    lastSentRef.current = now;

    if (globalWsSend) {
      globalWsSend({ type: WS_EVENTS.TYPING_START, payload: { chatId } });
    }

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
    }

    stopTimeoutRef.current = setTimeout(() => {
      if (globalWsSend) {
        globalWsSend({ type: WS_EVENTS.TYPING_STOP, payload: { chatId } });
      }
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
      }

      if (globalWsSend) {
        globalWsSend({ type: WS_EVENTS.TYPING_STOP, payload: { chatId } });
      }
    };
  }, [chatId]);

  return sendTyping;
}

function getTypingText(typingUsers: Record<string, string>): string {
  const names = Object.values(typingUsers);
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  return `${names[0]} and ${names.length - 1} others are typing...`;
}
