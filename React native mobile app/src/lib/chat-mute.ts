import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { apiRequest } from '../api';

const MUTE_KEY_PREFIX = 'ilissiot-chat-mute-';

export type MuteValue = null | 'forever' | string;

const listeners = new Set<() => void>();
const muteCache = new Map<string, MuteValue>();
const loadedKeys = new Set<string>();

function emitMuteChange() {
  listeners.forEach((listener) => listener());
}

function getStorageKey(chatId: number, userId?: string): string {
  return `${MUTE_KEY_PREFIX}${userId || 'anon'}-${chatId}`;
}

function normalizeMuteValue(rawValue: string | null): MuteValue {
  if (!rawValue) return null;
  if (rawValue === 'forever') return 'forever';

  const untilMs = new Date(rawValue).getTime();
  if (!Number.isFinite(untilMs) || untilMs <= Date.now()) {
    return null;
  }

  return new Date(untilMs).toISOString();
}

function getCachedMuteValueByKey(storageKey: string): MuteValue {
  const cached = muteCache.get(storageKey) ?? null;
  if (!cached || cached === 'forever') {
    return cached;
  }

  const untilMs = new Date(cached).getTime();
  if (!Number.isFinite(untilMs) || untilMs <= Date.now()) {
    muteCache.set(storageKey, null);
    void AsyncStorage.removeItem(storageKey);
    emitMuteChange();
    return null;
  }

  return cached;
}

async function ensureLoaded(chatId: number, userId?: string): Promise<string> {
  const storageKey = getStorageKey(chatId, userId);
  if (loadedKeys.has(storageKey)) {
    return storageKey;
  }

  loadedKeys.add(storageKey);

  try {
    const rawValue = await AsyncStorage.getItem(storageKey);
    const normalized = normalizeMuteValue(rawValue);

    if (!normalized && rawValue) {
      await AsyncStorage.removeItem(storageKey);
    }

    muteCache.set(storageKey, normalized);
  } catch {
    muteCache.set(storageKey, null);
  }

  emitMuteChange();
  return storageKey;
}

export function subscribeChatMute(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function muteFor(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export async function getChatMute(chatId: number, userId?: string): Promise<MuteValue> {
  const storageKey = await ensureLoaded(chatId, userId);
  return getCachedMuteValueByKey(storageKey);
}

export async function setChatMute(chatId: number, value: MuteValue, userId?: string): Promise<void> {
  const storageKey = getStorageKey(chatId, userId);
  const normalized = normalizeMuteValue(value);

  try {
    if (!normalized) {
      await AsyncStorage.removeItem(storageKey);
    } else {
      await AsyncStorage.setItem(storageKey, normalized);
    }
  } catch {
    // Ignore storage errors to keep chat functional.
  }

  loadedKeys.add(storageKey);
  muteCache.set(storageKey, normalized);
  emitMuteChange();

  if (!userId) {
    return;
  }

  try {
    await apiRequest(`/api/chats/${chatId}/notification-mute`, {
      method: 'PATCH',
      body: { muteValue: normalized },
    });
  } catch {
    // Keep local mute state even if remote sync fails.
  }
}

export function isMutedValue(value: MuteValue): boolean {
  if (!value) return false;
  if (value === 'forever') return true;

  const untilMs = new Date(value).getTime();
  return Number.isFinite(untilMs) && untilMs > Date.now();
}

export async function isChatMuted(chatId: number, userId?: string): Promise<boolean> {
  const muteValue = await getChatMute(chatId, userId);
  return isMutedValue(muteValue);
}

export function formatMuteValueLabel(value: MuteValue): string | null {
  if (!value) return null;
  if (value === 'forever') return 'Muted';

  const untilMs = new Date(value).getTime();
  if (!Number.isFinite(untilMs) || untilMs <= Date.now()) {
    return null;
  }

  const diffMs = untilMs - Date.now();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Muted for ${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `Muted for ${hours}h ${minutes}m` : `Muted for ${hours}h`;
  }

  return `Muted for ${Math.max(minutes, 1)}m`;
}

export async function getMuteLabel(chatId: number, userId?: string): Promise<string | null> {
  const muteValue = await getChatMute(chatId, userId);
  return formatMuteValueLabel(muteValue);
}

export function useChatMute(chatId: number | null | undefined, userId?: string): MuteValue {
  const subscribe = useCallback((onStoreChange: () => void) => {
    return subscribeChatMute(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => {
    if (chatId == null) return null;
    const storageKey = getStorageKey(chatId, userId);
    return getCachedMuteValueByKey(storageKey);
  }, [chatId, userId]);

  useEffect(() => {
    if (chatId == null) return;
    void ensureLoaded(chatId, userId);
  }, [chatId, userId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useChatMuted(chatId: number | null | undefined, userId?: string): boolean {
  const muteValue = useChatMute(chatId, userId);
  return isMutedValue(muteValue);
}
