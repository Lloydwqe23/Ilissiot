import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Share,
  ActivityIndicator,
  TextInput,
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
  useUpdateMemberTitle,
  useUpdateMemberPermissions,
  useInviteLinks,
  useCreateInviteLink,
  useRevokeInviteLink,
  usePinnedMessages,
} from '../hooks/useChats';
import { getThemeColors } from '../theme';
import { getChatName, getChatAvatar, getDisplayName, getInitials } from '../utils/helpers';
import { getFullUrl, API_BASE_URL } from '../api';
import { ScreenHeader } from '../components/ScreenHeader';
import type { ChatMember } from '../types';

type Props = {
  navigation: any;
  route: { params: { chatId: number } };
};

const DEFAULT_MEMBER_PERMISSIONS: Record<string, boolean> = {
  canPin: true,
  canInvite: true,
  canCreatePolls: true,
  canRemove: false,
  canEditInfo: false,
  canDeleteMessages: false,
};

const PERMISSION_OPTIONS: Array<{ key: string; label: string; description: string }> = [
  { key: 'canInvite', label: 'Invite members', description: 'Add new members to the group' },
  { key: 'canRemove', label: 'Remove members', description: 'Remove members from the group' },
  { key: 'canEditInfo', label: 'Edit group info', description: 'Change group name and icon' },
  { key: 'canDeleteMessages', label: 'Delete messages', description: "Delete other members' messages" },
  { key: 'canCreatePolls', label: 'Create polls', description: 'Create polls in the group' },
];

