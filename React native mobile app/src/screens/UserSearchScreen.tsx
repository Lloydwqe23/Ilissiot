import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useSearchUsers } from '../hooks/useUsers';
import { useCreateDirectChat, useCreateGroupChat } from '../hooks/useChats';
import { getThemeColors } from '../theme';
import { getDisplayName, getInitials } from '../utils/helpers';
import { getFullUrl } from '../api';
import type { User } from '../types';

type Props = { navigation: any };

export function UserSearchScreen({ navigation }: Props) {
  const { user } = useAuth();
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const { data: results, isLoading } = useSearchUsers(query);
  const createDirect = useCreateDirectChat();
  const createGroup = useCreateGroupChat();

  const handleSelectUser = async (selectedUser: User) => {
    if (isGroupMode) {
      setSelectedUsers((prev) => {
        const exists = prev.find((u) => u.id === selectedUser.id);
        if (exists) return prev.filter((u) => u.id !== selectedUser.id);
        return [...prev, selectedUser];
      });
    } else {
      try {
        const chat = await createDirect.mutateAsync(selectedUser.id);
        navigation.replace('ChatWindow', { chatId: chat.id });
      } catch (err) {
        // Chat may already exist
      }
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    try {
      const chat = await createGroup.mutateAsync({
        name: groupName.trim(),
        memberIds: selectedUsers.map((u) => u.id),
      });
      navigation.replace('ChatWindow', { chatId: chat.id });
    } catch (err) {}
  };

  const filteredResults = results?.filter((u) => u.id !== user?.id) || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isGroupMode ? 'New Group' : 'New Chat'}
        </Text>
        <TouchableOpacity onPress={() => setIsGroupMode(!isGroupMode)} style={styles.modeToggleButton}>
          {isGroupMode ? (
            <Ionicons name="person" size={22} color={colors.primary} />
          ) : (
            <View style={styles.groupAddIconWrap}>
              <Ionicons name="people" size={22} color={colors.primary} />
              <View style={[styles.groupAddPlusBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="add" size={10} color="#fff" />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Group name input */}
      {isGroupMode && (
        <View style={[styles.groupNameContainer, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[styles.groupNameInput, { color: colors.text, backgroundColor: colors.inputBackground }]}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Group name"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      )}

      {/* Selected users for group */}
      {isGroupMode && selectedUsers.length > 0 && (
        <View style={styles.selectedContainer}>
          <FlatList
            horizontal
            data={selectedUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.selectedChip, { backgroundColor: colors.primary }]}
                onPress={() => handleSelectUser(item)}
              >
                <Text style={styles.selectedChipText}>{getDisplayName(item)}</Text>
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.selectedList}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username..."
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* Results */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filteredResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item: u }) => {
            const isSelected = selectedUsers.some((s) => s.id === u.id);
            return (
              <TouchableOpacity
                style={[styles.userItem, isSelected && { backgroundColor: colors.primary + '15' }]}
                onPress={() => handleSelectUser(u)}
              >
                <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
                  {u.profileImageUrl ? (
                    <Image source={{ uri: getFullUrl(u.profileImageUrl) }} style={styles.userAvatarImage} />
                  ) : (
                    <Text style={styles.userAvatarText}>{getInitials(getDisplayName(u))}</Text>
                  )}
                </View>
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, { color: colors.text }]}>{getDisplayName(u)}</Text>
                  {u.username && (
                    <Text style={[styles.userUsername, { color: colors.textMuted }]}>@{u.username}</Text>
                  )}
                </View>
                {isGroupMode && isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            query.length > 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No users found</Text>
            ) : (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Search for users by username</Text>
            )
          }
        />
      )}

      {/* Create group button */}
      {isGroupMode && selectedUsers.length > 0 && groupName.trim() && (
        <TouchableOpacity
          style={[styles.createGroupButton, { backgroundColor: colors.primary }]}
          onPress={handleCreateGroup}
        >
          <Ionicons name="checkmark" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: { padding: 4 },
  modeToggleButton: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAddIconWrap: {
    width: 28,
    height: 24,
    overflow: 'visible',
  },
  groupAddPlusBadge: {
    position: 'absolute',
    right: 0,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  groupNameContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  groupNameInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  selectedContainer: { paddingVertical: 8 },
  selectedList: { paddingHorizontal: 16, gap: 8 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  selectedChipText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 16 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  userAvatarImage: { width: 44, height: 44, borderRadius: 22 },
  userAvatarText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600' },
  userUsername: { fontSize: 13, marginTop: 1 },
  emptyText: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  createGroupButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
