import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type MessageResponse } from "@shared/routes";

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
