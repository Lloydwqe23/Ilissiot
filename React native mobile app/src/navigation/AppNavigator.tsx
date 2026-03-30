import React from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { ChatListScreen } from '../screens/ChatListScreen';
import { ChatWindowScreen } from '../screens/ChatWindowScreen';
import { UserSearchScreen } from '../screens/UserSearchScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { GroupInfoScreen } from '../screens/GroupInfoScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { CreatePollScreen } from '../screens/CreatePollScreen';
import { PinnedMessagesScreen } from '../screens/PinnedMessagesScreen';

export type RootStackParamList = {
  ChatList: undefined;
  ChatWindow: { chatId: number; messageId?: number };
  UserSearch: undefined;
  Profile: undefined;
  GroupInfo: { chatId: number };
  UserProfile: { userId: string; chatId?: number };
  CreatePoll: { chatId: number };
  PinnedMessages: { chatId: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type AppNavigatorProps = {
  onActiveChatChange?: (chatId: number | null) => void;
};

export function AppNavigator({ onActiveChatChange }: AppNavigatorProps) {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  const emitActiveChat = React.useCallback(() => {
    const currentRoute = navigationRef.getCurrentRoute();

    if (!currentRoute || currentRoute.name !== 'ChatWindow') {
      onActiveChatChange?.(null);
      return;
    }

    const params = currentRoute.params as RootStackParamList['ChatWindow'] | undefined;
    const chatId = typeof params?.chatId === 'number' ? params.chatId : null;
    onActiveChatChange?.(chatId);
  }, [navigationRef, onActiveChatChange]);

  return (
    <NavigationContainer ref={navigationRef} onReady={emitActiveChat} onStateChange={emitActiveChat}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'none',
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="ChatList" component={ChatListScreen} />
        <Stack.Screen
          name="ChatWindow"
          component={ChatWindowScreen}
          options={{
            gestureEnabled: false,
            animation: 'none',
            presentation: 'transparentModal',
            contentStyle: styles.transparentCard,
          }}
        />
        <Stack.Screen name="UserSearch" component={UserSearchScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
        <Stack.Screen name="PinnedMessages" component={PinnedMessagesScreen} />
        <Stack.Screen name="UserProfile" component={UserProfileScreen} />
        <Stack.Screen name="CreatePoll" component={CreatePollScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  transparentCard: {
    backgroundColor: 'transparent',
  },
});
