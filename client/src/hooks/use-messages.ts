import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type MessageResponse } from "@shared/routes";
import { useAuth } from "./use-auth";

export function useMessages(chatId: number | null) {
  return useQuery({
    queryKey: [api.messages.list.path, chatId?.toString()],
    queryFn: async () => {
      if (!chatId) return [];
      const url = buildUrl(api.messages.list.path, { chatId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      return api.messages.list.responses[200].parse(data);
    },
    enabled: !!chatId,
    staleTime: 1000 * 30, // 30 seconds - prevents background refetch from overwriting optimistic updates
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ chatId, content, attachments }: { chatId: number; content: string; attachments?: Array<{name: string; url: string; type: string}> }) => {
      const url = buildUrl(api.messages.send.path, { chatId });
      const res = await fetch(url, {
        method: api.messages.send.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, attachments }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send message");
      return api.messages.send.responses[201].parse(await res.json());
    },
    onSuccess: (newMessage) => {
      const messagesQueryKey = [api.messages.list.path, newMessage.chatId.toString()];
      queryClient.setQueryData<MessageResponse[]>(messagesQueryKey, (old) => {
        if (!old) return [newMessage];
        if (old.some(m => m.id === newMessage.id)) return old;
        return [...old, newMessage];
      });
      // Invalidate chat list so last message preview updates
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    },
  });
}

export type MessageDeleteItem = { id: number; forAll: boolean };

export function useDeleteMessages(chatId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: MessageDeleteItem[]) => {
      const res = await fetch('/api/messages/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete messages');
      return await res.json();
    },
    onSuccess: () => {
      // Invalidate messages list to refetch
      queryClient.invalidateQueries({ queryKey: [api.messages.list.path, chatId.toString()] });
      // Also invalidate chats list (last message may have changed)
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
      // Remove deleted messages from pinned list
      queryClient.invalidateQueries({ queryKey: ['pinned-messages', chatId] });
    },
  });
}

export function useMarkMessagesRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: number) => {
      const url = buildUrl(api.messages.markRead.path, { chatId });
      const res = await fetch(url, {
        method: api.messages.markRead.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark messages as read");
      return await res.json();
    },
    onSuccess: (_, chatId) => {
      queryClient.invalidateQueries({ queryKey: [api.chats.list.path] });
    }
  });
}

export function useSearchMessages(chatId: number | null, searchQuery: string, limit: number = 50) {
  return useQuery({
    queryKey: ['messages.search', chatId?.toString(), searchQuery],
    queryFn: async () => {
      if (!chatId || !searchQuery.trim()) return [];
      const url = buildUrl(api.messages.search.path, { chatId });
      const params = new URLSearchParams({
        q: searchQuery,
        limit: limit.toString(),
      });
      const res = await fetch(`${url}?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search messages");
      const data = await res.json();
      return api.messages.search.responses[200].parse(data);
    },
    enabled: !!chatId && !!searchQuery.trim(),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useEditMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: number; content: string }) => {
      const url = buildUrl(api.messages.edit.path, { messageId });
      const res = await fetch(url, {
        method: api.messages.edit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to edit message");
      }
      return api.messages.edit.responses[200].parse(await res.json());
    },
    onSuccess: (updatedMessage) => {
      // Update the message in the cache
      const messagesQueryKey = [api.messages.list.path, updatedMessage.chatId.toString()];
      queryClient.setQueryData<MessageResponse[]>(messagesQueryKey, (old) => {
        if (!old) return old;
        return old.map(msg => msg.id === updatedMessage.id ? updatedMessage : msg);
      });
    },
  });
}
export function useAddReaction(chatId: number) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      const url = buildUrl(api.messages.addReaction.path, { messageId });
      const res = await fetch(url, {
        method: api.messages.addReaction.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add reaction");
      }
      return api.messages.addReaction.responses[201].parse(await res.json());
    },
    onMutate: async ({ messageId, emoji }) => {
      // Cancel any outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ 
        queryKey: [api.messages.list.path, chatId.toString()] 
      });

      // Optimistic update: remove all user's reactions and add the new one
      const messagesKey = [api.messages.list.path, chatId.toString()];
      const previousData = queryClient.getQueryData<MessageResponse[]>(messagesKey);
      
      if (previousData && user) {
        queryClient.setQueryData<MessageResponse[]>(messagesKey, (old) => {
          if (!old) return old;
          return old.map(msg => {
            if (msg.id === messageId) {
              // Remove all user's reactions (enforce one reaction per user)
              let reactions = (msg.reactions || []).filter(r => r.userId !== user.id);
              reactions = [
                ...reactions,
                {
                  id: -1, // temporary ID
                  messageId,
                  userId: user.id,
                  emoji,
                  createdAt: new Date(),
                  user: user,
                }
              ];
              return { ...msg, reactions };
            }
            return msg;
          });
        });
      }
      
      return { previousData, messageId, userId: user?.id };
    },
    onSuccess: async () => {
      // Force refetch to get latest reactions from server (bypasses staleTime)
      await queryClient.refetchQueries({ 
        queryKey: [api.messages.list.path, chatId.toString()],
        type: 'active'
      });
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        const messagesKey = [api.messages.list.path, chatId.toString()];
        queryClient.setQueryData(messagesKey, context.previousData);
      }
    },
  });
}

export function useRemoveReaction(chatId: number) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      const url = buildUrl(api.messages.removeReaction.path, { messageId, emoji: encodeURIComponent(emoji) });
      const res = await fetch(url, {
        method: api.messages.removeReaction.method,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to remove reaction");
      }
      return await res.json();
    },
    onMutate: async ({ messageId, emoji }) => {
      // Cancel outgoing requests
      await queryClient.cancelQueries({ 
        queryKey: [api.messages.list.path, chatId.toString()] 
      });

      const messagesKey = [api.messages.list.path, chatId.toString()];
      const previousData = queryClient.getQueryData<MessageResponse[]>(messagesKey);
      
      // Optimistic update - only remove current user's reaction with this emoji
      queryClient.setQueryData<MessageResponse[]>(messagesKey, (old) => {
        if (!old) return old;
        return old.map(msg => {
          if (msg.id === messageId) {
            const reactions = (msg.reactions || []).filter(
              r => !(r.emoji === emoji && r.userId === user?.id)
            );
            return { ...msg, reactions };
          }
          return msg;
        });
      });
      
      return { previousData, messageId };
    },
    onSuccess: async () => {
      // Force refetch to get latest reactions from server (bypasses staleTime)
      await queryClient.refetchQueries({ 
        queryKey: [api.messages.list.path, chatId.toString()],
        type: 'active'
      });
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        const messagesKey = [api.messages.list.path, chatId.toString()];
        queryClient.setQueryData(messagesKey, context.previousData);
      }
    },
  });
}