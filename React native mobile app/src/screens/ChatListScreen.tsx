import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChats, useDeleteChat, useUnpinChat } from '../hooks/useChats';
import { useAuth } from '../hooks/useAuth';
import { getFullUrl } from '../api';
import { getThemeColors } from '../theme';
import {
  getChatName,
  getChatAvatar,
  formatMessageTime,
  getInitials,
  getMessagePreviewText,
} from '../utils/helpers';
import { muteFor, setChatMute, subscribeChatMute, isChatMuted } from '../lib/chat-mute';
import type { Chat } from '../types';

type Props = {
  navigation: any;
};

const CHAT_ALIAS_KEY_PREFIX = 'ilissiot-chat-alias-';

function getChatAliasStorageKey(userId: string, chatId: number): string {
  return `${CHAT_ALIAS_KEY_PREFIX}${userId}-${chatId}`;
}

export function ChatListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data: chats, isLoading, refetch } = useChats();
  const deleteChat = useDeleteChat();
  const unpinChat = useUnpinChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [actionChat, setActionChat] = useState<Chat | null>(null);
  const [chatAliases, setChatAliases] = useState<Record<number, string>>({});
  const [chatMutedMap, setChatMutedMap] = useState<Record<number, boolean>>({});
  const [renameChat, setRenameChat] = useState<Chat | null>(null);
  const [renameText, setRenameText] = useState('');
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const profileAvatarUrl = user?.profileImageUrl ? getFullUrl(user.profileImageUrl) : null;
  const profileInitial = (
    user?.firstName?.[0] || user?.username?.[0] || user?.email?.[0] || 'U'
  ).toUpperCase();

  const getResolvedChatName = (chat: Chat) => {
    if (!user) return chat.name || 'Chat';
    const alias = chatAliases[chat.id]?.trim();
    return alias || getChatName(chat, user.id);
  };

  useEffect(() => {
    let isMounted = true;

    const loadAliases = async () => {
      if (!user?.id || !chats?.length) {
        if (isMounted) {
          setChatAliases({});
        }
        return;
      }

      try {
        const entries = await Promise.all(
          chats.map(async (chat) => {
            const key = getChatAliasStorageKey(user.id, chat.id);
            const alias = (await AsyncStorage.getItem(key))?.trim() || '';
            return [chat.id, alias] as const;
          }),
        );

        if (!isMounted) return;

        const nextAliases: Record<number, string> = {};
        entries.forEach(([chatId, alias]) => {
          if (alias) {
            nextAliases[chatId] = alias;
          }
        });
        setChatAliases(nextAliases);
      } catch {
        if (isMounted) {
          setChatAliases({});
        }
      }
    };

    loadAliases();

    return () => {
      isMounted = false;
    };
  }, [chats, user?.id]);

  useEffect(() => {
    let isMounted = true;

    const syncMutedState = async () => {
      if (!chats?.length) {
        if (isMounted) {
          setChatMutedMap({});
        }
        return;
      }

      const nextMuted: Record<number, boolean> = {};

      await Promise.all(
        chats.map(async (chat) => {
          if (await isChatMuted(chat.id, user?.id)) {
            nextMuted[chat.id] = true;
          }
        }),
      );

      if (isMounted) {
        setChatMutedMap(nextMuted);
      }
    };

    const refreshMutedState = () => {
      void syncMutedState();
    };

    refreshMutedState();
    const unsubscribe = subscribeChatMute(refreshMutedState);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [chats, user?.id]);

  const filteredChats = useMemo(() => {
    if (!chats || !user) return [];
    let list = chats;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((chat) => {
        const name = getResolvedChatName(chat).toLowerCase();
        const fallback = getChatName(chat, user.id).toLowerCase();
        return name.includes(q) || fallback.includes(q);
      });
    }
    // Sort: pinned first, then by last message time
    return [...list].sort((a, b) => {
      const aPinned = a.members.find((m) => m.userId === user.id)?.pinnedAt;
      const bPinned = b.members.find((m) => m.userId === user.id)?.pinnedAt;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      const aTime = a.lastMessage?.createdAt || a.createdAt || '';
      const bTime = b.lastMessage?.createdAt || b.createdAt || '';
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [chats, user, searchQuery, chatAliases]);

  const closeRenameModal = () => {
    setRenameChat(null);
    setRenameText('');
  };

  const closeActionMenu = () => {
    setActionChat(null);
  };

  const openRenameModal = (chat: Chat) => {
    if (!user) return;
    setRenameChat(chat);
    setRenameText(chatAliases[chat.id]?.trim() || getChatName(chat, user.id));
  };

  const saveRenameAlias = async () => {
    if (!renameChat || !user?.id) return;
    const key = getChatAliasStorageKey(user.id, renameChat.id);
    const trimmed = renameText.trim();
    const defaultName = getChatName(renameChat, user.id).trim();

    try {
      if (!trimmed || trimmed.toLowerCase() === defaultName.toLowerCase()) {
        await AsyncStorage.removeItem(key);
        setChatAliases((prev) => {
          const next = { ...prev };
          delete next[renameChat.id];
          return next;
        });
      } else {
        await AsyncStorage.setItem(key, trimmed);
        setChatAliases((prev) => ({ ...prev, [renameChat.id]: trimmed }));
      }
      closeRenameModal();
    } catch {
      Alert.alert('Rename failed', 'Could not save chat name. Please try again.');
    }
  };

  const resetRenameAlias = async () => {
    if (!renameChat || !user?.id) return;
    const key = getChatAliasStorageKey(user.id, renameChat.id);

    try {
      await AsyncStorage.removeItem(key);
      setChatAliases((prev) => {
        const next = { ...prev };
        delete next[renameChat.id];
        return next;
      });
      closeRenameModal();
    } catch {
      Alert.alert('Rename failed', 'Could not reset chat name. Please try again.');
    }
  };

  const handleDeleteChat = (chat: Chat) => {
    const name = getResolvedChatName(chat);
    Alert.alert('Delete chat', `Delete "${name}"? This cannot be undone.`, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteChat.mutateAsync(chat.id);
            if (user?.id) {
              await AsyncStorage.removeItem(getChatAliasStorageKey(user.id, chat.id));
            }
            setChatAliases((prev) => {
              const next = { ...prev };
              delete next[chat.id];
              return next;
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not delete this chat.';
            Alert.alert('Delete failed', message || 'Could not delete this chat.');
          }
        },
      },
    ]);
  };

  const handleUnpinChat = async (chat: Chat) => {
    if (!user) return;
    const isPinned = !!chat.members.find((m) => m.userId === user.id)?.pinnedAt;
    if (!isPinned) {
      return;
    }

    try {
      await unpinChat.mutateAsync(chat.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not unpin this chat.';
      Alert.alert('Unpin failed', message || 'Could not unpin this chat.');
    }
  };

  const openChatActions = (chat: Chat) => {
    if (!user) return;
    setActionChat(chat);
  };

  const actionChatIsPinned = !!(
    actionChat &&
    user &&
    actionChat.members.find((m) => m.userId === user.id)?.pinnedAt
  );

  const actionChatIsMuted = !!(actionChat && chatMutedMap[actionChat.id]);

  const renderChatItem = ({ item: chat }: { item: Chat }) => {
    if (!user) return null;
    const name = getResolvedChatName(chat);
    const avatar = getChatAvatar(chat, user.id);
    const isPinned = !!chat.members.find((m) => m.userId === user.id)?.pinnedAt;
    const isMuted = !!chatMutedMap[chat.id];
    const lastMsg = chat.lastMessage;
    const unread = chat.unreadCount || 0;

    return (
      <TouchableOpacity
        style={[styles.chatItem, { backgroundColor: colors.card }]}
        onPress={() => navigation.navigate('ChatWindow', { chatId: chat.id })}
        onLongPress={() => openChatActions(chat)}
        delayLongPress={240}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={[styles.avatarContainer, { backgroundColor: colors.primary }]}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : chat.isChannel ? (
            <View style={[styles.groupAvatarFallback, { backgroundColor: colors.primary }]}>
              <Ionicons name="megaphone" size={20} color="#fff" />
            </View>
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
              {chat.isChannel ? (
                <Ionicons name="megaphone" size={14} color={colors.textMuted} style={{ marginRight: 4 }} />
              ) : chat.isGroup ? (
                <Ionicons name="people" size={14} color={colors.textMuted} style={{ marginRight: 4 }} />
              ) : null}
              <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
                {name}
              </Text>
              {isPinned && (
                <Ionicons name="pin" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
              )}
              {isMuted && (
                <Ionicons name="notifications-off" size={12} color={colors.textMuted} style={{ marginLeft: 4 }} />
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
                ? getMessagePreviewText(lastMsg, user.id, { includeGroupSender: !!chat.isGroup })
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
              {profileAvatarUrl ? (
                <Image source={{ uri: profileAvatarUrl }} style={styles.profileAvatar} />
              ) : (
                <View style={[styles.profileAvatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.profileAvatarLetter}>{profileInitial}</Text>
                </View>
              )}
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

      <Modal
        visible={!!actionChat}
        transparent
        animationType="none"
        onRequestClose={closeActionMenu}
      >
        <Pressable
          style={[styles.popupOverlay, { backgroundColor: colors.overlay }]}
          onPress={closeActionMenu}
        >
          <Pressable
            style={[styles.popupCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <View style={styles.popupTitleRow}>
              <Text style={[styles.popupTitle, { color: colors.text }]} numberOfLines={1}>
                {actionChat ? getResolvedChatName(actionChat) : 'Chat actions'}
              </Text>
              <Text style={[styles.popupSubtitle, { color: colors.textMuted }]}>
                {actionChatIsMuted ? 'Notifications are muted' : 'Choose an action'}
              </Text>
            </View>

            <View style={[styles.popupDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.popupMenuItem}
              onPress={() => {
                if (!actionChat) return;
                closeActionMenu();
                openRenameModal(actionChat);
              }}
            >
              <Ionicons name="create-outline" size={20} color={colors.primary} />
              <Text style={[styles.popupMenuItemText, { color: colors.text }]}>Rename for you</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.popupMenuItem, !actionChatIsPinned && styles.popupMenuItemDisabled]}
              disabled={!actionChatIsPinned}
              onPress={() => {
                if (!actionChat) return;
                closeActionMenu();
                void handleUnpinChat(actionChat);
              }}
            >
              <Ionicons
                name="pin-outline"
                size={20}
                color={actionChatIsPinned ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.popupMenuItemText,
                  { color: actionChatIsPinned ? colors.text : colors.textMuted },
                ]}
              >
                Unpin chat
              </Text>
            </TouchableOpacity>

            {actionChatIsMuted ? (
              <TouchableOpacity
                style={styles.popupMenuItem}
                onPress={() => {
                  if (!actionChat) return;
                  closeActionMenu();
                  void setChatMute(actionChat.id, null, user?.id);
                }}
              >
                <Ionicons name="notifications" size={20} color={colors.primary} />
                <Text style={[styles.popupMenuItemText, { color: colors.text }]}>Unmute notifications</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.popupMenuItem}
                  onPress={() => {
                    if (!actionChat) return;
                    closeActionMenu();
                    void setChatMute(actionChat.id, muteFor(1), user?.id);
                  }}
                >
                  <Ionicons name="notifications-off-outline" size={20} color={colors.primary} />
                  <Text style={[styles.popupMenuItemText, { color: colors.text }]}>Mute for 1 hour</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.popupMenuItem}
                  onPress={() => {
                    if (!actionChat) return;
                    closeActionMenu();
                    void setChatMute(actionChat.id, muteFor(8), user?.id);
                  }}
                >
                  <Ionicons name="notifications-off-outline" size={20} color={colors.primary} />
                  <Text style={[styles.popupMenuItemText, { color: colors.text }]}>Mute for 8 hours</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.popupMenuItem}
                  onPress={() => {
                    if (!actionChat) return;
                    closeActionMenu();
                    void setChatMute(actionChat.id, muteFor(24), user?.id);
                  }}
                >
                  <Ionicons name="notifications-off-outline" size={20} color={colors.primary} />
                  <Text style={[styles.popupMenuItemText, { color: colors.text }]}>Mute for 24 hours</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.popupMenuItem}
                  onPress={() => {
                    if (!actionChat) return;
                    closeActionMenu();
                    void setChatMute(actionChat.id, 'forever', user?.id);
                  }}
                >
                  <Ionicons name="notifications-off" size={20} color={colors.primary} />
                  <Text style={[styles.popupMenuItemText, { color: colors.text }]}>Mute forever</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.popupMenuItem}
              onPress={() => {
                if (!actionChat) return;
                closeActionMenu();
                handleDeleteChat(actionChat);
              }}
            >
              <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              <Text style={[styles.popupMenuItemText, { color: colors.destructive }]}>Delete chat</Text>
            </TouchableOpacity>

            <View style={[styles.popupDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.popupMenuItem} onPress={closeActionMenu}>
              <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.popupMenuItemText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!renameChat}
        transparent
        animationType="none"
        onRequestClose={closeRenameModal}
      >
        <Pressable
          style={[styles.popupOverlay, { backgroundColor: colors.overlay }]}
          onPress={closeRenameModal}
        >
          <Pressable
            style={[styles.popupCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <View style={styles.popupTitleRow}>
              <Text style={[styles.popupTitle, { color: colors.text }]}>Rename for you</Text>
              <Text style={[styles.popupSubtitle, { color: colors.textMuted }]}>Only you will see this name.</Text>
            </View>

            <View style={[styles.popupDivider, { backgroundColor: colors.border }]} />

            <View
              style={[
                styles.renameInputWrap,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.inputBackground,
                },
              ]}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
 
              <TextInput
                style={[styles.renameInput, { color: colors.text }]}
                placeholder="Chat name"
                placeholderTextColor={colors.textMuted}
                value={renameText}
                onChangeText={setRenameText}
                maxLength={80}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  void saveRenameAlias();
                }}
              />
            </View>

            <View style={[styles.popupDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.popupMenuItem}
              onPress={() => {
                void saveRenameAlias();
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
              <Text style={[styles.popupMenuItemText, { color: colors.text }]}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.popupMenuItem}
              onPress={() => {
                void resetRenameAlias();
              }}
            >
              <Ionicons name="refresh-circle-outline" size={20} color={colors.primary} />
              <Text style={[styles.popupMenuItemText, { color: colors.text }]}>Reset to default</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.popupMenuItem}
              onPress={closeRenameModal}
            >
              <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.popupMenuItemText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  profileAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarLetter: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  newChatIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
  popupOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  popupCard: {
    width: '100%',
    borderRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderWidth: 1,
  },
  popupTitleRow: {
    gap: 2,
    marginBottom: 8,
  },
  popupTitle: {
    fontSize: 23,
    fontWeight: '700',
  },
  popupSubtitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  popupDivider: {
    height: 1,
    marginVertical: 8,
  },
  popupMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  popupMenuItemDisabled: {
    opacity: 0.55,
  },
  popupMenuItemText: {
    fontSize: 16,
    fontWeight: '600',
  },
  renameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  renameInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
});
