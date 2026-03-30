import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api';
import type { Chat, User, InviteLink, PinnedMessage, ChannelComment } from '../types';

export function useChats() {
  return useQuery<Chat[]>({
    queryKey: ['/api/chats'],
    queryFn: () => apiRequest<Chat[]>('/api/chats'),
  });
}

export function useChat(chatId: number | null) {
  return useQuery<Chat>({
    queryKey: ['/api/chats', chatId],
    queryFn: () => apiRequest<Chat>(`/api/chats/${chatId}`),
    enabled: !!chatId,
  });
}

export function useCreateDirectChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiRequest<Chat>('/api/chats/direct', { method: 'POST', body: { userId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
  });
}

export function useCreateGroupChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; memberIds: string[] }) =>
      apiRequest<Chat>('/api/chats/group', { method: 'POST', body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      apiRequest<Chat>('/api/chats/channel', { method: 'POST', body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
  });
}

export function useSearchChannels(query: string) {
  const trimmed = query.trim();
  return useQuery<Array<{ id: number; name: string | null; avatarUrl: string | null; memberCount: number; isJoined: boolean }>>({
    queryKey: ['/api/channels/search', trimmed],
    queryFn: () => apiRequest(`/api/channels/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length > 0,
  });
}

export function useJoinChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) =>
      apiRequest<Chat>(`/api/channels/${chatId}/join`, { method: 'POST' }),
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats', chat.id] });
    },
  });
}

export function useUpdateGroupChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, ...data }: { chatId: number; name?: string; avatarUrl?: string }) =>
      apiRequest<Chat>(`/api/chats/${chatId}`, { method: 'PATCH', body: data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats', variables.chatId] });
    },
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) =>
      apiRequest(`/api/chats/${chatId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
  });
}

export function useAddGroupMembers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, userIds }: { chatId: number; userIds: string[] }) =>
      apiRequest(`/api/chats/${chatId}/members`, { method: 'POST', body: { userIds } }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId] });
    },
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, userId }: { chatId: number; userId: string }) =>
      apiRequest(`/api/chats/${chatId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId] });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) =>
      apiRequest(`/api/chats/${chatId}/leave`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
  });
}

export function usePinChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) =>
      apiRequest(`/api/chats/${chatId}/pin`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
  });
}

export function useUnpinChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) =>
      apiRequest(`/api/chats/${chatId}/unpin`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
  });
}

// Block/Unblock
export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/api/users/${userId}/block`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/blocked'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/block-status'] });
    },
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/api/users/${userId}/unblock`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/blocked'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/block-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
  });
}

export function useBlockedUsers() {
  return useQuery<User[]>({
    queryKey: ['/api/users/blocked'],
    queryFn: () => apiRequest<User[]>('/api/users/blocked'),
  });
}

export function useBlockStatus(userId: string | null) {
  return useQuery<{ blocked: boolean; blockedBy: boolean }>({
    queryKey: ['/api/users/block-status', userId],
    queryFn: () => apiRequest(`/api/users/${userId}/block-status`),
    enabled: !!userId,
  });
}

// Polls
export function useCreatePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, ...data }: {
      chatId: number;
      question: string;
      options: string[];
      allowMultipleAnswers?: boolean;
      isAnonymous?: boolean;
    }) => apiRequest(`/api/chats/${chatId}/polls`, { method: 'POST', body: data }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
    },
  });
}

export function useVotePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, pollId, optionIds }: { chatId: number; pollId: number; optionIds: number[] }) =>
      apiRequest(`/api/polls/${pollId}/vote`, { method: 'POST', body: { optionIds } }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
    },
  });
}

export function useClosePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, pollId }: { chatId: number; pollId: number }) =>
      apiRequest(`/api/chats/${chatId}/polls/${pollId}/close`, { method: 'POST' }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
    },
  });
}

// Pinned Messages
export function usePinnedMessages(chatId: number | null) {
  return useQuery<PinnedMessage[]>({
    queryKey: ['/api/chats', chatId, 'pinned-messages'],
    queryFn: () => apiRequest<PinnedMessage[]>(`/api/chats/${chatId}/pinned-messages`),
    enabled: !!chatId,
  });
}

export function usePinMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, messageId }: { chatId: number; messageId: number }) =>
      apiRequest(`/api/chats/${chatId}/messages/${messageId}/pin`, { method: 'POST' }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'pinned-messages'] });
    },
  });
}

export function useUnpinMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, messageId }: { chatId: number; messageId: number }) =>
      apiRequest(`/api/chats/${chatId}/messages/${messageId}/pin`, { method: 'DELETE' }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'pinned-messages'] });
    },
  });
}

// Invite Links
export function useInviteLinks(chatId: number | null) {
  return useQuery<InviteLink[]>({
    queryKey: ['/api/chats', chatId, 'invite-links'],
    queryFn: () => apiRequest<InviteLink[]>(`/api/chats/${chatId}/invite-links`),
    enabled: !!chatId,
  });
}

export function useCreateInviteLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, ...data }: { chatId: number; expiresAt?: string; maxUses?: number }) =>
      apiRequest(`/api/chats/${chatId}/invite-links`, { method: 'POST', body: data }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'invite-links'] });
    },
  });
}

export function useRevokeInviteLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, token }: { chatId?: number; token: string }) =>
      apiRequest(`/api/invite-links/${token}`, { method: 'DELETE' }),
    onSuccess: (_, v) => {
      if (v.chatId) {
        queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'invite-links'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      }
    },
  });
}

export function useJoinViaInviteLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiRequest(`/api/invite-links/${token}/join`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/chats'] }),
  });
}

// Member management
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, userId, role }: { chatId: number; userId: string; role: string }) =>
      apiRequest(`/api/chats/${chatId}/members/${userId}/role`, { method: 'PATCH', body: { role } }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId] });
    },
  });
}

export function useUpdateMemberTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, userId, title }: { chatId: number; userId: string; title: string | null }) =>
      apiRequest(`/api/chats/${chatId}/members/${userId}/title`, { method: 'PATCH', body: { title } }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId] });
    },
  });
}

export function useUpdateMemberPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, userId, permissions }: { chatId: number; userId: string; permissions: Record<string, boolean> }) =>
      apiRequest(`/api/chats/${chatId}/members/${userId}/permissions`, { method: 'PATCH', body: { permissions } }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId] });
    },
  });
}

// Channel comments
export function useChannelCommentsSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, enabled }: { chatId: number; enabled: boolean }) =>
      apiRequest(`/api/chats/${chatId}/comments-enabled`, {
        method: 'PATCH',
        body: { enabled },
      }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId] });
    },
  });
}

export function useComments(messageId: number | null) {
  return useQuery<ChannelComment[]>({
    queryKey: ['/api/messages', messageId, 'comments'],
    queryFn: () => apiRequest<ChannelComment[]>(`/api/messages/${messageId}/comments`),
    enabled: !!messageId,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: number; content: string }) =>
      apiRequest<ChannelComment>(`/api/messages/${messageId}/comments`, {
        method: 'POST',
        body: { content },
      }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages', v.messageId, 'comments'] });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, commentId }: { messageId: number; commentId: number }) =>
      apiRequest(`/api/messages/${messageId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages', v.messageId, 'comments'] });
    },
  });
}

export function useEditComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, commentId, content }: { messageId: number; commentId: number; content: string }) =>
      apiRequest(`/api/messages/${messageId}/comments/${commentId}`, {
        method: 'PUT',
        body: { content },
      }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages', v.messageId, 'comments'] });
    },
  });
}
