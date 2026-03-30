import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert, Linking, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { queryClient } from './src/queryClient';
import { loadSessionCookie } from './src/api';
import { useAuth } from './src/hooks/useAuth';
import { useWebSocket } from './src/hooks/useWebSocket';
import { AuthScreen } from './src/screens/AuthScreen';
import { AppNavigator } from './src/navigation/AppNavigator';
import { getThemeColors } from './src/theme';
import { WS_EVENTS } from './src/types';
import { initializeNotifications, registerDevicePushToken } from './src/lib/notifications';

function isDarkColor(color: string): boolean {
  const clean = color.replace('#', '');
  if (!/^[0-9a-fA-F]{3,8}$/.test(clean)) return true;

  const hex = clean.length === 3
    ? clean.split('').map((c) => `${c}${c}`).join('')
    : clean.slice(0, 6);

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance < 0.55;
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const useLightStatusIcons = isDarkColor(colors.headerBackground);
  const useLightNavButtons = isDarkColor(colors.background);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // Keep navigation bar visible and set icon style using APIs that work with edge-to-edge.
    NavigationBar.setVisibilityAsync('visible').catch(() => {});
    NavigationBar.setButtonStyleAsync(useLightNavButtons ? 'light' : 'dark').catch(() => {});

    // Edge-to-edge style fallback used by newer Android system bars.
    NavigationBar.setStyle(useLightNavButtons ? 'dark' : 'light');
  }, [useLightNavButtons]);

  // Initialize WebSocket connection when authenticated
  const { send } = useWebSocket({
    userId: user?.id,
    activeChatId,
    onCallOffer: (payload) => {
      // Expo Go builds do not include WebRTC native modules; keep UX clean and notify caller.
      try {
        send(WS_EVENTS.CALL_BUSY, { ...payload, reason: 'unsupported-client' });
      } catch {}

      Alert.alert(
        'Incoming call',
        'Calls aren’t available in this build. To enable calls, you need a dev-client build (native WebRTC).',
        [
          { text: 'OK' },
          {
            text: 'Docs',
            onPress: () => {
              // Open a generic Expo dev-client docs page
              Linking.openURL('https://docs.expo.dev/develop/development-builds/introduction/');
            },
          },
        ]
      );
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setActiveChatId(null);
      return;
    }

    void (async () => {
      const isReady = await initializeNotifications();
      if (isReady) {
        await registerDevicePushToken(user.id);
      }
    })();
  }, [isAuthenticated, user?.id]);

  if (isLoading) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.appRoot, { backgroundColor: colors.background }]}>
      <ExpoStatusBar
        style={useLightStatusIcons ? 'light' : 'dark'}
        backgroundColor={colors.headerBackground}
        translucent={false}
      />
      {isAuthenticated ? <AppNavigator onActiveChatChange={setActiveChatId} /> : <AuthScreen />}
    </SafeAreaView>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        await loadSessionCookie();
      } catch (error) {
        console.warn('Failed to load session cookie:', error);
      } finally {
        if (isMounted) {
          setReady(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AppContent />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  appRoot: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
