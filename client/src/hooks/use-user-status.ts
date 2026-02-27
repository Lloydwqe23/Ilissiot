import { useSyncExternalStore } from 'react';

export interface UserStatusInfo {
  status: 'online' | 'offline';
  lastSeen: Date | null;
}

// ── Module-level store ──────────────────────────────────────────────
const userStatuses = new Map<string, UserStatusInfo>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(fn => fn());
}

/** Update a single user's status (called from WS handler). */
export function setUserStatus(
  userId: string,
  status: string,
  lastSeen?: Date | string | null,
) {
  userStatuses.set(userId, {
    status: status === 'online' ? 'online' : 'offline',
    lastSeen: lastSeen
      ? new Date(lastSeen)
      : status === 'offline'
        ? new Date()
        : userStatuses.get(userId)?.lastSeen ?? null,
  });
  emit();
}

/** Batch-set who is online right now (sent by server on CONNECT). */
export function setOnlineUsers(userIds: string[]) {
  const onlineSet = new Set(userIds);

  // Mark previously-online users that aren't in this list as offline
  userStatuses.forEach((info, id) => {
    if (info.status === 'online' && !onlineSet.has(id)) {
      userStatuses.set(id, { status: 'offline', lastSeen: new Date() });
    }
  });

  // Mark listed users as online
  for (const id of userIds) {
    userStatuses.set(id, { status: 'online', lastSeen: null });
  }

  emit();
}

// ── React hook ──────────────────────────────────────────────────────
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe to real-time status for a specific user. */
export function useUserStatus(userId: string | undefined): UserStatusInfo | null {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? userStatuses.get(userId) ?? null : null),
    () => null, // SSR snapshot
  );
}

// ── Formatting helper ───────────────────────────────────────────────
/**
 * Returns a human-readable status string.
 * Prefers real-time `info` from the WS store, falls back to the DB
 * fields available on chat member objects.
 */
export function formatLastSeen(
  info: UserStatusInfo | null,
  dbStatus?: string | null,
  dbLastSeen?: Date | string | null,
): string {
  const status = info?.status ?? dbStatus;
  const lastSeen =
    info?.lastSeen ?? (dbLastSeen ? new Date(dbLastSeen) : null);

  if (status === 'online') return 'online';
  if (!lastSeen) return 'offline';

  const now = Date.now();
  const diff = now - new Date(lastSeen).getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return 'last seen just now';
  if (minutes < 60) return `last seen ${minutes} min ago`;

  const d = new Date(lastSeen);
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `last seen today at ${time}`;
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `last seen yesterday at ${time}`;
  }

  return `last seen ${d.toLocaleDateString()}`;
}
