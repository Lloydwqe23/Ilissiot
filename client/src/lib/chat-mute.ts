/**
 * Client-side chat mute settings stored in localStorage.
 *
 * Mute values:
 *   null / undefined  → not muted
 *   "forever"         → permanently muted
 *   ISO date string   → muted until that timestamp
 */

import { useCallback, useSyncExternalStore } from "react";

const MUTE_KEY_PREFIX = "ilissiot-chat-mute-";
const MUTE_CHANGE_EVENT = "ilissiot-mute-change";

export type MuteValue = null | "forever" | string; // string = ISO date

export function getChatMute(chatId: number): MuteValue {
  try {
    const raw = localStorage.getItem(`${MUTE_KEY_PREFIX}${chatId}`);
    if (!raw) return null;
    if (raw === "forever") return "forever";
    // Check if the mute has expired
    const until = new Date(raw);
    if (isNaN(until.getTime())) return null;
    if (until.getTime() <= Date.now()) {
      // Expired — clean up
      localStorage.removeItem(`${MUTE_KEY_PREFIX}${chatId}`);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function setChatMute(chatId: number, value: MuteValue): void {
  try {
    if (!value) {
      localStorage.removeItem(`${MUTE_KEY_PREFIX}${chatId}`);
    } else {
      localStorage.setItem(`${MUTE_KEY_PREFIX}${chatId}`, value);
    }
  } catch {
    // storage full or unavailable
  }
  // Notify React subscribers
  window.dispatchEvent(new CustomEvent(MUTE_CHANGE_EVENT, { detail: chatId }));
}

export function isChatMuted(chatId: number): boolean {
  const mute = getChatMute(chatId);
  if (!mute) return false;
  if (mute === "forever") return true;
  const until = new Date(mute);
  return !isNaN(until.getTime()) && until.getTime() > Date.now();
}

/** Human-readable mute status label */
export function getMuteLabel(chatId: number): string | null {
  const mute = getChatMute(chatId);
  if (!mute) return null;
  if (mute === "forever") return "Muted";
  const until = new Date(mute);
  if (isNaN(until.getTime()) || until.getTime() <= Date.now()) return null;
  // Format remaining time
  const diff = until.getTime() - Date.now();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Muted for ${days}d`;
  }
  if (hours > 0) return `Muted for ${hours}h ${minutes}m`;
  return `Muted for ${minutes}m`;
}

/** Helper to create a mute-until date from a duration */
export function muteFor(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/**
 * React hook that reactively tracks mute state for a chat.
 * Re-renders automatically when setChatMute is called.
 */
export function useChatMuted(chatId: number | undefined): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        // Re-check on any mute change (detail === chatId or global)
        if (detail === chatId || detail === undefined) {
          onStoreChange();
        }
      };
      window.addEventListener(MUTE_CHANGE_EVENT, handler);
      return () => window.removeEventListener(MUTE_CHANGE_EVENT, handler);
    },
    [chatId],
  );

  const getSnapshot = useCallback(
    () => (chatId != null ? isChatMuted(chatId) : false),
    [chatId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
