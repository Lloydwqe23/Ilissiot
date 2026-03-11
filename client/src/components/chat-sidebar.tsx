import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { format, isToday, isYesterday } from "date-fns";
import { Edit, LogOut, Settings, MoreVertical, ArrowLeft, Image, Mic, Video, Phone, FileText, Sticker, Pin, PinOff, LogOut as LeaveIcon, Users, BellOff, Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { stripFormatting } from "@/lib/format-message";
import { useChatMuted, setChatMute, muteFor } from "@/lib/chat-mute";
import { useChats, useDeleteChat, useBlockUser, useUnblockUser, useBlockStatus, usePinChat, useUnpinChat, useLeaveGroup } from "@/hooks/use-chats";
import { useUserStatus } from "@/hooks/use-user-status";
import { 
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, 
  SidebarMenu, SidebarMenuItem, SidebarHeader,
  SidebarFooter, useSidebar
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from "@/components/ui/context-menu";
import { ProfileSettings } from "./profile-settings";
import { UserSearch } from "./user-search";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveLanguage, translate } from "@/lib/i18n";

/** Small green dot shown on an avatar when the user is online. */
function OnlineIndicator({ userId }: { userId: string | undefined }) {
  const status = useUserStatus(userId);
  if (!userId || status?.status !== 'online') return null;
  return (
    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-sidebar z-10" />
  );
}

/** Format last message timestamp: HH:mm if today, "Yesterday" if yesterday, or date if older */
function formatLastMessageTime(createdAt: string | Date): string {
  const date = new Date(createdAt);
  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  return format(date, 'MMM d');
}

// component representing a single chat row with actions
function ChatSidebarItem({
  chat,
  isActive,
  closeMobileSidebar,
  t,
}: {
  chat: any;
  isActive: boolean;
  closeMobileSidebar: () => void;
  t: (key: string) => string;
}) {
  const { user } = useAuth();
  const otherMember = !chat.isGroup
    ? chat.members?.find((m: any) => m.userId !== user?.id)
    : null;
  const otherUserId = otherMember?.userId || null;
  const displayName = (() => {
    if (chat.isGroup) return chat.name;
    if (!otherMember) return t("chat.savedMessages");
    const { firstName, lastName, email } = otherMember.user;
    return [firstName, lastName].filter(Boolean).join(" ") || email || "Unknown";
  })();
  const avatarUrl = chat.isGroup ? chat.avatarUrl : otherMember?.user?.profileImageUrl;
  const initials = displayName.charAt(0).toUpperCase();

  const lastMsg = chat.lastMessage;

  const deleteChatMutation = useDeleteChat();
  const blockStatus = useBlockStatus(otherUserId);
  const blockMutation = useBlockUser();
  const unblockMutation = useUnblockUser();
  const pinMutation = usePinChat();
  const unpinMutation = useUnpinChat();
  const leaveGroupMutation = useLeaveGroup();
  const [, navigate] = useLocation();
  const chatMuted = useChatMuted(chat.id);

  // Check if this chat is pinned by the current user
  const myMembership = chat.members?.find((m: any) => m.userId === user?.id);
  const isPinned = !!myMembership?.pinnedAt;

  return (
    <SidebarMenuItem key={chat.id} className="mb-1 relative group">
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <Link
        href={`/chat/${chat.id}`}
        onClick={closeMobileSidebar}
        className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 ${
          isActive 
            ? 'bg-sidebar-accent dark:bg-sidebar-accent/60' 
            : 'hover:bg-sidebar-accent/70 dark:hover:bg-sidebar-accent/30'
        }`}
      >
        <div className="relative shrink-0">
          <Avatar className="w-12 h-12 border border-black/5">
            <AvatarImage src={avatarUrl || ""} />
            <AvatarFallback className="text-sm font-medium bg-primary/10 text-primary">
              {chat.isGroup ? <Users className="w-5 h-5" /> : initials}
            </AvatarFallback>
          </Avatar>
          <OnlineIndicator userId={otherUserId} />
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-semibold truncate text-[15px] text-sidebar-foreground group-hover:text-sidebar-foreground flex items-center gap-1">
              {displayName}
              {chatMuted && <BellOff className="w-3 h-3 text-muted-foreground shrink-0" />}
            </span>
            {lastMsg && (
              <span className="text-[11px] whitespace-nowrap ml-2 text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80 flex items-center gap-1">
                {isPinned && <Pin className="w-3 h-3 text-primary/60" />}
                {formatLastMessageTime(lastMsg.createdAt!)}
              </span>
            )}
            {!lastMsg && isPinned && (
              <span className="ml-2"><Pin className="w-3 h-3 text-primary/60" /></span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[13px] truncate text-sidebar-foreground/60 group-hover:text-sidebar-foreground/80 flex items-center gap-1">
              {lastMsg ? (() => {
                const prefix = lastMsg.senderId === user?.id ? t("chat.youPrefix") : '';
                const attachments: any[] = (lastMsg.attachments || []).filter((a: any) => a.type !== 'reply' && a.type !== 'forward');
                const hasForward = (lastMsg.attachments || []).some((a: any) => a.type === 'forward');
                const forwardPrefix = hasForward ? '↗ ' : '';
                if (lastMsg.content && lastMsg.content.trim()) {
                  return `${prefix}${forwardPrefix}${stripFormatting(lastMsg.content)}`;
                }
                if (attachments.length > 0) {
                  const first = attachments[0];
                  if (first.type === 'sticker') {
                    return <>{prefix}{forwardPrefix}<Sticker className="w-3.5 h-3.5 inline" /> {t("chat.attachment.sticker")}</>;
                  }
                  if (first.type?.startsWith('call/')) {
                    return <>{prefix}<Phone className="w-3.5 h-3.5 inline" /> {t("chat.attachment.call")}</>;
                  }
                  if (first.type?.startsWith('image/')) {
                    return <>{prefix}{forwardPrefix}<Image className="w-3.5 h-3.5 inline" /> {t("chat.attachment.photo")}</>;
                  }
                  if (first.type?.startsWith('video/')) {
                    return <>{prefix}{forwardPrefix}<Video className="w-3.5 h-3.5 inline" /> {t("chat.attachment.video")}</>;
                  }
                  if (first.type?.startsWith('audio/')) {
                    return <>{prefix}{forwardPrefix}<Mic className="w-3.5 h-3.5 inline" /> {t("chat.attachment.audio")}</>;
                  }
                  return <>{prefix}{forwardPrefix}<FileText className="w-3.5 h-3.5 inline" /> {first.name || t("chat.attachment.file")}</>;
                }
                return `${prefix}${forwardPrefix}${t("chat.attachment.message")}`;
              })() : t("chat.startedAChat")}
            </span>
            {chat.unreadCount ? (
              <span className={`min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold ml-2 ${'bg-primary text-primary-foreground'}`}>
                {chat.unreadCount}
              </span>
              ) : null}
            </div>
          </div>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{t("chat.context.chat")}</ContextMenuLabel>
        {isPinned ? (
          <ContextMenuItem
            onClick={() => unpinMutation.mutate(chat.id)}
          >
            <PinOff className="w-4 h-4 mr-2" />
            {t("chat.context.unpin")}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onClick={() => pinMutation.mutate(chat.id)}
          >
            <Pin className="w-4 h-4 mr-2" />
            {t("chat.context.pin")}
          </ContextMenuItem>
        )}
        {chatMuted ? (
          <ContextMenuItem onClick={() => setChatMute(chat.id, null)}>
            <Bell className="w-4 h-4 mr-2" />
            {t("chat.context.unmute")}
          </ContextMenuItem>
        ) : (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <BellOff className="w-4 h-4 mr-2" />
              {t("chat.context.mute")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={() => setChatMute(chat.id, muteFor(1))}>{t("chat.context.muteHour")}</ContextMenuItem>
              <ContextMenuItem onClick={() => setChatMute(chat.id, muteFor(8))}>{t("chat.context.mute8Hours")}</ContextMenuItem>
              <ContextMenuItem onClick={() => setChatMute(chat.id, muteFor(24))}>{t("chat.context.muteDay")}</ContextMenuItem>
              <ContextMenuItem onClick={() => setChatMute(chat.id, muteFor(24 * 7))}>{t("chat.context.muteWeek")}</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => setChatMute(chat.id, "forever")}>{t("chat.context.muteForever")}</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            if (confirm(t('chat.confirm.deleteChat'))) {
              deleteChatMutation.mutate(chat.id, {
                onSuccess: () => {
                  if (isActive) navigate('/');
                }
              });
            }
          }}
          className="text-destructive"
        >
          {t("chat.context.delete")}
        </ContextMenuItem>
        {otherUserId && (
          <>
            <ContextMenuSeparator />
            {blockStatus.data?.blocked ? (
              <ContextMenuItem
                onClick={() => unblockMutation.mutate(otherUserId)}
              >
                {t("chat.context.unblockUser")}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem
                onClick={() => blockMutation.mutate(otherUserId)}
                className="text-destructive"
              >
                {t("chat.context.blockUser")}
              </ContextMenuItem>
            )}
          </>
        )}
        {chat.isGroup && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => {
                if (confirm(t('chat.confirm.leaveGroup'))) {
                  leaveGroupMutation.mutate(chat.id, {
                    onSuccess: () => {
                      if (isActive) navigate('/');
                    }
                  });
                }
              }}
              className="text-destructive"
            >
              {t("chat.context.leaveGroup")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  );
}

export function ChatSidebar() {
  const { user, logout } = useAuth();
  const language = resolveLanguage(user?.language);
  const t = (key: string) => translate(language, key);
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
              src="/favicon.png" 
              alt="Ilissiot" 
              className="w-8 h-8 rounded-lg shadow-sm"
            />
            <span className="font-display font-bold text-lg tracking-tight text-sidebar-foreground">Ilissiot</span>
          </div>
          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-sidebar-accent dark:hover:bg-sidebar-accent/30" onClick={() => setSearchOpen(true)}>
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
                    <p className="text-sidebar-foreground/70 text-sm font-medium">{t("chat.noChats")}</p>
                    <p className="text-xs text-sidebar-foreground/50 mt-1">{t("chat.startConversation")}</p>
                  </div>
                ) : (
                  chats?.map(chat => {
                    const isActive = activeChatId === chat.id;
                    return (
                      <ChatSidebarItem
                        key={chat.id}
                        chat={chat}
                        isActive={isActive}
                        closeMobileSidebar={closeMobileSidebar}
                        t={t}
                      />
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
              <Button variant="ghost" className="w-full flex justify-between items-center px-2 py-6 rounded-xl hover:bg-sidebar-accent dark:hover:bg-sidebar-accent/30">
                <div className="flex items-center gap-3">
                  <Avatar className="w-9 h-9 border border-border">
                    <AvatarImage src={user?.profileImageUrl || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {user?.firstName?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left overflow-hidden">
                    <p className="text-sm font-medium truncate leading-tight text-sidebar-foreground">{user?.firstName || 'User'}</p>
                    <p className="text-xs text-sidebar-foreground/50 truncate">{t("sidebar.myProfile")}</p>
                  </div>
                </div>
                <MoreVertical className="w-4 h-4 text-sidebar-foreground/50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl border-border/50">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.email}</p>
                  <p className="text-xs text-muted-foreground leading-none">{t("sidebar.account")}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="rounded-lg cursor-pointer py-2">
                <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{t("sidebar.profileSettings")}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="text-destructive rounded-lg cursor-pointer py-2">
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t("sidebar.logOut")}</span>
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
