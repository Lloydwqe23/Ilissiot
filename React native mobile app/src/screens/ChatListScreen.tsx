import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChats } from '../hooks/useChats';
import { useAuth } from '../hooks/useAuth';
import { getThemeColors } from '../theme';
import {
  getChatName,
  getChatAvatar,
  formatMessageTime,
  formatPreview,
  getInitials,
} from '../utils/helpers';
import type { Chat } from '../types';

type Props = {
  navigation: any;
};

export function ChatListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data: chats, isLoading, refetch } = useChats();
  const [searchQuery, setSearchQuery] = useState('');
  const colors = getThemeColors(user?.theme, user?.colorTheme);

  const filteredChats = useMemo(() => {
    if (!chats || !user) return [];
    let list = chats;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((chat) => {
        const name = getChatName(chat, user.id).toLowerCase();
        return name.includes(q);
      });
    }
    // Sort: pinned first, then by last message time
    return list.sort((a, b) => {
      const aPinned = a.members.find((m) => m.userId === user.id)?.pinnedAt;
      const bPinned = b.members.find((m) => m.userId === user.id)?.pinnedAt;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      const aTime = a.lastMessage?.createdAt || a.createdAt || '';
      const bTime = b.lastMessage?.createdAt || b.createdAt || '';
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [chats, user, searchQuery]);

  const renderChatItem = ({ item: chat }: { item: Chat }) => {
    if (!user) return null;
    const name = getChatName(chat, user.id);
    const avatar = getChatAvatar(chat, user.id);
    const isPinned = !!chat.members.find((m) => m.userId === user.id)?.pinnedAt;
    const lastMsg = chat.lastMessage;
    const unread = chat.unreadCount || 0;

    return (
      <TouchableOpacity
        style={[styles.chatItem, { backgroundColor: colors.card }]}
        onPress={() => navigation.navigate('ChatWindow', { chatId: chat.id })}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={[styles.avatarContainer, { backgroundColor: colors.primary }]}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : chat.isGroup ? (
            <View style={[styles.groupAvatarFallback, { backgroundColor: colors.primary }]}>
              <Ionicons name="people" size={20} color="#fff" />
            </View>
          ) : (
            <Text style={styles.avatarText}>{getInitials(name)}</Text>
          )}
        </View>

        {/* Content */}
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <View style={styles.chatNameRow}>
              {chat.isGroup && (
                <Ionicons name="people" size={14} color={colors.textMuted} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
                {name}
              </Text>
              {isPinned && (
                <Ionicons name="pin" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
              )}
            </View>
            {lastMsg && (
              <Text style={[styles.chatTime, { color: colors.textMuted }]}>
                {formatMessageTime(lastMsg.createdAt)}
              </Text>
            )}
          </View>
          <View style={styles.chatPreview}>
            <Text
              style={[styles.previewText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {lastMsg
                ? lastMsg.content
                  ? (lastMsg.senderId === user.id ? 'You: ' : '') + formatPreview(lastMsg.content)
                  : lastMsg.attachments?.length
                    ? '📎 Attachment'
                    : ''
                : 'No messages yet'}
            </Text>
            {unread > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={[styles.headerSafe, { backgroundColor: colors.headerBackground }]}>
        <View style={[styles.headerRow, { borderBottomColor: colors.border }]}> 
          <View style={styles.brandWrap}>
            <Image source={require('../../assets/icon.png')} style={styles.brandLogo} />
            <Text style={[styles.brandText, { color: colors.text }]}>Ilissiot</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('UserSearch')}>
              <View style={styles.newChatIconWrap}>
                <Ionicons name="person" size={22} color={colors.primary} />
                <View style={[styles.newChatPlusBadge, { backgroundColor: colors.primary }]}>
                  <Ionicons name="add" size={10} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('Profile')}>
              <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search chats..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Chat List */}
      <FlatList
        data={filteredChats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={filteredChats.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              {searchQuery ? 'No chats found' : 'No conversations yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              {searchQuery ? 'Try a different search' : 'Start a new chat to begin messaging'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSafe: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  brandText: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: 'serif',
    letterSpacing: 0.2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 4,
  },
  newChatIconWrap: {
    width: 28,
    height: 24,
    overflow: 'visible',
  },
  newChatPlusBadge: {
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  chatItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  groupAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatContent: {
    flex: 1,
    marginLeft: 12,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  chatTime: {
    fontSize: 12,
  },
  chatPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewText: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});
