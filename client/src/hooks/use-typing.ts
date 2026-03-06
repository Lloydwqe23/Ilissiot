import { useSyncExternalStore, useRef, useCallback, useEffect } from 'react';
import { WS_EVENTS } from '@shared/routes';

// ── Module-level store ──────────────────────────────────────────────
// Map<chatId, Map<userId, { userName, timeoutId }>>
interface TypingEntry {
  userId: string;
  userName: string;
  timeout: ReturnType<typeof setTimeout>;
}

const typingByChat = new Map<number, Map<string, TypingEntry>>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function emit() {
  snapshotVersion++;
  listeners.forEach(fn => fn());
}

/** Called from WS handler when a TYPING_START event is received. */
export function setTypingStart(chatId: number, userId: string, userName: string) {
  if (!typingByChat.has(chatId)) {
    typingByChat.set(chatId, new Map());
  }
  const chatMap = typingByChat.get(chatId)!;

  // Clear existing timeout for this user
  const existing = chatMap.get(userId);
  if (existing) {
    clearTimeout(existing.timeout);
  }

  // Auto-expire after 4 seconds if no new TYPING_START arrives
  const timeout = setTimeout(() => {
    chatMap.delete(userId);
    if (chatMap.size === 0) typingByChat.delete(chatId);
    emit();
  }, 4000);

  chatMap.set(userId, { userId, userName, timeout });
  emit();
}

/** Called from WS handler when a TYPING_STOP event is received. */
export function setTypingStop(chatId: number, userId: string) {
  const chatMap = typingByChat.get(chatId);
  if (!chatMap) return;

  const existing = chatMap.get(userId);
  if (existing) {
    clearTimeout(existing.timeout);
    chatMap.delete(userId);
    if (chatMap.size === 0) typingByChat.delete(chatId);
    emit();
  }
}

// ── React hooks ─────────────────────────────────────────────────────
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

const EMPTY: { userId: string; userName: string }[] = [];

// Cache snapshots per chatId so useSyncExternalStore gets a stable reference
const snapshotCache = new Map<number, { userId: string; userName: string }[]>();
const versionByChat = new Map<number, number>();

function getSnapshotForChat(chatId: number): { userId: string; userName: string }[] {
  const chatMap = typingByChat.get(chatId);
  if (!chatMap || chatMap.size === 0) {
    snapshotCache.delete(chatId);
    versionByChat.delete(chatId);
    return EMPTY;
  }
  const cachedVersion = versionByChat.get(chatId);
  if (cachedVersion === snapshotVersion) {
    return snapshotCache.get(chatId) || EMPTY;
  }
  const snapshot = Array.from(chatMap.values()).map(e => ({ userId: e.userId, userName: e.userName }));
  snapshotCache.set(chatId, snapshot);
  versionByChat.set(chatId, snapshotVersion);
  return snapshot;
}

/** Get list of users currently typing in a chat. */
export function useTypingUsers(chatId: number): { userId: string; userName: string }[] {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshotForChat(chatId),
    () => EMPTY,
  );
}

// ── Global WS sender reference ─────────────────────────────────────
let globalWsSend: ((msg: any) => void) | null = null;

export function setWsSendForTyping(sendFn: ((msg: any) => void) | null) {
  globalWsSend = sendFn;
}

/** Hook to send typing events. Call sendTyping() on input change. */
export function useSendTyping(chatId: number) {
  const lastSentRef = useRef(0);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendTyping = useCallback(() => {
    const now = Date.now();
    // Throttle: only send TYPING_START every 2 seconds
    if (now - lastSentRef.current < 2000) return;
    lastSentRef.current = now;

    if (globalWsSend) {
      globalWsSend({
        type: WS_EVENTS.TYPING_START,
        payload: { chatId },
      });
    }

    // Schedule a TYPING_STOP after 3s of no typing
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(() => {
      if (globalWsSend) {
        globalWsSend({
          type: WS_EVENTS.TYPING_STOP,
          payload: { chatId },
        });
      }
    }, 3000);
  }, [chatId]);

  // Clean up on unmount — send stop
  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      if (globalWsSend) {
        globalWsSend({
          type: WS_EVENTS.TYPING_STOP,
          payload: { chatId },
        });
      }
    };
  }, [chatId]);

  return sendTyping;
}
