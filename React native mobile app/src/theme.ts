import { Appearance } from 'react-native';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceVariant: string;
  primary: string;
  primaryForeground: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  destructive: string;
  success: string;
  messageBubbleSent: string;
  messageBubbleReceived: string;
  messageBubbleSentText: string;
  messageBubbleReceivedText: string;
  inputBackground: string;
  headerBackground: string;
  card: string;
  overlay: string;
};

const lightColors: ThemeColors = {
  background: '#ffffff',
  surface: '#f8f9fa',
  surfaceVariant: '#f1f3f5',
  primary: '#6366f1',
  primaryForeground: '#ffffff',
  text: '#1a1a2e',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  border: '#e2e8f0',
  destructive: '#ef4444',
  success: '#22c55e',
  messageBubbleSent: '#6366f1',
  messageBubbleReceived: '#f1f3f5',
  messageBubbleSentText: '#ffffff',
  messageBubbleReceivedText: '#1a1a2e',
  inputBackground: '#f1f3f5',
  headerBackground: '#ffffff',
  card: '#ffffff',
  overlay: 'rgba(0,0,0,0.5)',
};

const darkColors: ThemeColors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceVariant: '#334155',
  primary: '#818cf8',
  primaryForeground: '#ffffff',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#334155',
  destructive: '#f87171',
  success: '#4ade80',
  messageBubbleSent: '#6366f1',
  messageBubbleReceived: '#1e293b',
  messageBubbleSentText: '#ffffff',
  messageBubbleReceivedText: '#f1f5f9',
  inputBackground: '#1e293b',
  headerBackground: '#0f172a',
  card: '#1e293b',
  overlay: 'rgba(0,0,0,0.7)',
};

export function getThemeColors(theme?: string, colorTheme?: string | null): ThemeColors {
  let resolvedColors: ThemeColors;

  if (theme === 'dark') {
    resolvedColors = darkColors;
  } else if (theme === 'light') {
    resolvedColors = lightColors;
  } else {
    // Custom themes — appearance palette variations
    const themeAccents: Record<string, Partial<ThemeColors>> = {
      greenish: {
        primary: '#22c55e',
        messageBubbleSent: '#22c55e',
        background: '#f0fdf4',
        surface: '#dcfce7',
        surfaceVariant: '#bbf7d0',
        headerBackground: '#f0fdf4',
      },
      yellowish: {
        primary: '#eab308',
        messageBubbleSent: '#eab308',
        background: '#fefce8',
        surface: '#fef9c3',
        surfaceVariant: '#fef08a',
        headerBackground: '#fefce8',
      },
      blueish: {
        primary: '#3b82f6',
        messageBubbleSent: '#3b82f6',
        background: '#eff6ff',
        surface: '#dbeafe',
        surfaceVariant: '#bfdbfe',
        headerBackground: '#eff6ff',
      },
      purpleish: {
        primary: '#a855f7',
        messageBubbleSent: '#a855f7',
        background: '#faf5ff',
        surface: '#f3e8ff',
        surfaceVariant: '#e9d5ff',
        headerBackground: '#faf5ff',
      },
      pinkish: {
        primary: '#ec4899',
        messageBubbleSent: '#ec4899',
        background: '#fdf2f8',
        surface: '#fce7f3',
        surfaceVariant: '#fbcfe8',
        headerBackground: '#fdf2f8',
      },
      orangeish: {
        primary: '#f97316',
        messageBubbleSent: '#f97316',
        background: '#fff7ed',
        surface: '#ffedd5',
        surfaceVariant: '#fed7aa',
        headerBackground: '#fff7ed',
      },
    };

    if (theme && themeAccents[theme]) {
      resolvedColors = { ...lightColors, ...themeAccents[theme] };
    } else {
      // Default: detect system
      const systemTheme = Appearance.getColorScheme();
      resolvedColors = systemTheme === 'dark' ? darkColors : lightColors;
    }
  }

  if (!colorTheme) return resolvedColors;

  const accent = getColorThemeAccent(colorTheme);
  return {
    ...resolvedColors,
    primary: accent,
    messageBubbleSent: accent,
  };
}

export function getColorThemeAccent(colorTheme?: string | null): string {
  const colorMap: Record<string, string> = {
    blue: '#6366f1',
    green: '#22c55e',
    red: '#ef4444',
    gold: '#eab308',
    purple: '#a855f7',
    pink: '#ec4899',
    teal: '#14b8a6',
    orange: '#f97316',
    indigo: '#4f46e5',
  };
  return colorMap[colorTheme || 'blue'] || '#6366f1';
}
