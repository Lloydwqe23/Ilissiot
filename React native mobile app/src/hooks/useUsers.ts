import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api';
import type { User } from '../types';

export function useSearchUsers(query: string) {
  return useQuery<User[]>({
    queryKey: ['/api/users/search', query],
    queryFn: () => apiRequest<User[]>(`/api/users/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User>) =>
      apiRequest<User>('/api/users/profile', { method: 'PATCH', body: data }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['/api/me'], updatedUser);
    },
  });
}
