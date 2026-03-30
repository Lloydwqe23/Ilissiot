// Default backend points to production; switch to local backend for development if needed.
// Local examples: Android emulator -> http://10.0.2.2:5000, physical device -> http://<LAN-IP>:5000
export const API_BASE_URL = 'https://ilissiot.onrender.com';
export const WS_BASE_URL = `${API_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;

export const UPLOAD_MAX_SIZE = 50 * 1024 * 1024; // 50MB

export const THEMES = ['light', 'dark', 'greenish', 'yellowish', 'blueish', 'purpleish', 'pinkish', 'orangeish'] as const;
export const COLOR_THEMES = ['blue', 'green', 'red', 'gold', 'purple', 'pink', 'teal', 'orange', 'indigo'] as const;
export const FONT_TYPES = ['inter', 'poppins', 'lora', 'jetbrains', 'nunito', 'merriweather', 'manrope', 'playfair'] as const;
export const TEXT_SIZES = ['small', 'normal', 'large'] as const;
