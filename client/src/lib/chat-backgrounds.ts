import type { CSSProperties } from "react";

export interface ChatBackground {
  id: string;
  name: string;
  /** CSS applied to the chat container */
  style: CSSProperties;
  /** Extra class for the preview swatch (e.g. border for light bgs) */
  previewExtra?: string;
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  /* ── theme default ─────────────────────────────── */
  {
    id: "default",
    name: "Default",
    style: {},
    previewExtra: "bg-[#f8f9fa] dark:bg-[#0e1621]",
  },

  /* ── gradients ─────────────────────────────────── */
  {
    id: "ocean",
    name: "Ocean",
    style: {
      background: "linear-gradient(180deg, #1a365d 0%, #153e75 50%, #1e4d8c 100%)",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    style: {
      background: "linear-gradient(135deg, #1f1135 0%, #4a2545 50%, #7c3a3a 100%)",
    },
  },
  {
    id: "forest",
    name: "Forest",
    style: {
      background: "linear-gradient(180deg, #1a3c34 0%, #1c4a3e 50%, #1a5e46 100%)",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    style: {
      background: "linear-gradient(135deg, #2d2b55 0%, #3e3775 50%, #5a4e8a 100%)",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    style: {
      background: "linear-gradient(180deg, #0a0a1a 0%, #111128 50%, #171740 100%)",
    },
  },
  {
    id: "cherry",
    name: "Cherry",
    style: {
      background: "linear-gradient(135deg, #2d0a0a 0%, #5c1a23 50%, #8b2d3a 100%)",
    },
  },

  /* ── subtle patterns (light) ───────────────────── */
  {
    id: "warm-sand",
    name: "Warm Sand",
    style: {
      backgroundColor: "#f5e6d3",
      backgroundImage:
        "radial-gradient(circle, #e0cdb8 0.5px, transparent 0.5px)",
      backgroundSize: "16px 16px",
    },
  },
  {
    id: "dots-light",
    name: "Dots",
    style: {
      backgroundColor: "#eef2f7",
      backgroundImage:
        "radial-gradient(circle, #c0cfe0 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    },
  },
  {
    id: "grid-light",
    name: "Grid",
    style: {
      backgroundColor: "#f0f4f8",
      backgroundImage:
        "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
      backgroundSize: "22px 22px",
    },
  },

  /* ── subtle patterns (dark) ────────────────────── */
  {
    id: "dots-dark",
    name: "Dots Dark",
    style: {
      backgroundColor: "#0e1621",
      backgroundImage:
        "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    },
  },
  {
    id: "grid-dark",
    name: "Grid Dark",
    style: {
      backgroundColor: "#0e1621",
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
      backgroundSize: "22px 22px",
    },
  },
];

/* ── localStorage helpers ─────────────────────────── */

const STORAGE_KEY_PREFIX = "illissiot-chat-bg-";
const CUSTOM_BG_PREFIX = "illissiot-chat-custom-bg-";

export function getChatBackground(chatId: number): string {
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${chatId}`) || "default";
  } catch {
    return "default";
  }
}

export function setChatBackground(chatId: number, bgId: string): void {
  try {
    if (bgId === "default") {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${chatId}`);
    } else {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${chatId}`, bgId);
    }
  } catch {
    // storage full or unavailable
  }
}

export function findBackground(id: string): ChatBackground {
  return CHAT_BACKGROUNDS.find((bg) => bg.id === id) || CHAT_BACKGROUNDS[0];
}

/* ── Custom image background helpers ──────────────── */

export function getCustomBackgroundUrl(chatId: number): string | null {
  try {
    return localStorage.getItem(`${CUSTOM_BG_PREFIX}${chatId}`);
  } catch {
    return null;
  }
}

export function setCustomBackgroundUrl(chatId: number, url: string): void {
  try {
    localStorage.setItem(`${CUSTOM_BG_PREFIX}${chatId}`, url);
  } catch {
    // storage full or unavailable
  }
}

export function removeCustomBackground(chatId: number): void {
  try {
    localStorage.removeItem(`${CUSTOM_BG_PREFIX}${chatId}`);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${chatId}`);
  } catch {
    // noop
  }
}

export function buildCustomBackgroundStyle(url: string): CSSProperties {
  return {
    background: `url('${url}') center / cover no-repeat`,
  };
}
