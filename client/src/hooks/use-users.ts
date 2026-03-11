import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type UserResponse } from "@shared/routes";

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: [api.users.search.path, query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const url = new URL(api.users.search.path, window.location.origin);
      url.searchParams.set("q", query);
      
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search users");
      const data = await res.json();
      return api.users.search.responses[200].parse(data);
    },
    enabled: query.trim().length > 0,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { username?: string; firstName?: string; lastName?: string; bio?: string | null; birthday?: string | null; profileImageUrl?: string | null; theme?: string; language?: 'en' | 'uk' | 'es' | 'de'; colorTheme?: string; fontType?: string; textSize?: string }) => {
      const res = await fetch(api.users.updateProfile.path, {
        method: api.users.updateProfile.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to update profile" }));
        throw new Error(errorData.message || "Failed to update profile");
      }
      return api.users.updateProfile.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/me"], data);
    }
  });
}
