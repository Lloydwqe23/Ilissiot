import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="ChatList" component={ChatListScreen} />
        <Stack.Screen name="ChatWindow" component={ChatWindowScreen} />
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
