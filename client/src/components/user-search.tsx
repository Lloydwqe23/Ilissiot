import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSearchUsers } from "@/hooks/use-users";
import { useCreateDirectChat } from "@/hooks/use-chats";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, UserPlus, MessageSquarePlus } from "lucide-react";
import { useLocation } from "wouter";

// Reusable debounce hook
function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function UserSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounceValue(query, 300);
  const { data: users, isLoading } = useSearchUsers(debouncedQuery);
  const createChat = useCreateDirectChat();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleStartChat = (userId: string) => {
    createChat.mutate(userId, {
      onSuccess: (chat) => {
        onOpenChange(false);
        setLocation(`/chat/${chat.id}`);
      },
      onError: (err) => {
        toast({ title: "Couldn't start chat", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
            Start New Chat
          </DialogTitle>
        </DialogHeader>
        
        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              autoFocus
              placeholder="Search by name or email..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all h-11"
            />
          </div>
        </div>

        <div className="h-[300px] overflow-y-auto px-2 pb-2 scrollbar-hide">
          {isLoading && query.length > 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm">Searching users...</p>
            </div>
          ) : query.length > 0 && users?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p>No users found matching "{query}"</p>
            </div>
          ) : !query ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-4">
              <UserPlus className="w-12 h-12 opacity-20" />
              <p className="text-sm">Type a name to search</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {users?.map(u => {
                const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown User";
                const initials = (u.firstName?.[0] || u.email?.[0] || "U").toUpperCase();
                
                return (
                  <button
                    key={u.id}
                    onClick={() => handleStartChat(u.id)}
                    disabled={createChat.isPending}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/80 active:bg-muted transition-colors text-left group"
                  >
                    <Avatar className="w-10 h-10 border border-border/50">
                      <AvatarImage src={u.profileImageUrl || ""} />
                      <AvatarFallback className="bg-primary/5 text-primary text-xs font-medium">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-medium truncate group-hover:text-primary transition-colors">{name}</p>
                      {u.bio && <p className="text-xs text-muted-foreground truncate">{u.bio}</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
