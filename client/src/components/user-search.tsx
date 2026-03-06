import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useSearchUsers } from "@/hooks/use-users";
import { useCreateDirectChat, useCreateGroupChat } from "@/hooks/use-chats";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, UserPlus, MessageSquarePlus, Users, X, Check, ArrowLeft, ArrowRight } from "lucide-react";
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
  const createGroup = useCreateGroupChat();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Group creation state
  const [mode, setMode] = useState<'direct' | 'group-select' | 'group-name'>('direct');
  const [selectedUsers, setSelectedUsers] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
  const [groupName, setGroupName] = useState("");

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setMode('direct');
      setSelectedUsers([]);
      setGroupName("");
    }
  }, [open]);

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

  const toggleUserSelection = (user: any) => {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown";
    setSelectedUsers(prev => {
      const exists = prev.find(u => u.id === user.id);
      if (exists) return prev.filter(u => u.id !== user.id);
      return [...prev, { id: user.id, name, avatar: user.profileImageUrl }];
    });
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    createGroup.mutate(
      { name: groupName.trim(), memberIds: selectedUsers.map(u => u.id) },
      {
        onSuccess: (chat) => {
          onOpenChange(false);
          setLocation(`/chat/${chat.id}`);
        },
        onError: (err) => {
          toast({ title: "Couldn't create group", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  // Group name step
  if (mode === 'group-name') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl" aria-describedby={undefined}>
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-xl font-display flex items-center gap-2">
              <button onClick={() => setMode('group-select')} className="hover:bg-muted rounded-full p-1 -ml-1 transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              New Group
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 pb-4">
            <Input
              autoFocus
              placeholder="Group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && groupName.trim()) handleCreateGroup(); }}
              className="rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all h-11"
            />
          </div>

          <div className="px-6 pb-2">
            <p className="text-xs text-muted-foreground mb-2">{selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} selected</p>
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map(u => (
                <div key={u.id} className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm">
                  <span className="truncate max-w-[120px]">{u.name}</span>
                  <button onClick={() => setSelectedUsers(prev => prev.filter(p => p.id !== u.id))} className="hover:bg-primary/20 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 pt-4">
            <Button
              className="w-full rounded-xl h-11"
              disabled={!groupName.trim() || selectedUsers.length === 0 || createGroup.isPending}
              onClick={handleCreateGroup}
            >
              {createGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
              Create Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl" aria-describedby={undefined}>
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            {mode === 'group-select' ? (
              <>
                <button onClick={() => { setMode('direct'); setSelectedUsers([]); }} className="hover:bg-muted rounded-full p-1 -ml-1 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                Add Members
              </>
            ) : (
              <>
                <MessageSquarePlus className="w-5 h-5 text-primary" />
                Start New Chat
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Group creation button (only in direct mode) */}
        {mode === 'direct' && (
          <div className="px-6 pb-2">
            <button
              onClick={() => setMode('group-select')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/80 active:bg-muted transition-colors text-left group border border-dashed border-border"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium group-hover:text-primary transition-colors">New Group</p>
                <p className="text-xs text-muted-foreground">Create a group chat</p>
              </div>
            </button>
          </div>
        )}

        {/* Selected users chips (group mode) */}
        {mode === 'group-select' && selectedUsers.length > 0 && (
          <div className="px-6 pb-2 flex flex-wrap gap-1.5">
            {selectedUsers.map(u => (
              <div key={u.id} className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-medium">
                <span className="truncate max-w-[80px]">{u.name}</span>
                <button onClick={() => setSelectedUsers(prev => prev.filter(p => p.id !== u.id))} className="hover:bg-primary/20 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              autoFocus
              placeholder="Search by username..." 
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
                const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown User";
                const initials = (u.firstName?.[0] || "U").toUpperCase();
                const isSelected = selectedUsers.some(s => s.id === u.id);
                
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      if (mode === 'group-select') {
                        toggleUserSelection(u);
                      } else {
                        handleStartChat(u.id);
                      }
                    }}
                    disabled={mode === 'direct' && createChat.isPending}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/80 active:bg-muted transition-colors text-left group ${
                      isSelected ? 'bg-primary/5 ring-1 ring-primary/20' : ''
                    }`}
                  >
                    <div className="relative">
                      <Avatar className="w-10 h-10 border border-border/50">
                        <AvatarImage src={u.profileImageUrl || ""} />
                        <AvatarFallback className="bg-primary/5 text-primary text-xs font-medium">{initials}</AvatarFallback>
                      </Avatar>
                      {mode === 'group-select' && isSelected && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-background">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-medium truncate group-hover:text-primary transition-colors">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">@{u.username || 'unknown'}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Next button for group mode */}
        {mode === 'group-select' && selectedUsers.length > 0 && (
          <div className="p-4 pt-0">
            <Button
              className="w-full rounded-xl h-11"
              onClick={() => setMode('group-name')}
            >
              <span>Next ({selectedUsers.length} selected)</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
