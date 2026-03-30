import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, clearSessionCookie } from '../api';
import { unregisterDevicePushToken } from '../lib/notifications';
import type { User } from '../types';

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ['/api/me'],
    queryFn: async () => {
      try {
        return await apiRequest<User>('/api/me');
      } catch (error: any) {
        if (error.status === 401 || error.status === 0) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      return apiRequest<User>('/api/login', { method: 'POST', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/me'] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      username: string;
      password: string;
      firstName?: string | null;
      lastName?: string | null;
    }) => {
      return apiRequest<User>('/api/register', { method: 'POST', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/me'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await unregisterDevicePushToken();
      await apiRequest('/api/logout', { method: 'POST' });
      await clearSessionCookie();
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/me'], null);
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  };
}
