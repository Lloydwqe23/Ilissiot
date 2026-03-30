import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useBlockUser, useUnblockUser, useBlockStatus, useCreateDirectChat } from '../hooks/useChats';
import { useChats, useChat } from '../hooks/useChats';
import { useMessages } from '../hooks/useMessages';
import { useUserStatus } from '@/hooks/useUserStatus';
import { getThemeColors } from '../theme';
import { getDisplayName, getInitials } from '../utils/helpers';
import { getFullUrl } from '../api';
import { apiRequest } from '../api';
import type { Attachment, User } from '../types';
import { useQuery } from '@tanstack/react-query';

type Props = {
  navigation: any;
  route: { params: { userId: string; chatId?: number } };
};

export function UserProfileScreen({ navigation, route }: Props) {
  const { userId, chatId } = route.params;
  const { user } = useAuth();
  const colors = getThemeColors(user?.theme, user?.colorTheme);
    const insets = useSafeAreaInsets();
  const { data: chats = [] } = useChats();
  const { data: routeChat } = useChat(chatId || null);
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const { data: blockStatus } = useBlockStatus(userId);
  const createDirect = useCreateDirectChat();
  const [activeTab, setActiveTab] = useState<'general' | 'voice-video' | 'media' | 'documents'>('general');

  const directChatId = useMemo(() => {
    if (chatId && routeChat && !routeChat.isGroup) return chatId;
    if (!user?.id) return null;
    const direct = chats.find(
      (c) =>
        !c.isGroup &&
        c.members.some((m) => m.userId === user.id) &&
        c.members.some((m) => m.userId === userId)
    );
    return direct?.id || null;
  }, [chatId, routeChat, chats, user?.id, userId]);

  const { data: directChat } = useChat(directChatId);
  const { data: messages = [], isLoading: messagesLoading } = useMessages(directChatId);

  const memberUser = useMemo(() => {
    const fromRouteChat = routeChat?.members?.find((m) => m.userId === userId)?.user;
    if (fromRouteChat) return fromRouteChat;
    const fromDirectChat = directChat?.members?.find((m) => m.userId === userId)?.user;
    if (fromDirectChat) return fromDirectChat;
    return null;
  }, [routeChat, directChat, userId]);

  // Fallback if user info isn't present in loaded chats
  const { data: searchedUser } = useQuery<User | null>({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const results = await apiRequest<User[]>(`/api/users/search?q=${userId}`);
      return results.find((u) => u.id === userId) || null;
    },
    enabled: !memberUser,
  });

  const profileUser = memberUser || searchedUser;
  const { isOnline, statusText } = useUserStatus(
    userId,
    profileUser?.status || null,
    profileUser?.lastSeen || null,
  );
  const isBlockActionLoading = blockUser.isPending || unblockUser.isPending;

  const mediaData = useMemo(() => {
    const audioVideo: Array<{ messageId: number; attachment: Attachment; createdAt: string | null | undefined }> = [];
    const media: Array<{ messageId: number; attachment: Attachment; createdAt: string | null | undefined }> = [];
    const documents: Array<{ messageId: number; attachment: Attachment; createdAt: string | null | undefined }> = [];

    messages.forEach((m) => {
      (m.attachments || []).forEach((att) => {
        const lowerName = att.name.toLowerCase();
        const isVoiceOrVideoMessage =
          lowerName.startsWith('audio-') ||
          lowerName.startsWith('video-') ||
          lowerName.startsWith('screen-') ||
          att.type.startsWith('audio/');

        if (isVoiceOrVideoMessage) {
          audioVideo.push({ messageId: m.id, attachment: att, createdAt: m.createdAt });
          return;
        }

        if (att.type.startsWith('image/') || att.type.startsWith('video/')) {
          media.push({ messageId: m.id, attachment: att, createdAt: m.createdAt });
          return;
        }

        documents.push({ messageId: m.id, attachment: att, createdAt: m.createdAt });
      });
    });

    return { audioVideo, media, documents };
  }, [messages]);

  if (!user) return null;

  if (!profileUser) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 8) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  const displayName = getDisplayName(profileUser);
  const avatarUrl = profileUser.profileImageUrl ? getFullUrl(profileUser.profileImageUrl) : null;

  const tabCount = {
    voiceVideo: mediaData.audioVideo.length,
    media: mediaData.media.length,
    documents: mediaData.documents.length,
  };

  const formatBirthday = (birthday?: string | null) => {
    if (!birthday) return 'Not set';
    const d = new Date(birthday);
    if (Number.isNaN(d.getTime())) return birthday;
    return d.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const renderAttachmentList = (
    list: Array<{ messageId: number; attachment: Attachment; createdAt: string | null | undefined }>,
    emptyTitle: string
  ) => {
    if (messagesLoading) {
      return (
        <View style={styles.tabEmptyWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }

    if (!list.length) {
      return (
        <View style={styles.tabEmptyWrap}>
          <Text style={[styles.tabEmptyText, { color: colors.textMuted }]}>{emptyTitle}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        {list.slice(0, 40).map((item) => (
          <TouchableOpacity
            key={`${item.messageId}-${item.attachment.url}`}
            style={[styles.fileRow, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate('ChatWindow', { chatId: directChatId || chatId, messageId: item.messageId })}
          >
            <Ionicons
              name={
                item.attachment.type.startsWith('image/')
                  ? 'image-outline'
                  : item.attachment.type.startsWith('video/')
                    ? 'videocam-outline'
                    : item.attachment.type.startsWith('audio/')
                      ? 'mic-outline'
                      : 'document-outline'
              }
              size={18}
              color={colors.primary}
            />
            <View style={styles.fileMeta}>
              <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                {item.attachment.name}
              </Text>
              <Text style={[styles.fileDate, { color: colors.textMuted }]}> 
                {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const handleBlock = () => {
    Alert.alert('Block User', `Block ${displayName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser.mutateAsync(userId);
            Alert.alert('Blocked', `${displayName} has been blocked.`);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not block this user.';
            Alert.alert('Block failed', message);
          }
        },
      },
    ]);
  };

  const handleUnblock = async () => {
    try {
      await unblockUser.mutateAsync(userId);
      Alert.alert('Unblocked', `${displayName} has been unblocked.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not unblock this user.';
      Alert.alert('Unblock failed', message);
    }
  };

  const handleMessage = async () => {
    try {
      const chat = await createDirect.mutateAsync(userId);
      navigation.replace('ChatWindow', { chatId: chat.id });
    } catch (err) {}
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
            )}
            {isOnline && <View style={[styles.onlineDot, { borderColor: colors.background }]} />}
          </View>
          <Text style={[styles.displayName, { color: colors.text }]}>{displayName}</Text>
          {profileUser.username && (
            <Text style={[styles.username, { color: colors.primary }]}>@{profileUser.username}</Text>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'general' && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab('general')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'general' ? colors.primary : colors.textMuted }]}>General</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'voice-video' && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab('voice-video')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'voice-video' ? colors.primary : colors.textMuted }]}>
              Voice & Video ({tabCount.voiceVideo})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'media' && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab('media')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'media' ? colors.primary : colors.textMuted }]}>Media ({tabCount.media})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'documents' && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab('documents')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'documents' ? colors.primary : colors.textMuted }]}>
              Documents ({tabCount.documents})
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {activeTab === 'general' && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Bio</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{profileUser.bio?.trim() || 'Not set'}</Text>
            </View>

            <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Birthday</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{formatBirthday(profileUser.birthday)}</Text>
            </View>

            <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Status</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.success : colors.textMuted }]} />
                <Text style={[styles.infoValue, { color: colors.text }]}>{statusText || 'Offline'}</Text>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'voice-video' && renderAttachmentList(mediaData.audioVideo, 'No voice or video messages yet')}
        {activeTab === 'media' && renderAttachmentList(mediaData.media, 'No media yet')}
        {activeTab === 'documents' && renderAttachmentList(mediaData.documents, 'No documents yet')}
      </ScrollView>

      <View style={[styles.bottomActions, { backgroundColor: colors.headerBackground, borderTopColor: colors.border }]}>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.primary }]} onPress={handleMessage}>
            <Ionicons name="chatbubble-outline" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => Alert.alert('Call', 'Call feature coming soon')}
          >
            <Ionicons name="call-outline" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => Alert.alert('Call', 'Video call feature coming soon')}
          >
            <Ionicons name="videocam-outline" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Video call</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.blockButton, { borderColor: colors.destructive }]}
          onPress={blockStatus?.blocked ? handleUnblock : handleBlock}
          disabled={isBlockActionLoading}
        >
          <Ionicons
            name={blockStatus?.blocked ? 'ban' : 'ban-outline'}
            size={18}
            color={colors.destructive}
          />
          <Text style={[styles.blockButtonText, { color: colors.destructive }]}>
            {blockStatus?.blocked ? 'Unblock User' : 'Block User'}
          </Text>
        </TouchableOpacity>
      </View>
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
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13 },
  content: { padding: 16, paddingBottom: 150, alignItems: 'center' },
  profileHeader: { alignItems: 'center', marginBottom: 14 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '600' },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    borderWidth: 3,
  },
  displayName: { fontSize: 34, fontWeight: '700', marginTop: 14 },
  username: { fontSize: 23, marginTop: 2, fontWeight: '600' },
  tabsRow: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#dbe3ef',
    marginBottom: 12,
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  infoCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  infoRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  infoLabel: { fontSize: 14, fontWeight: '700' },
  infoValue: { fontSize: 16, fontWeight: '500' },
  infoDivider: { height: 1, width: '100%' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  tabEmptyWrap: { width: '100%', paddingVertical: 30, alignItems: 'center' },
  tabEmptyText: { fontSize: 14 },
  fileRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: 1,
  },
  fileMeta: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600' },
  fileDate: { fontSize: 12, marginTop: 1 },
  bottomActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  blockButtonText: { fontSize: 15, fontWeight: '600' },
});