export function GroupInfoScreen({ navigation, route }: Props) {
  const { chatId } = route.params;
  const { user } = useAuth();
  const { data: chat } = useChat(chatId);
  const leaveGroup = useLeaveGroup();
  const deleteChat = useDeleteChat();
  const updateGroupChat = useUpdateGroupChat();
  const removeMember = useRemoveGroupMember();
  const updateMemberRole = useUpdateMemberRole();
  const updateMemberTitle = useUpdateMemberTitle();
  const updateMemberPermissions = useUpdateMemberPermissions();
  const { data: inviteLinks } = useInviteLinks(chatId);
  const createInviteLink = useCreateInviteLink();
  const revokeInviteLink = useRevokeInviteLink();
  const { data: pinnedMessages } = usePinnedMessages(chatId);
  const colors = getThemeColors(user?.theme, user?.colorTheme);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [settingsMember, setSettingsMember] = useState<ChatMember | null>(null);
  const [memberRoleDraft, setMemberRoleDraft] = useState<'admin' | 'member'>('member');
  const [memberTitleDraft, setMemberTitleDraft] = useState('');
  const [memberPermissionsDraft, setMemberPermissionsDraft] = useState<Record<string, boolean>>(
    DEFAULT_MEMBER_PERMISSIONS,
  );

  if (!chat || !user) return null;

  const currentMember = chat.members.find((m) => m.userId === user.id);
  const isAdmin = currentMember?.role === 'admin';
  const canEditGroupInfo = isAdmin || !!(currentMember?.permissions as Record<string, boolean> | undefined)?.canEditInfo;
  const isCreator = chat.creatorId === user.id;
  const chatName = getChatName(chat, user.id);
  const chatAvatar = getChatAvatar(chat, user.id);
  const activeInviteLinks = (inviteLinks || []).filter((link) => link.isActive !== false);
  const isSavingMemberSettings =
    updateMemberRole.isPending ||
    updateMemberTitle.isPending ||
    updateMemberPermissions.isPending;

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

  const handleOpenMemberSettings = (member: ChatMember) => {
    const memberRole = member.role === 'admin' ? 'admin' : 'member';
    const currentPermissions = member.permissions && typeof member.permissions === 'object'
      ? member.permissions
      : {};

    setSettingsMember(member);
    setMemberRoleDraft(memberRole);
    setMemberTitleDraft(member.title || '');
    setMemberPermissionsDraft({
      ...DEFAULT_MEMBER_PERMISSIONS,
      ...currentPermissions,
    });
  };

  const handleCloseMemberSettings = () => {
    setSettingsMember(null);
  };

  const togglePermission = (key: string) => {
    setMemberPermissionsDraft((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSaveMemberSettings = async () => {
    if (!settingsMember) return;

    try {
      const userId = settingsMember.userId;
      const currentRole = settingsMember.role === 'admin' ? 'admin' : 'member';
      const currentTitle = settingsMember.title || '';
      const newTitle = memberTitleDraft.trim();
      const currentPerms = settingsMember.permissions && typeof settingsMember.permissions === 'object'
        ? settingsMember.permissions
        : {};

      if (memberRoleDraft !== currentRole) {
        await updateMemberRole.mutateAsync({
          chatId,
          userId,
          role: memberRoleDraft,
        });
      }

      if (newTitle !== currentTitle) {
        await updateMemberTitle.mutateAsync({
          chatId,
          userId,
          title: newTitle || null,
        });
      }

      if (memberRoleDraft !== 'admin') {
        const permissionsChanged = PERMISSION_OPTIONS.some(
          (permission) =>
            Boolean(memberPermissionsDraft[permission.key]) !== Boolean(currentPerms[permission.key]),
        );

        if (permissionsChanged) {
          await updateMemberPermissions.mutateAsync({
            chatId,
            userId,
            permissions: memberPermissionsDraft,
          });
        }
      }

      setSettingsMember(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update member settings.';
      Alert.alert('Save failed', message);
    }
  };

  const handleCreateInviteLink = async () => {
    try {
      const link = await createInviteLink.mutateAsync({ chatId });
      const url = `${API_BASE_URL}/invite/${(link as any).token}`;
      Share.share({ message: `Join our group on Ilissiot: ${url}` });
    } catch (err) {}
  };

  const handleRevokeInviteLink = (token: string) => {
    Alert.alert('Delete Invite Link', 'Delete this invite link?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeInviteLink.mutateAsync({ chatId, token });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not delete invite link.';
            Alert.alert('Delete failed', message);
          }
        },
      },
    ]);
  };

  const handleChangeGroupIcon = async () => {
    if (!canEditGroupInfo) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to update group icon.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
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
        {activeInviteLinks.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Invite Links</Text>
            {activeInviteLinks.map((link) => (
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
                    disabled={revokeInviteLink.isPending}
                    onPress={async () => {
                      const full = `${API_BASE_URL}/invite/${link.token}`;
                      await setStringAsync(full);
                      Alert.alert('Copied', 'Invite link copied to clipboard.');
                    }}
                  >
                    <Ionicons name="copy-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  {isAdmin && (
                    <TouchableOpacity
                      disabled={revokeInviteLink.isPending}
                      onPress={() => handleRevokeInviteLink(link.token)}
                    >
                      <Ionicons name="trash" size={18} color={colors.destructive} />
                    </TouchableOpacity>
                  )}
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
                      onPress={() => handleOpenMemberSettings(member)}
                      style={styles.memberActionButton}
                    >
                      <Ionicons name="settings-outline" size={18} color={colors.primary} />
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

      <Modal
        visible={!!settingsMember}
        transparent
        animationType="fade"
        onRequestClose={handleCloseMemberSettings}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
            onPress={handleCloseMemberSettings}
          />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Member Settings</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              {settingsMember ? getDisplayName(settingsMember.user) : ''}
            </Text>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Role</Text>
            <View style={styles.roleButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: memberRoleDraft === 'admin' ? colors.primary : colors.surface,
                  },
                ]}
                onPress={() => setMemberRoleDraft('admin')}
                disabled={isSavingMemberSettings}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={14}
                  color={memberRoleDraft === 'admin' ? colors.primaryForeground : colors.primary}
                />
                <Text
                  style={[
                    styles.roleButtonText,
                    { color: memberRoleDraft === 'admin' ? colors.primaryForeground : colors.text },
                  ]}
                >
                  Admin
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: memberRoleDraft === 'member' ? colors.primary : colors.surface,
                  },
                ]}
                onPress={() => setMemberRoleDraft('member')}
                disabled={isSavingMemberSettings}
              >
                <Ionicons
                  name="person"
                  size={14}
                  color={memberRoleDraft === 'member' ? colors.primaryForeground : colors.primary}
                />
                <Text
                  style={[
                    styles.roleButtonText,
                    { color: memberRoleDraft === 'member' ? colors.primaryForeground : colors.text },
                  ]}
                >
                  Member
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Custom Title</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
              placeholder="Optional title"
              placeholderTextColor={colors.textMuted}
              value={memberTitleDraft}
              onChangeText={setMemberTitleDraft}
              editable={!isSavingMemberSettings}
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>Permissions</Text>
            {memberRoleDraft === 'admin' ? (
              <Text style={[styles.permissionsHint, { color: colors.textMuted }]}>Admins have all permissions.</Text>
            ) : (
              <View style={styles.permissionsList}>
                {PERMISSION_OPTIONS.map((permission) => {
                  const enabled = Boolean(memberPermissionsDraft[permission.key]);
                  return (
                    <TouchableOpacity
                      key={permission.key}
                      style={[styles.permissionRow, { borderColor: colors.border }]}
                      onPress={() => togglePermission(permission.key)}
                      disabled={isSavingMemberSettings}
                    >
                      <View
                        style={[
                          styles.permissionCheck,
                          {
                            borderColor: enabled ? colors.primary : colors.border,
                            backgroundColor: enabled ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {enabled && <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />}
                      </View>
                      <View style={styles.permissionTextWrap}>
                        <Text style={[styles.permissionLabel, { color: colors.text }]}>{permission.label}</Text>
                        <Text style={[styles.permissionDescription, { color: colors.textMuted }]}>
                          {permission.description}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalActionButton, styles.modalCancelButton, { borderColor: colors.border }]}
                onPress={handleCloseMemberSettings}
                disabled={isSavingMemberSettings}
              >
                <Text style={[styles.modalActionText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalActionButton,
                  styles.modalSaveButton,
                  { backgroundColor: colors.primary },
                  isSavingMemberSettings && styles.modalButtonDisabled,
                ]}
                onPress={handleSaveMemberSettings}
                disabled={isSavingMemberSettings}
              >
                <Text style={[styles.modalActionText, { color: colors.primaryForeground }]}>
                  {isSavingMemberSettings ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  roleButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  roleButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  permissionsHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  permissionsList: {
    gap: 8,
  },
  permissionRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  permissionCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionTextWrap: {
    flex: 1,
  },
  permissionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  permissionDescription: {
    fontSize: 11,
    marginTop: 1,
  },
  modalActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  modalActionButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    borderWidth: 1,
  },
  modalSaveButton: {
    borderWidth: 0,
  },
  modalActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalButtonDisabled: {
    opacity: 0.7,
  },
});
