import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import {
  useChats,
  useCreateChannel,
  useCreateDirectChat,
  useCreateGroupChat,
  useJoinChannel,
  useSearchChannels,
} from '../hooks/useChats';
import { useSearchUsers } from '../hooks/useUsers';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { User } from '../types';
import { getThemeColors, type ThemeColors } from '../theme';

type SearchTarget = 'users' | 'groups' | 'channels';

type ChannelResult = {
  id: number;
  name: string | null;
  avatarUrl: string | null;
  memberCount: number;
  isJoined: boolean;
};

export function UserSearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');

  const [searchTarget, setSearchTarget] = useState<SearchTarget>('users');
  const [isChannelMode, setIsChannelMode] = useState(false);
  const [channelName, setChannelName] = useState('');

  const { data: chats } = useChats();

  const userSearchQuery = isGroupMode || (!isChannelMode && searchTarget === 'users') ? query : '';
  const channelSearchQuery = !isGroupMode && !isChannelMode && searchTarget === 'channels' ? query : '';

  const { data: searchResults, isLoading: usersLoading } = useSearchUsers(userSearchQuery);
  const { data: channelResults, isLoading: channelsLoading } = useSearchChannels(channelSearchQuery);

  const createDirectChat = useCreateDirectChat();
  const createGroupChat = useCreateGroupChat();
  const createChannel = useCreateChannel();
  const joinChannel = useJoinChannel();

  const filteredUsers = (searchResults || []).filter((u) => u.id !== user?.id);

  const matchedGroups = useMemo(() => {
    if (isGroupMode || isChannelMode || searchTarget !== 'groups') {
      return [];
    }

    const term = query.trim().toLowerCase();
    if (!term) {
      return [];
    }

    return (chats || []).filter((chat) => {
      if (!chat.isGroup || chat.isChannel) {
        return false;
      }
      const name = (chat.name || '').toLowerCase();
      return name.includes(term);
    });
  }, [chats, isChannelMode, isGroupMode, query, searchTarget]);

  const switchToGroupMode = () => {
    setIsChannelMode(false);
    setSearchTarget('users');
    setQuery('');
    setIsGroupMode(true);
  };

  const switchToChannelMode = () => {
    setIsGroupMode(false);
    setSelectedUsers([]);
    setGroupName('');
    setSearchTarget('channels');
    setQuery('');
    setIsChannelMode(true);
  };

  const switchToSearchMode = () => {
    setIsGroupMode(false);
    setSelectedUsers([]);
    setGroupName('');
    setIsChannelMode(false);
    setChannelName('');
    setSearchTarget('users');
    setQuery('');
  };

  const toggleUserSelection = (selected: User) => {
    setSelectedUsers((prev) => {
      if (prev.some((u) => u.id === selected.id)) {
        return prev.filter((u) => u.id !== selected.id);
      }
      return [...prev, selected];
    });
  };

  const handleSelectUser = async (selected: User) => {
    if (isGroupMode) {
      toggleUserSelection(selected);
      return;
    }

    try {
      const chat = await createDirectChat.mutateAsync(selected.id);
      navigation.replace('ChatWindow', { chatId: chat.id });
    } catch {
      Alert.alert('Error', 'Failed to open chat. Please try again.');
    }
  };

  const handleCreateGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      Alert.alert('Group name required', 'Please enter a group name.');
      return;
    }

    if (selectedUsers.length === 0) {
      Alert.alert('Add members', 'Select at least one member to create a group.');
      return;
    }

    try {
      const chat = await createGroupChat.mutateAsync({
        name,
        memberIds: selectedUsers.map((u) => u.id),
      });
      navigation.replace('ChatWindow', { chatId: chat.id });
    } catch {
      Alert.alert('Error', 'Failed to create group. Please try again.');
    }
  };

  const handleCreateChannel = async () => {
    const name = channelName.trim();
    if (!name) {
      Alert.alert('Channel name required', 'Please enter a channel name.');
      return;
    }

    try {
      const chat = await createChannel.mutateAsync({ name });
      navigation.replace('ChatWindow', { chatId: chat.id });
    } catch {
      Alert.alert('Error', 'Failed to create channel. Please try again.');
    }
  };

  const handleOpenGroup = (chatId: number) => {
    navigation.replace('ChatWindow', { chatId });
  };

  const handleOpenChannel = async (channel: ChannelResult) => {
    try {
      if (channel.isJoined) {
        navigation.replace('ChatWindow', { chatId: channel.id });
        return;
      }

      const joined = await joinChannel.mutateAsync(channel.id);
      navigation.replace('ChatWindow', { chatId: joined.id });
    } catch {
      Alert.alert('Error', 'Failed to join channel. Please try again.');
    }
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.userItem} onPress={() => handleSelectUser(item)}>
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>{(item.firstName || item.username || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.firstName || item.username || 'Unknown User'}</Text>
        {!!item.status && <Text style={styles.userStatus}>{item.status}</Text>}
      </View>
      {isGroupMode && selectedUsers.some((u) => u.id === item.id) && (
        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
      )}
    </TouchableOpacity>
  );

  const renderGroupItem = ({ item }: { item: NonNullable<typeof chats>[number] }) => (
    <TouchableOpacity style={styles.userItem} onPress={() => handleOpenGroup(item.id)}>
      <View style={[styles.userAvatar, styles.groupAvatar]}>
        <Ionicons name="people" size={18} color={colors.primaryForeground} />
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name || 'Unnamed Group'}</Text>
        <Text style={styles.userStatus}>Group</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  const renderChannelItem = ({ item }: { item: ChannelResult }) => (
    <TouchableOpacity style={styles.userItem} onPress={() => handleOpenChannel(item)}>
      <View style={[styles.userAvatar, styles.channelAvatar]}>
        <Ionicons name="megaphone" size={18} color={colors.primaryForeground} />
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name || 'Unnamed Channel'}</Text>
        <Text style={styles.userStatus}>{item.memberCount} members</Text>
      </View>
      <View style={[styles.channelAction, item.isJoined && styles.channelActionJoined]}>
        <Text style={[styles.channelActionText, item.isJoined && styles.channelActionTextJoined]}>
          {item.isJoined ? 'Open' : 'Join'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const screenTitle = isGroupMode ? 'New Group' : isChannelMode ? 'New Channel' : 'New Chat';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{screenTitle}</Text>
        <TouchableOpacity
          onPress={() => {
            if (isGroupMode || isChannelMode) {
              switchToSearchMode();
              return;
            }
            switchToGroupMode();
          }}
        >
          <Ionicons name={isGroupMode || isChannelMode ? 'close' : 'people'} size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {!isGroupMode && !isChannelMode && (
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickActionButton} onPress={switchToGroupMode}>
            <Ionicons name="people" size={18} color={colors.primary} />
            <Text style={styles.quickActionText}>Create Group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton} onPress={switchToChannelMode}>
            <Ionicons name="megaphone" size={18} color={colors.primary} />
            <Text style={styles.quickActionText}>Create Channel</Text>
          </TouchableOpacity>
        </View>
      )}

      {isGroupMode && (
        <TextInput
          style={styles.groupNameInput}
          placeholder="Group name"
          value={groupName}
          onChangeText={setGroupName}
        />
      )}

      {isChannelMode && (
        <View style={styles.channelCreatorWrap}>
          <Text style={styles.channelCreatorLabel}>Channel Name</Text>
          <TextInput
            style={styles.channelInput}
            placeholder="Enter channel name"
            value={channelName}
            onChangeText={setChannelName}
            autoFocus
            onSubmitEditing={handleCreateChannel}
          />
          <TouchableOpacity
            style={[styles.createChannelButton, (!channelName.trim() || createChannel.isPending) && styles.createButtonDisabled]}
            onPress={handleCreateChannel}
            disabled={!channelName.trim() || createChannel.isPending}
          >
            <Text style={styles.createButtonText}>{createChannel.isPending ? 'Creating...' : 'Create Channel'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {isGroupMode && selectedUsers.length > 0 && (
        <View style={styles.selectedUsersContainer}>
          <Text style={styles.selectedUsersLabel}>Selected ({selectedUsers.length})</Text>
          <View style={styles.selectedUsersWrap}>
            {selectedUsers.map((selected) => (
              <View key={selected.id} style={styles.selectedUserChip}>
                <Text style={styles.selectedUserText}>{selected.firstName || selected.username || 'User'}</Text>
                <TouchableOpacity onPress={() => toggleUserSelection(selected)}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      {!isChannelMode && (
        <>
          {!isGroupMode && (
            <View style={styles.segmentedTabs}>
              <TouchableOpacity
                style={[styles.segmentTab, searchTarget === 'users' && styles.segmentTabActive]}
                onPress={() => setSearchTarget('users')}
              >
                <Text style={[styles.segmentLabel, searchTarget === 'users' && styles.segmentLabelActive]}>Users</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentTab, searchTarget === 'groups' && styles.segmentTabActive]}
                onPress={() => setSearchTarget('groups')}
              >
                <Text style={[styles.segmentLabel, searchTarget === 'groups' && styles.segmentLabelActive]}>Groups</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentTab, searchTarget === 'channels' && styles.segmentTabActive]}
                onPress={() => setSearchTarget('channels')}
              >
                <Text style={[styles.segmentLabel, searchTarget === 'channels' && styles.segmentLabelActive]}>Channels</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={
                isGroupMode
                  ? 'Search users'
                  : searchTarget === 'groups'
                  ? 'Search groups'
                  : searchTarget === 'channels'
                  ? 'Search channels'
                  : 'Search users'
              }
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>

          {(isGroupMode || searchTarget === 'users') && (
            <>
              {usersLoading ? (
                <View style={styles.centerBox}>
                  <Text style={styles.emptyText}>Loading users...</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredUsers}
                  keyExtractor={(item) => item.id}
                  renderItem={renderUserItem}
                  contentContainerStyle={styles.listContainer}
                  ListEmptyComponent={
                    <View style={styles.centerBox}>
                      <Text style={styles.emptyText}>No users found</Text>
                    </View>
                  }
                />
              )}
            </>
          )}

          {!isGroupMode && searchTarget === 'groups' && (
            <FlatList
              data={matchedGroups}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderGroupItem}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <View style={styles.centerBox}>
                  <Text style={styles.emptyText}>No groups found</Text>
                </View>
              }
            />
          )}

          {!isGroupMode && searchTarget === 'channels' && (
            <>
              {channelsLoading ? (
                <View style={styles.centerBox}>
                  <Text style={styles.emptyText}>Loading channels...</Text>
                </View>
              ) : (
                <FlatList
                  data={(channelResults || []) as ChannelResult[]}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderChannelItem}
                  contentContainerStyle={styles.listContainer}
                  ListEmptyComponent={
                    <View style={styles.centerBox}>
                      <Text style={styles.emptyText}>No channels found</Text>
                    </View>
                  }
                />
              )}
            </>
          )}
        </>
      )}

      {isGroupMode && selectedUsers.length > 0 && !!groupName.trim() && (
        <TouchableOpacity
          style={[styles.createGroupButton, createGroupChat.isPending && styles.createButtonDisabled]}
          onPress={handleCreateGroup}
          disabled={createGroupChat.isPending}
        >
          <Text style={styles.createButtonText}>{createGroupChat.isPending ? 'Creating...' : 'Create Group'}</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingVertical: 10,
  },
  quickActionText: {
    color: colors.text,
    fontWeight: '600',
  },
  segmentedTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 4,
  },
  segmentTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentTabActive: {
    backgroundColor: colors.primary,
  },
  segmentLabel: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  segmentLabelActive: {
    color: colors.primaryForeground,
  },
  groupNameInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  channelCreatorWrap: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
    backgroundColor: colors.surface,
  },
  channelCreatorLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  channelInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    backgroundColor: colors.background,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: 0,
  },
  selectedUsersContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  selectedUsersLabel: {
    color: colors.textMuted,
    marginBottom: 6,
    fontSize: 12,
  },
  selectedUsersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedUserChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedUserText: {
    color: colors.text,
    fontSize: 12,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 140,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupAvatar: {
    backgroundColor: '#14b8a6',
  },
  channelAvatar: {
    backgroundColor: '#f97316',
  },
  userAvatarText: {
    color: colors.primaryForeground,
    fontWeight: '700',
    fontSize: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  userStatus: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  channelAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  channelActionJoined: {
    backgroundColor: `${colors.primary}20`,
    borderWidth: 1,
    borderColor: `${colors.primary}50`,
  },
  channelActionText: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontWeight: '700',
  },
  channelActionTextJoined: {
    color: colors.primary,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: colors.textMuted,
  },
  createGroupButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  createChannelButton: {
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: '700',
  },
});
