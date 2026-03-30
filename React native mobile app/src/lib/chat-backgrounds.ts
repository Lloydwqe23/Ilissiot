import type { ViewStyle } from 'react-native';

export interface ChatBackground {
  id: string;
  name: string;
  style: ViewStyle;
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  /* ── theme default ─────────────────────────────── */
  {
    id: 'default',
    name: 'Default',
    style: {},
  },

  /* ── gradient colors (approximated for React Native) ─────────────────────────────── */
  {
    id: 'ocean',
    name: 'Ocean',
    style: {
      backgroundColor: '#1e4d8c',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    style: {
      backgroundColor: '#7c3a3a',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    style: {
      backgroundColor: '#1a5e46',
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    style: {
      backgroundColor: '#5a4e8a',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    style: {
      backgroundColor: '#171740',
    },
  },
  {
    id: 'cherry',
    name: 'Cherry',
    style: {
      backgroundColor: '#8b2d3a',
    },
  },

  /* ── solid colors ──────────────────────────────── */
  {
    id: 'warm-sand',
    name: 'Warm Sand',
    style: {
      backgroundColor: '#f5e6d3',
    },
  },
  {
    id: 'light-blue',
    name: 'Light Blue',
    style: {
      backgroundColor: '#e8f0f5',
    },
  },
  {
    id: 'light-green',
    name: 'Light Green',
    style: {
      backgroundColor: '#e8f0e8',
    },
  },
  {
    id: 'dark-navy',
    name: 'Dark Navy',
    style: {
      backgroundColor: '#1a1f2e',
    },
  },
  {
    id: 'dark-slate',
    name: 'Dark Slate',
    style: {
      backgroundColor: '#2a3340',
    },
  },
];

/* ── AsyncStorage helpers ──────────────────────── */

const STORAGE_KEY_PREFIX = 'ilissiot-chat-bg-';
const CUSTOM_BG_PREFIX = 'ilissiot-chat-custom-bg-';

// These need to be called with AsyncStorage from react-native-async-storage/async-storage
// Split into separate functions that take storage as parameter for easier testing

export async function getChatBackground(chatId: number, storage: any): Promise<string> {
  try {
    const bg = await storage.getItem(`${STORAGE_KEY_PREFIX}${chatId}`);
    return bg || 'default';
  } catch {
    return 'default';
  }
}

export async function setChatBackground(chatId: number, bgId: string, storage: any): Promise<void> {
  try {
    if (bgId === 'default') {
      await storage.removeItem(`${STORAGE_KEY_PREFIX}${chatId}`);
    } else {
      await storage.setItem(`${STORAGE_KEY_PREFIX}${chatId}`, bgId);
    }
  } catch {
    // storage full or unavailable
  }
}

export function findBackground(id: string): ChatBackground {
  return CHAT_BACKGROUNDS.find((bg) => bg.id === id) || CHAT_BACKGROUNDS[0];
}

/* ── Custom image background helpers ────────────── */

export async function getCustomBackgroundUrl(chatId: number, storage: any): Promise<string | null> {
  try {
    return await storage.getItem(`${CUSTOM_BG_PREFIX}${chatId}`);
  } catch {
    return null;
  }
}

export async function setCustomBackgroundUrl(chatId: number, url: string, storage: any): Promise<void> {
  try {
    await storage.setItem(`${CUSTOM_BG_PREFIX}${chatId}`, url);
  } catch {
    // storage full or unavailable
  }
}

export async function removeCustomBackground(chatId: number, storage: any): Promise<void> {
  try {
    await storage.removeItem(`${CUSTOM_BG_PREFIX}${chatId}`);
    await storage.removeItem(`${STORAGE_KEY_PREFIX}${chatId}`);
  } catch {
    // noop
  }
}
