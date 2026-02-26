import { useState } from "react";
import { Link, useRoute } from "wouter";
import { format } from "date-fns";
import { Edit, LogOut, Settings, MoreVertical, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChats } from "@/hooks/use-chats";
import { useUserStatus } from "@/hooks/use-user-status";
import { 
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, 
  SidebarMenu, SidebarMenuItem, SidebarHeader,
  SidebarFooter, useSidebar
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProfileSettings } from "./profile-settings";
import { UserSearch } from "./user-search";
import { Skeleton } from "@/components/ui/skeleton";

/** Small green dot shown on an avatar when the user is online. */
function OnlineIndicator({ userId }: { userId: string | undefined }) {
  const status = useUserStatus(userId);
  if (!userId || status?.status !== 'online') return null;
  return (
    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-sidebar z-10" />
  );
}

export function ChatSidebar() {
  const { user, logout } = useAuth();
  const { data: chats, isLoading } = useChats();
  const { isMobile, setOpenMobile } = useSidebar();
  const [match, params] = useRoute("/chat/:id");
  const activeChatId = match ? parseInt(params.id) : null;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close mobile sidebar sheet when navigating to a chat
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  const getChatDisplayName = (chat: any) => {
    if (chat.isGroup) return chat.name;
    const otherMember = chat.members?.find((m: any) => m.userId !== user?.id);
    if (!otherMember) return "Saved Messages"; // Self chat
    const { firstName, lastName, email } = otherMember.user;
    return [firstName, lastName].filter(Boolean).join(" ") || email || "Unknown";
  };

  const getChatAvatar = (chat: any) => {
    if (chat.isGroup) return chat.avatarUrl;
    const otherMember = chat.members?.find((m: any) => m.userId !== user?.id);
    return otherMember?.user?.profileImageUrl;
  };

  return (
    <>
      <Sidebar className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className="h-16 px-4 flex flex-row items-center justify-between border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full shrink-0" onClick={() => setOpenMobile(false)}>
                <ArrowLeft className="w-5 h-5 text-sidebar-foreground/60" />
              </Button>
            )}
            <img 
              src="/favicon.svg" 
              alt="Ilissiot" 
              className="w-8 h-8 rounded-lg shadow-sm"
            />
            <span className="font-display font-bold text-lg tracking-tight text-sidebar-foreground">Ilissiot</span>
          </div>
          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-sidebar-accent" onClick={() => setSearchOpen(true)}>
            <Edit className="w-4 h-4 text-sidebar-foreground/60" />
          </Button>
        </SidebarHeader>

        <SidebarContent className="p-2 overflow-y-auto scrollbar-hide">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SidebarMenuItem key={i} className="mb-1">
                      <div className="flex items-center gap-3 p-2">
                        <Skeleton className="w-12 h-12 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                    </SidebarMenuItem>
                  ))
                ) : chats?.length === 0 ? (
                  <div className="text-center p-6 mt-10">
                    <div className="w-16 h-16 bg-sidebar-accent rounded-full flex items-center justify-center mx-auto mb-4">
                      <Edit className="w-8 h-8 text-sidebar-foreground/30" />
                    </div>
                    <p className="text-sidebar-foreground/70 text-sm font-medium">No chats yet</p>
                    <p className="text-xs text-sidebar-foreground/50 mt-1">Start a conversation!</p>
                  </div>
                ) : (
                  chats?.map(chat => {
                    const isActive = activeChatId === chat.id;
                    const displayName = getChatDisplayName(chat);
                    const avatarUrl = getChatAvatar(chat);
                    const initials = displayName.charAt(0).toUpperCase();
                    const lastMsg = chat.lastMessage;
                    const otherMember = !chat.isGroup
                      ? chat.members?.find((m: any) => m.userId !== user?.id)
                      : null;
                    
                    return (
                      <SidebarMenuItem key={chat.id} className="mb-1">
                        <Link 
                          href={`/chat/${chat.id}`}
                          onClick={closeMobileSidebar}
                          className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 ${
                            isActive 
                              ? 'bg-sidebar-accent dark:bg-sidebar-accent' 
                              : 'hover:bg-sidebar-accent/70'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <Avatar className="w-12 h-12 border border-black/5">
                              <AvatarImage src={avatarUrl || ""} />
                              <AvatarFallback className="text-sm font-medium bg-primary/10 text-primary">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <OnlineIndicator userId={otherMember?.userId} />
                          </div>
                          
                          <div className="flex-1 overflow-hidden">
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="font-semibold truncate text-[15px] text-sidebar-foreground">
                                {displayName}
                              </span>
                              {lastMsg && (
                                <span className="text-[11px] whitespace-nowrap ml-2 text-sidebar-foreground/50">
                                  {format(new Date(lastMsg.createdAt!), 'HH:mm')}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[13px] truncate text-sidebar-foreground/60">
                                {lastMsg ? (lastMsg.senderId === user?.id ? `You: ${lastMsg.content}` : lastMsg.content) : 'Started a chat'}
                              </span>
                              {chat.unreadCount ? (
                                <span className={`min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold ml-2 ${'bg-primary text-primary-foreground'}`}>
                                  {chat.unreadCount}
                                </span>
                                ) : null}
                              </div>
                            </div>
                          </Link>
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full flex justify-between items-center px-2 py-6 rounded-xl hover:bg-sidebar-accent">
                <div className="flex items-center gap-3">
                  <Avatar className="w-9 h-9 border border-border">
                    <AvatarImage src={user?.profileImageUrl || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {user?.firstName?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left overflow-hidden">
                    <p className="text-sm font-medium truncate leading-tight text-sidebar-foreground">{user?.firstName || 'User'}</p>
                    <p className="text-xs text-sidebar-foreground/50 truncate">My Profile</p>
                  </div>
                </div>
                <MoreVertical className="w-4 h-4 text-sidebar-foreground/50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl border-border/50">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.email}</p>
                  <p className="text-xs text-muted-foreground leading-none">Local Account</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="rounded-lg cursor-pointer py-2">
                <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Profile Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="text-destructive rounded-lg cursor-pointer py-2">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <ProfileSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <UserSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
