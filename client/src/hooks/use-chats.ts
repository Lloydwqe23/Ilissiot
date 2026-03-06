import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type ChatResponse } from "@shared/routes";

export function useChats() {
  return useQuery({
    queryKey: [api.chats.list.path],
    queryFn: async () => {
      const res = await fetch(api.chats.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chats");
      const data = await res.json();
      return api.chats.list.responses[200].parse(data);
    },
  });
}

export function useChat(id: number | null) {
  return useQuery({
    queryKey: [api.chats.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.chats.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch chat");
      const data = await res.json();
      return api.chats.get.responses[200].parse(data);
    },
    enabled: !!id,
  });
}

export function useCreateDirectChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(api.chats.createDirect.path, {
        method: api.chats.createDirect.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create chat");
      }
      return api.chats.createDirect.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    },
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: number) => {
      const url = buildUrl(api.chats.get.path, { id: chatId });
      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to delete chat');
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    }
  });
}

export function usePinChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: number) => {
      const res = await fetch(`/api/chats/${chatId}/pin`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to pin chat');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    }
  });
}

export function useUnpinChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: number) => {
      const res = await fetch(`/api/chats/${chatId}/unpin`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to unpin chat');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    }
  });
}

export function useCreateGroupChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, memberIds }: { name: string; memberIds: string[] }) => {
      const res = await fetch(api.chats.createGroup.path, {
        method: api.chats.createGroup.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, memberIds }),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create group");
      }
      return api.chats.createGroup.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    },
  });
}

export function useUpdateGroupChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, name, avatarUrl }: { chatId: number; name?: string; avatarUrl?: string | null }) => {
      const url = `/api/chats/${chatId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, avatarUrl }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update group');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.chats.get.path] });
    }
  });
}

export function useAddGroupMembers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, userIds }: { chatId: number; userIds: string[] }) => {
      const res = await fetch(`/api/chats/${chatId}/members`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to add members');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.chats.get.path] });
    }
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, userId }: { chatId: number; userId: string }) => {
      const res = await fetch(`/api/chats/${chatId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to remove member');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.chats.get.path] });
    }
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: number) => {
      const res = await fetch(`/api/chats/${chatId}/leave`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to leave group');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    }
  });
}

// blocking hooks
export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const url = buildUrl(api.users.block.path, { userId });
      const res = await fetch(url, { method: api.users.block.method, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to block user');
      return res.json();
    },
    onSuccess: () => {
      // invalidate any relevant queries
      queryClient.invalidateQueries();
    }
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const url = buildUrl(api.users.unblock.path, { userId });
      const res = await fetch(url, { method: api.users.unblock.method, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to unblock user');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    }
  });
}

export function useBlockStatus(userId?: string | null) {
  return useQuery({
    queryKey: ['block-status', userId],
    queryFn: async () => {
      if (!userId) return { blocked: false, blockedBy: false };
      const url = buildUrl(api.users.blockStatus.path, { userId });
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to fetch block status');
      }
      return (await res.json()) as { blocked: boolean; blockedBy: boolean };
    },
    enabled: !!userId,
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: ['blocked-users'],
    queryFn: async () => {
      const res = await fetch(api.users.blockedList.path, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch blocked users');
      const data = await res.json();
      return api.users.blockedList.responses[200].parse(data);
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// PINNED MESSAGES HOOKS
// ═══════════════════════════════════════════════════════════════

export function usePinnedMessages(chatId: number | null) {
  return useQuery({
    queryKey: ['pinned-messages', chatId],
    queryFn: async () => {
      if (!chatId) return [];
      const res = await fetch(`/api/chats/${chatId}/pinned-messages`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch pinned messages');
      return await res.json();
    },
    enabled: !!chatId,
  });
}

export function usePinMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, messageId }: { chatId: number; messageId: number }) => {
      const res = await fetch(`/api/chats/${chatId}/messages/${messageId}/pin`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to pin message');
      }
      return await res.json();
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['pinned-messages', chatId] });
    },
  });
}

export function useUnpinMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatId, messageId }: { chatId: number; messageId: number }) => {
      const res = await fetch(`/api/chats/${chatId}/messages/${messageId}/pin`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to unpin message');
      }
      return await res.json();
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['pinned-messages', chatId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// GROUP INVITE LINKS HOOKS
// ═══════════════════════════════════════════════════════════════

export function useInviteLinks(chatId: number | null) {
  return useQuery({
    queryKey: ['invite-links', chatId],
    queryFn: async () => {
      if (!chatId) return [];
      const res = await fetch(`/api/chats/${chatId}/invite-links`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch invite links');
      return await res.json();
    },
    enabled: !!chatId,
  });
}

export function useCreateInviteLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ 
      chatId, 
      expiresAt, 
      maxUses 
    }: { 
      chatId: number; 
      expiresAt?: string; 
      maxUses?: number;
    }) => {
      const res = await fetch(`/api/chats/${chatId}/invite-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAt, maxUses }),
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create invite link');
      }
      return await res.json();
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['invite-links', chatId] });
    },
  });
}

export function useRevokeInviteLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(`/api/invite-links/${token}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to revoke invite link');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-links'] });
    },
  });
}

export function useJoinViaInviteLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(`/api/invite-links/${token}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to join group');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    },
  });
}

export function useInviteLinkInfo(token: string | null) {
  return useQuery({
    queryKey: ['invite-link-info', token],
    queryFn: async () => {
      if (!token) return null;
      const res = await fetch(`/api/invite-links/${token}/info`);
      if (!res.ok) return null;
      return await res.json();
    },
    enabled: !!token,
  });
}

// ═══════════════════════════════════════════════════════════════
// POLLS HOOKS
// ═══════════════════════════════════════════════════════════════

export function useCreatePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      chatId,
      question,
      options,
      allowMultipleAnswers,
      isAnonymous,
      closesAt,
    }: {
      chatId: number;
      question: string;
      options: string[];
      allowMultipleAnswers?: boolean;
      isAnonymous?: boolean;
      closesAt?: string;
    }) => {
      const res = await fetch(`/api/chats/${chatId}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          options,
          allowMultipleAnswers,
          isAnonymous,
          closesAt,
        }),
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create poll');
      }
      return await res.json();
    },
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });
}

export function useVotePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pollId,
      optionIds,
    }: {
      pollId: number;
      optionIds: number[];
    }) => {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds }),
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to vote');
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['poll', data.id] });
      queryClient.invalidateQueries({ queryKey: ['messages', data.chatId] });
    },
  });
}

export function useClosePoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pollId: number) => {
      const res = await fetch(`/api/polls/${pollId}/close`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to close poll');
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['poll', data.id] });
      queryClient.invalidateQueries({ queryKey: ['messages', data.chatId] });
    },
  });
}

export function usePoll(pollId: number | null) {
  return useQuery({
    queryKey: ['poll', pollId],
    queryFn: async () => {
      if (!pollId) return null;
      const res = await fetch(`/api/polls/${pollId}`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return await res.json();
    },
    enabled: !!pollId,
  });
}
