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
