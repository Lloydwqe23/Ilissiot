import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api';
import type { Message } from '../types';

export function useMessages(chatId: number | null) {
  return useQuery<Message[]>({
    queryKey: ['/api/chats', chatId, 'messages'],
    queryFn: () => apiRequest<Message[]>(`/api/chats/${chatId}/messages`),
    enabled: !!chatId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, content, attachments }: {
      chatId: number;
      content?: string;
      attachments?: { name: string; url: string; type: string }[];
    }) =>
      apiRequest<Message>(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body: { chatId, content, attachments },
      }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
  });
}

export function useMarkMessagesRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) =>
      apiRequest(`/api/chats/${chatId}/read`, { method: 'POST' }),
    onSuccess: (_, chatId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
  });
}

export function useEditMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: number; content: string; chatId: number }) =>
      apiRequest(`/api/messages/${messageId}`, { method: 'PUT', body: { content } }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
    },
  });
}

export function useDeleteMessages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageIds, forAll, chatId }: { messageIds: number[]; forAll?: boolean; chatId: number }) => {
      if (messageIds.length === 1) {
        return apiRequest(`/api/messages/${messageIds[0]}/delete`, {
          method: 'POST',
          body: { forAll },
        });
      }
      return apiRequest('/api/messages/batch-delete', {
        method: 'POST',
        body: { messageIds, forAll },
      });
    },
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
  });
}

export function useSearchMessages(chatId: number | null, query: string) {
  return useQuery<Message[]>({
    queryKey: ['/api/chats', chatId, 'messages', 'search', query],
    queryFn: () =>
      apiRequest<Message[]>(`/api/chats/${chatId}/messages/search?q=${encodeURIComponent(query)}`),
    enabled: !!chatId && query.length > 0,
  });
}

export function useAddReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, emoji, chatId }: { messageId: number; emoji: string; chatId: number }) =>
      apiRequest(`/api/messages/${messageId}/reactions`, { method: 'POST', body: { emoji } }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
    },
  });
}

export function useRemoveReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, emoji, chatId }: { messageId: number; emoji: string; chatId: number }) =>
      apiRequest(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
    },
  });
}

export function useClearChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, forAll }: { chatId: number; forAll?: boolean }) =>
      apiRequest(`/api/chats/${chatId}/${forAll ? 'clear-for-all' : 'clear-for-me'}`, { method: 'POST' }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats', v.chatId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
  });
}
