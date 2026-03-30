import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  FlatList,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setStringAsync } from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../hooks/useAuth';
import {
  useChat,
  useLeaveGroup,
  useDeleteChat,
  useUpdateGroupChat,
  useRemoveGroupMember,
  useUpdateMemberRole,
  useInviteLinks,
  useCreateInviteLink,
  useRevokeInviteLink,
  usePinnedMessages,
} from '../hooks/useChats';
import { getThemeColors } from '../theme';
import { getChatName, getChatAvatar, getDisplayName, getInitials } from '../utils/helpers';
import { getFullUrl, API_BASE_URL } from '../api';
import { ScreenHeader } from '../components/ScreenHeader';

type Props = {
  navigation: any;
  route: { params: { chatId: number } };
};

export function GroupInfoScreen({ navigation, route }: Props) {
  const { chatId } = route.params;
  const { user } = useAuth();
  const { data: chat } = useChat(chatId);
  const leaveGroup = useLeaveGroup();
  const deleteChat = useDeleteChat();
  const updateGroupChat = useUpdateGroupChat();
  const removeMember = useRemoveGroupMember();
  const updateMemberRole = useUpdateMemberRole();
  const { data: inviteLinks } = useInviteLinks(chatId);
  const createInviteLink = useCreateInviteLink();
  const revokeInviteLink = useRevokeInviteLink();
  const { data: pinnedMessages } = usePinnedMessages(chatId);
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);

  if (!chat || !user) return null;

  const currentMember = chat.members.find((m) => m.userId === user.id);
  const isAdmin = currentMember?.role === 'admin';
  const canEditGroupInfo = isAdmin || !!(currentMember?.permissions as Record<string, boolean> | undefined)?.canEditInfo;
  const isCreator = chat.creatorId === user.id;
  const chatName = getChatName(chat, user.id);
  const chatAvatar = getChatAvatar(chat, user.id);

  const handleLeave = () => {
    Alert.alert('Leave Group', 'Are you sure you want to leave this group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          leaveGroup.mutate(chatId);
          navigation.navigate('ChatList');
        },
      },
    ]);
  };

  const handleDeleteGroup = () => {
    Alert.alert('Delete Group', 'This action cannot be undone. Delete this group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteChat.mutate(chatId);
          navigation.navigate('ChatList');
        },
      },
    ]);
  };

  const handleRemoveMember = (userId: string, name: string) => {
    Alert.alert('Remove Member', `Remove ${name} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeMember.mutate({ chatId, userId }),
      },
    ]);
  };

  const handleToggleAdmin = (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    updateMemberRole.mutate({ chatId, userId, role: newRole });
  };

  const handleCreateInviteLink = async () => {
    try {
      const link = await createInviteLink.mutateAsync({ chatId });
      const url = `${API_BASE_URL}/invite/${(link as any).token}`;
      Share.share({ message: `Join our group on Ilissiot: ${url}` });
    } catch (err) {}
  };

  const handleChangeGroupIcon = async () => {
    if (!canEditGroupInfo) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to update group icon.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      legacy: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const fileName = uri.split('/').pop() || `group-${Date.now()}.jpg`;
    const ext = fileName.split('.').pop()?.toLowerCase();
    const type = ext === 'png' ? 'image/png' : 'image/jpeg';

    setUploadingGroupAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: fileName,
        type,
      } as any);

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const uploaded = await response.json();
      await updateGroupChat.mutateAsync({ chatId, avatarUrl: uploaded.url });
    } catch {
      Alert.alert('Update failed', 'Could not update group icon. Please try again.');
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        colors={colors}
        title="Group Info"
        subtitle={chatName}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Group avatar and name */}
        <View style={styles.groupHeader}>
          <TouchableOpacity
            activeOpacity={canEditGroupInfo ? 0.85 : 1}
            onPress={canEditGroupInfo ? handleChangeGroupIcon : undefined}
            disabled={!canEditGroupInfo || uploadingGroupAvatar}
            style={styles.groupAvatarButton}
          >
            <View style={[styles.groupAvatar, { backgroundColor: colors.primary }]}> 
              {chatAvatar ? (
                <Image source={{ uri: chatAvatar }} style={styles.groupAvatarImage} />
              ) : (
                <View style={[styles.groupAvatarFallback, { backgroundColor: colors.primary }]}>
                  <Ionicons name="people" size={34} color="#fff" />
                </View>
              )}
              {uploadingGroupAvatar && (
                <View style={styles.groupAvatarLoadingOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
            {canEditGroupInfo && !uploadingGroupAvatar && (
              <View style={[styles.groupAvatarCameraBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={[styles.groupName, { color: colors.text }]}>{chatName}</Text>
          <Text style={[styles.memberCount, { color: colors.textMuted }]}>
            {chat.members.length} member{chat.members.length !== 1 ? 's' : ''}
          </Text>
          {canEditGroupInfo && (
            <Text style={[styles.changeIconHint, { color: colors.textMuted }]}>Tap icon to change</Text>
          )}
        </View>

        {/* Actions */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate('PinnedMessages', { chatId })}
          >
            <Ionicons name="pin" size={20} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.text }]}>
              Pinned Messages ({pinnedMessages?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate('CreatePoll', { chatId })}
          >
            <Ionicons name="stats-chart" size={20} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.text }]}>Create Poll</Text>
          </TouchableOpacity>

          {canEditGroupInfo && (
            <TouchableOpacity style={styles.actionRow} onPress={handleChangeGroupIcon}>
              <Ionicons name="image-outline" size={20} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.text }]}>Change Group Icon</Text>
            </TouchableOpacity>
          )}

          {isAdmin && (
            <TouchableOpacity style={styles.actionRow} onPress={handleCreateInviteLink}>
              <Ionicons name="link" size={20} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.text }]}>Create Invite Link</Text>
            </TouchableOpacity>
          )}

          {isAdmin && (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => navigation.navigate('UserSearch')}
            >
              <Ionicons name="person-add" size={20} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.text }]}>Add Members</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Invite links */}
        {inviteLinks && inviteLinks.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Invite Links</Text>
            {inviteLinks.map((link) => (
              <View key={link.id} style={[styles.inviteLinkRow, { borderBottomColor: colors.border }]}>
                <View style={styles.inviteLinkInfo}>
                  <Text style={[styles.inviteLinkToken, { color: colors.primary }]} numberOfLines={1}>
                    {API_BASE_URL}/invite/{link.token}
                  </Text>
                  <Text style={[styles.inviteLinkMeta, { color: colors.textMuted }]}>
                    Uses: {link.currentUses}{link.maxUses ? `/${link.maxUses}` : ''}
                  </Text>
                </View>
                <View style={styles.inviteLinkActions}>
                  <TouchableOpacity
                    onPress={async () => {
                      const full = `${API_BASE_URL}/invite/${link.token}`;
                      await setStringAsync(full);
                      Alert.alert('Copied', 'Invite link copied to clipboard.');
                    }}
                  >
                    <Ionicons name="copy-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => revokeInviteLink.mutate({ chatId, token: link.token })}>
                    <Ionicons name="trash" size={18} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Members */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Members</Text>
          {chat.members.map((member) => {
            const memberName = getDisplayName(member.user);
            const isMemberCreator = member.userId === chat.creatorId;
            const isMemberAdmin = member.role === 'admin';
            const isCurrentUser = member.userId === user.id;
            const avatarUrl = member.user.profileImageUrl ? getFullUrl(member.user.profileImageUrl) : null;

            return (
              <TouchableOpacity
                key={member.id}
                style={[styles.memberRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  if (!isCurrentUser) {
                    navigation.navigate('UserProfile', { userId: member.userId, chatId });
                  }
                }}
              >
                <View style={[styles.memberAvatar, { backgroundColor: colors.primary }]}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.memberAvatarImage} />
                  ) : (
                    <Text style={styles.memberAvatarText}>{getInitials(memberName)}</Text>
                  )}
                </View>
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {memberName}
                      {isCurrentUser ? ' (You)' : ''}
                    </Text>
                  </View>
                  <View style={styles.memberBadges}>
                    {isMemberCreator && (
                      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.badgeText}>Creator</Text>
                      </View>
                    )}
                    {isMemberAdmin && (
                      <View style={[styles.badge, { backgroundColor: colors.success }]}>
                        <Text style={styles.badgeText}>Admin</Text>
                      </View>
                    )}
                    {member.title && (
                      <View style={[styles.badge, { backgroundColor: colors.textMuted }]}>
                        <Text style={styles.badgeText}>{member.title}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {isAdmin && !isCurrentUser && !isMemberCreator && (
                  <View style={styles.memberActions}>
                    <TouchableOpacity
                      onPress={() => handleToggleAdmin(member.userId, member.role || 'member')}
                      style={styles.memberActionButton}
                    >
                      <Ionicons
                        name={isMemberAdmin ? 'arrow-down' : 'arrow-up'}
                        size={18}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRemoveMember(member.userId, memberName)}
                      style={styles.memberActionButton}
                    >
                      <Ionicons name="remove-circle" size={18} color={colors.destructive} />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Leave / Delete */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.dangerRow} onPress={handleLeave}>
            <Ionicons name="exit-outline" size={20} color={colors.destructive} />
            <Text style={[styles.dangerText, { color: colors.destructive }]}>Leave Group</Text>
          </TouchableOpacity>
          {isCreator && (
            <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteGroup}>
              <Ionicons name="trash" size={20} color={colors.destructive} />
              <Text style={[styles.dangerText, { color: colors.destructive }]}>Delete Group</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  groupHeader: { alignItems: 'center', marginBottom: 16 },
  groupAvatarButton: { position: 'relative' },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groupAvatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarCameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarImage: { width: 80, height: 80, borderRadius: 40 },
  groupAvatarText: { color: '#fff', fontSize: 28, fontWeight: '600' },
  groupName: { fontSize: 22, fontWeight: '700', marginTop: 12 },
  memberCount: { fontSize: 14, marginTop: 4 },
  changeIconHint: { marginTop: 6, fontSize: 12, fontWeight: '500' },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', padding: 12, paddingBottom: 4 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 12,
  },
  actionText: { fontSize: 15 },
  inviteLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  inviteLinkInfo: { flex: 1 },
  inviteLinkActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteLinkToken: { fontSize: 13 },
  inviteLinkMeta: { fontSize: 11, marginTop: 2 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberAvatarImage: { width: 38, height: 38, borderRadius: 19 },
  memberAvatarText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center' },
  memberName: { fontSize: 14, fontWeight: '500' },
  memberBadges: { flexDirection: 'row', gap: 4, marginTop: 2 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  memberActions: { flexDirection: 'row', gap: 8 },
  memberActionButton: { padding: 4 },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 12,
  },
  dangerText: { fontSize: 15, fontWeight: '500' },
});
