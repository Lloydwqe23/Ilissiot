import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { usePinnedMessages, useChat } from '../hooks/useChats';
import { getThemeColors } from '../theme';
import { getChatName, getInitials, formatFullTime, getDisplayName, getMessagePreviewText } from '../utils/helpers';
import { getFullUrl } from '../api';
import type { PinnedMessage } from '../types';
import { ScreenHeader } from '../components/ScreenHeader';

type Props = {
  navigation: any;
  route: { params: { chatId: number } };
};

export function PinnedMessagesScreen({ navigation, route }: Props) {
  const { chatId } = route.params;
  const { user } = useAuth();
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const { data: chat } = useChat(chatId);
  const { data: pinned, isLoading } = usePinnedMessages(chatId);

  const title = chat && user ? getChatName(chat, user.id) : 'Pinned Messages';

  const renderItem = ({ item }: { item: PinnedMessage }) => {
    const msg = item.message;
    const senderName = getDisplayName(msg.sender);
    const avatar = msg.sender.profileImageUrl ? getFullUrl(msg.sender.profileImageUrl) : null;

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('ChatWindow', { chatId, messageId: msg.id })}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{getInitials(senderName)}</Text>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={[styles.sender, { color: colors.text }]} numberOfLines={1}>
              {senderName}
            </Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>
              {formatFullTime(msg.createdAt)}
            </Text>
          </View>

          <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={2}>
            {getMessagePreviewText(msg) || 'Pinned message'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        colors={colors}
        title="Pinned Messages"
        subtitle={title}
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={pinned || []}
        keyExtractor={(p) => p.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={(pinned?.length || 0) === 0 ? styles.emptyContainer : styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="pin-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              {isLoading ? 'Loading…' : 'No pinned messages'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Long-press a message in chat to pin it.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContainer: { padding: 12, gap: 10 },
  emptyContainer: { flexGrow: 1, padding: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  content: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  sender: { fontSize: 14, fontWeight: '700', flex: 1 },
  time: { fontSize: 11 },
  preview: { fontSize: 14, marginTop: 4, lineHeight: 18 },
});


