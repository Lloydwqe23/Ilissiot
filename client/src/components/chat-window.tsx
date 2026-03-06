import { useEffect, useRef, useState, ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, MoreVertical, Loader2, Paperclip, X, Trash2, CheckCircle2, Smile, Phone, Video, Mic, StopCircle, Ban, Search, Pencil, Check, Play, Pause, Download, Reply, Share2, FileText, FileSpreadsheet, FileType, File as FileIcon, Presentation, FileArchive, FileCode, Users, UserPlus, UserMinus, Crown, Maximize, ScreenShare, Pin, BarChart3, Link2, Paintbrush, Shield, CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChat, useChats, useBlockStatus, useBlockUser, useUnblockUser, useLeaveGroup, useAddGroupMembers, useRemoveGroupMember, useUpdateGroupChat, usePinMessage, useUnpinMessage } from "@/hooks/use-chats";
import { useMessages, useSendMessage, useMarkMessagesRead, useDeleteMessages, useEditMessage, useAddReaction, useRemoveReaction } from "@/hooks/use-messages";
import { useUserStatus, formatLastSeen } from "@/hooks/use-user-status";
import { useTypingUsers, useSendTyping } from "@/hooks/use-typing";
import { useCall } from "@/hooks/use-call";
import { useSearchUsers } from "@/hooks/use-users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UserProfileModal } from "@/components/user-profile-modal";
import { PinnedMessagesButton } from "@/components/pinned-messages-button";
import { CreatePollDialog } from "@/components/create-poll-dialog";
import { GroupInviteLinksDialog } from "@/components/group-invite-links-dialog";
import { PollMessage } from "@/components/poll-message";
import { BackgroundPicker } from "@/components/background-picker";
import { MemberSettingsDialog } from "@/components/member-settings-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getChatBackground, setChatBackground, findBackground, getCustomBackgroundUrl, setCustomBackgroundUrl, removeCustomBackground, buildCustomBackgroundStyle } from "@/lib/chat-backgrounds";
import { formatMessageContent } from "@/lib/format-message";
import { useLocation } from "wouter";

/** Audio message component with custom waveform player */
function VideoMessage({ url, name, isMine }: { url: string; name: string; isMine: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Ensure URL is properly encoded for non-ASCII filenames
  const videoUrl = (() => {
    if (url.startsWith('/uploads/')) {
      const filename = url.slice('/uploads/'.length);
      if (/%[0-9A-Fa-f]{2}/.test(filename)) return url;
      return '/uploads/' + encodeURIComponent(decodeURIComponent(filename));
    }
    return url;
  })();

  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setProgress(video.duration ? (video.currentTime / video.duration) * 100 : 0);
    };
    const onLoaded = () => setDuration(video.duration);
    const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement = document.fullscreenElement;
      setFullscreen(!!fsElement && (fsElement === containerRef.current || fsElement === videoRef.current));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) { video.pause(); setPlaying(false); }
    else {
      video.play().then(() => {
        setPlaying(true);
      }).catch((err) => {
        console.error('Video play failed:', err);
        setPlaying(false);
      });
    }
  };

  const changeSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const next = SPEEDS[(SPEEDS.indexOf(playbackRate) + 1) % SPEEDS.length];
    setPlaybackRate(next);
    video.playbackRate = next;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = progressRef.current;
    if (!video || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
  };

  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const target = videoRef.current || containerRef.current;
    if (!target) return;

    try {
      if (!document.fullscreenElement) {
        await target.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // noop
    }
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const isActive = playbackRate !== 1;

  return (
    <div ref={containerRef} className="mt-2 rounded-lg overflow-hidden max-w-sm w-full">
      {/* Video Player Container */}
      <div className="relative bg-black/20 rounded-lg overflow-hidden group">
        <video
          ref={videoRef}
          src={videoUrl}
          preload="metadata"
          className={`w-full block object-contain ${fullscreen ? 'h-screen max-h-screen bg-black' : 'max-h-96'}`}
        />

        {/* Play/Pause Overlay */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 hover:bg-black/35"
        >
          {playing
            ? <Pause className="w-12 h-12 fill-white text-white" />
            : <Play className="w-12 h-12 fill-white text-white translate-x-1" />
          }
        </button>

        {/* Controls Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Progress Bar */}
          <div
            ref={progressRef}
            onClick={handleSeek}
            className="w-full h-1 bg-white/30 rounded-full cursor-pointer mb-2 group/progress hover:h-1.5"
          >
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Bottom Controls */}
          <div className="flex items-center justify-between text-white text-xs">
            <span className="font-medium tabular-nums">
              {playing || currentTime > 0 ? fmt(currentTime) : fmt(duration)}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={changeSpeed}
                className={`px-1.5 py-0.5 rounded font-bold tabular-nums transition-all active:scale-95
                  ${isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-white/70 hover:text-white hover:bg-white/20"
                  }`}
                title="Playback speed"
              >
                {playbackRate}×
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-1 text-white/70 hover:text-white hover:bg-white/20 rounded transition-all active:scale-95"
                title="Fullscreen"
              >
                <Maximize className="w-4 h-4" />
              </button>

              <a
                href={videoUrl}
                download={name}
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-white/70 hover:text-white hover:bg-white/20 rounded transition-all"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AudioMessage({ url, name, isMine }: { url: string; name: string; isMine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const progressRef = useRef<HTMLDivElement>(null);

  // Ensure URL is properly encoded for non-ASCII filenames
  const audioUrl = (() => {
    if (url.startsWith('/uploads/')) {
      const filename = url.slice('/uploads/'.length);
      // If already encoded (contains %), leave it; otherwise encode
      if (/%[0-9A-Fa-f]{2}/.test(filename)) return url;
      return '/uploads/' + encodeURIComponent(decodeURIComponent(filename));
    }
    return url;
  })();

  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else {
      audio.play().then(() => {
        setPlaying(true);
      }).catch((err) => {
        console.error('Audio play failed:', err);
        setPlaying(false);
      });
    }
  };

  const changeSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const next = SPEEDS[(SPEEDS.indexOf(playbackRate) + 1) % SPEEDS.length];
    setPlaybackRate(next);
    audio.playbackRate = next;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const bars = [3,5,8,4,9,6,10,7,5,8,4,6,9,3,7,10,5,8,4,6,9,7,5,3,8,6,10,4,7,5,9,6];
  const isActive = playbackRate !== 1;

  return (
    <div className={`flex items-center gap-3 mt-2 px-3 py-2.5 rounded-2xl max-w-[260px] w-full
      ${isMine
        ? "bg-white/15 text-primary-foreground"
        : "bg-primary/8 dark:bg-white/8 text-foreground border border-border/40"
      }`}
    >
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95
          ${isMine
            ? "bg-white/25 hover:bg-white/35 text-primary-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          }`}
      >
        {playing
          ? <Pause className="w-4 h-4 fill-current" />
          : <Play className="w-4 h-4 fill-current translate-x-0.5" />
        }
      </button>

      {/* Waveform + bottom row */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Waveform */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="flex items-center gap-[2px] h-8 cursor-pointer group"
        >
          {bars.map((h, i) => {
            const isPlayed = (i / bars.length) * 100 <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-colors flex-shrink-0 ${
                  isPlayed
                    ? isMine ? "bg-white/90" : "bg-primary"
                    : isMine ? "bg-white/35 group-hover:bg-white/45" : "bg-foreground/20 group-hover:bg-foreground/30"
                }`}
                style={{ height: `${Math.round((h / 10) * 24 + 4)}px` }}
              />
            );
          })}
        </div>

        {/* Bottom row: time left · speed right */}
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-medium tabular-nums leading-none
            ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
            {playing || currentTime > 0 ? fmt(currentTime) : fmt(duration)}
          </span>

          <button
            onClick={changeSpeed}
            className={`text-[10px] font-bold tabular-nums leading-none px-1.5 py-0.5 rounded transition-all active:scale-95
              ${isActive
                ? isMine
                  ? "bg-white/25 text-primary-foreground"
                  : "bg-primary text-primary-foreground"
                : isMine
                  ? "text-primary-foreground/50 hover:text-primary-foreground/80 hover:bg-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            title="Playback speed"
          >
            {playbackRate}×
          </button>
        </div>
      </div>

      {/* Download */}
      <a
        href={url}
        download={name}
        onClick={(e) => e.stopPropagation()}
        className={`shrink-0 p-1.5 rounded-lg transition-colors
          ${isMine
            ? "text-primary-foreground/60 hover:text-primary-foreground/90 hover:bg-white/15"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        title="Download"
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

/** Return a file-type icon component for the given filename or MIME type. */
function getFileIcon(fileName: string, mimeType?: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mime = (mimeType || '').toLowerCase();

  // PDF
  if (ext === 'pdf' || mime === 'application/pdf') {
    return <FileText className="w-5 h-5 text-red-500 shrink-0" />;
  }
  // Word
  if (['doc', 'docx'].includes(ext) || mime.includes('wordprocessing') || mime.includes('msword')) {
    return <FileType className="w-5 h-5 text-blue-600 shrink-0" />;
  }
  // Excel
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('ms-excel')) {
    return <FileSpreadsheet className="w-5 h-5 text-green-600 shrink-0" />;
  }
  // PowerPoint
  if (['ppt', 'pptx'].includes(ext) || mime.includes('presentation') || mime.includes('powerpoint')) {
    return <Presentation className="w-5 h-5 text-orange-500 shrink-0" />;
  }
  // Archive
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mime.includes('zip') || mime.includes('archive') || mime.includes('compressed')) {
    return <FileArchive className="w-5 h-5 text-yellow-600 shrink-0" />;
  }
  // Code
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh', 'bat', 'sql'].includes(ext)) {
    return <FileCode className="w-5 h-5 text-purple-500 shrink-0" />;
  }
  // Text
  if (['txt', 'md', 'rtf', 'log'].includes(ext) || mime.startsWith('text/')) {
    return <FileText className="w-5 h-5 text-gray-500 shrink-0" />;
  }
  // Generic file
  return <FileIcon className="w-5 h-5 text-muted-foreground shrink-0" />;
}

/** Get a short, friendly file-type label from the filename (extension). */
function getFileLabel(fileName: string): string {
  const ext = fileName.split('.').pop()?.toUpperCase();
  return ext || 'FILE';
}

/** Turn URLs in text into clickable <a> elements. */
function linkifyText(text: string): ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Group Info Dialog – shows member list with add/remove capabilities */
function GroupInfoDialog({
  open,
  onOpenChange,
  chat,
  currentUserId,
  onViewProfile,
  addGroupMembers,
  removeGroupMember,
  updateGroupChat,
  leaveGroup,
  onLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: any;
  currentUserId: string | undefined;
  onViewProfile: (user: any) => void;
  addGroupMembers: any;
  removeGroupMember: any;
  updateGroupChat: any;
  leaveGroup: any;
  onLeave: () => void;
}) {
  const [addMode, setAddMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(chat.name || '');
  const [settingsMember, setSettingsMember] = useState<any>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { data: searchResults } = useSearchUsers(searchQuery);

  const myMembership = chat.members?.find((m: any) => m.userId === currentUserId);
  const isAdmin = myMembership?.role === 'admin';
  const myPerms = (myMembership?.permissions || {}) as Record<string, boolean>;
  const canEditInfo = isAdmin || myPerms.canEditInfo === true;
  const existingIds = new Set(chat.members?.map((m: any) => m.userId) || []);

  const filteredResults = searchResults?.filter(
    (u: any) => !existingIds.has(u.id) && u.id !== currentUserId
  ) || [];

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData, credentials: 'include' });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      updateGroupChat.mutate({ chatId: chat.id, name: chat.name, avatarUrl: data.url });
    } catch (err) {
      console.error('Failed to upload group avatar:', err);
      alert('Failed to upload image');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setAddMode(false); setSearchQuery(''); } }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              ref={avatarInputRef}
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <button
              type="button"
              className={`relative group/avatar shrink-0 ${!canEditInfo ? 'cursor-default' : ''}`}
              onClick={() => canEditInfo && avatarInputRef.current?.click()}
              disabled={uploadingAvatar || !canEditInfo}
            >
              <Avatar className="w-12 h-12 border border-border/50">
                <AvatarImage src={chat.avatarUrl || ''} />
                <AvatarFallback className="bg-primary/10 text-primary font-medium"><Users className="w-5 h-5" /></AvatarFallback>
              </Avatar>
              {canEditInfo && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                  {uploadingAvatar ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Pencil className="w-4 h-4 text-white" />}
                </div>
              )}
            </button>
            <div className="flex-1 min-w-0">
              {editingName && canEditInfo ? (
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = nameValue.trim();
                    if (trimmed && trimmed !== chat.name) {
                      updateGroupChat.mutate({ chatId: chat.id, name: trimmed });
                    }
                    setEditingName(false);
                  }}
                >
                  <Input
                    ref={nameInputRef}
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="h-8 text-base font-semibold"
                    autoFocus
                    onBlur={() => {
                      const trimmed = nameValue.trim();
                      if (trimmed && trimmed !== chat.name) {
                        updateGroupChat.mutate({ chatId: chat.id, name: trimmed });
                      }
                      setEditingName(false);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setNameValue(chat.name || ''); setEditingName(false); } }}
                  />
                </form>
              ) : (
                <div
                  className={`flex items-center gap-1.5 text-left ${canEditInfo ? 'group/name hover:opacity-80 transition-opacity cursor-pointer' : ''}`}
                  onClick={() => { if (canEditInfo) { setNameValue(chat.name || ''); setEditingName(true); } }}
                  title={canEditInfo ? 'Click to rename' : undefined}
                >
                  <span className="text-lg font-semibold truncate">{chat.name || 'Group'}</span>
                  {canEditInfo && <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />}
                </div>
              )}
              <p className="text-sm text-muted-foreground font-normal">{chat.members?.length || 0} members</p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Group chat information and member management</DialogDescription>
        </DialogHeader>

        {/* Add Members Mode */}
        {addMode ? (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search users to add..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <Button variant="ghost" size="sm" onClick={() => { setAddMode(false); setSearchQuery(''); }}>
                Cancel
              </Button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1">
              {filteredResults.length === 0 && searchQuery.trim() && (
                <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
              )}
              {filteredResults.map((u: any) => (
                <button
                  key={u.id}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-muted/80 transition-colors text-left"
                  onClick={() => {
                    addGroupMembers.mutate({ chatId: chat.id, userIds: [u.id] }, {
                      onSuccess: () => setSearchQuery(''),
                    });
                  }}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={u.profileImageUrl || ''} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">{u.firstName?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium flex-1 truncate">
                    {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}
                  </span>
                  <UserPlus className="w-4 h-4 text-primary shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Member List */
          <div className="flex flex-col gap-2 flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-medium text-muted-foreground">Members</span>
              <Button variant="ghost" size="sm" className="text-primary gap-1" onClick={() => setAddMode(true)}>
                <UserPlus className="w-4 h-4" />
                Add
              </Button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1">
              {/* Resolve effective creator: explicit creatorId or earliest-joined admin */}
              {(() => {
                const effectiveCreatorId = chat.creatorId || (() => {
                  const admins = (chat.members || [])
                    .filter((m: any) => m.role === 'admin')
                    .sort((a: any, b: any) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());
                  return admins.length > 0 ? admins[0].userId : null;
                })();
                return chat.members?.map((m: any) => {
                const memberUser = m.user;
                const memberName = [memberUser?.firstName, memberUser?.lastName].filter(Boolean).join(' ') || memberUser?.email || 'Unknown';
                const isSelf = m.userId === currentUserId;
                const memberIsAdmin = m.role === 'admin';
                const isCreator = effectiveCreatorId && m.userId === effectiveCreatorId;

                return (
                  <div key={m.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Avatar
                      className="w-9 h-9 cursor-pointer hover:opacity-80"
                      onClick={() => { if (!isSelf && memberUser) { onOpenChange(false); onViewProfile(memberUser); } }}
                    >
                      <AvatarImage src={memberUser?.profileImageUrl || ''} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{memberName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{memberName}{isSelf ? ' (You)' : ''}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isCreator && (
                          <span className="text-[11px] text-amber-500 flex items-center gap-0.5 font-semibold">
                            <Crown className="w-3 h-3" /> Creator
                          </span>
                        )}
                        {memberIsAdmin && !isCreator && (
                          <span className="text-[11px] text-primary flex items-center gap-0.5">
                            <Crown className="w-3 h-3" /> Admin
                          </span>
                        )}
                        {m.title && (
                          <span className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                            {m.title}
                          </span>
                        )}
                      </div>
                    </div>
                    {isAdmin && !isSelf && !isCreator && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-muted-foreground hover:text-primary"
                          onClick={() => setSettingsMember(m)}
                          title="Member settings"
                        >
                          <Shield className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Remove ${memberName} from the group?`)) {
                              removeGroupMember.mutate({ chatId: chat.id, userId: m.userId });
                            }
                          }}
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    {!isAdmin && isSelf && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-primary shrink-0"
                        onClick={() => setSettingsMember(m)}
                        title="View your permissions"
                      >
                        <Shield className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              });
              })()}
            </div>

            {/* Leave group button */}
            <Button
              variant="destructive"
              className="w-full mt-2"
              onClick={() => {
                if (confirm('Leave this group? You will no longer receive messages.')) {
                  leaveGroup.mutate(chat.id, {
                    onSuccess: () => { onOpenChange(false); onLeave(); }
                  });
                }
              }}
            >
              Leave Group
            </Button>
          </div>
        )}
      </DialogContent>

      {/* Member Settings Dialog */}
      {settingsMember && (
        <MemberSettingsDialog
          open={!!settingsMember}
          onOpenChange={(v) => { if (!v) setSettingsMember(null); }}
          chatId={chat.id}
          member={settingsMember}
          isCurrentUserAdmin={isAdmin}
        />
      )}
    </Dialog>
  );
}

export function ChatWindow({ chatId }: { chatId: number }) {
  type RecordingType = 'audio' | 'video' | 'screen';
  type ScreenRecordingOptions = { includeMicrophone: boolean; includeCamera: boolean };

  const { user } = useAuth();
  const { isMobile } = useSidebar();
  const [, navigate] = useLocation();
  const { data: chat, isLoading: chatLoading } = useChat(chatId);
  const { data: messages, isLoading: messagesLoading } = useMessages(chatId);
  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesRead();
  const deleteMessages = useDeleteMessages(chatId);
  const editMessage = useEditMessage();
  const addReaction = useAddReaction(chatId);
  const removeReaction = useRemoveReaction(chatId);
  const call = useCall();

  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState<Array<{name: string; url: string; type: string}>>([]);
  const [uploading, setUploading] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [stickerTab, setStickerTab] = useState<'emoji' | 'gif'>('emoji');
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState<Array<{ id: string; title: string; url: string; preview: string; mp4: string }>>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifNextPos, setGifNextPos] = useState<string | null>(null);
  const emojiGridRef = useRef<HTMLDivElement>(null);
  const stickerPickerRef = useRef<HTMLDivElement>(null);
  const gifScrollRef = useRef<HTMLDivElement>(null);

  // editing state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);

  // reply state
  const [replyToMessage, setReplyToMessage] = useState<{ id: number; senderName: string; content: string; senderId: string } | null>(null);

  // forward state
  const [forwardMessage, setForwardMessage] = useState<{ id: number; content: string; senderName: string; attachments?: any[] } | null>(null);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const { data: allChats } = useChats();

  // delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteItems, setPendingDeleteItems] = useState<Array<{ id: number; forAll: boolean }>>([]);
  const [hasOwnInDelete, setHasOwnInDelete] = useState(false);

  // recording state
  const [recording, setRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<RecordingType | null>(null); // Track recording mode
  const [recordTime, setRecordTime] = useState(0); // ms
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordingCleanupRef = useRef<(() => void) | null>(null);

  // search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // profile modal state
  const [profileUser, setProfileUser] = useState<any>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // group info dialog state
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);

  // poll dialog state
  const [createPollOpen, setCreatePollOpen] = useState(false);

  // invite links dialog state
  const [inviteLinksOpen, setInviteLinksOpen] = useState(false);

  // background picker state
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [chatBgId, setChatBgId] = useState(() => getChatBackground(chatId));
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(() => getCustomBackgroundUrl(chatId));
  const chatBg = findBackground(chatBgId);
  const isCustomBg = chatBgId !== 'default';
  const effectiveBgStyle = chatBgId === 'custom-image' && customBgUrl
    ? buildCustomBackgroundStyle(customBgUrl)
    : isCustomBg ? chatBg.style : undefined;

  // delete group confirmation dialog state
  const [deleteGroupConfirmOpen, setDeleteGroupConfirmOpen] = useState(false);

  // jump-to-date calendar popover state — stores the date-key of the open divider (or null)
  const [datePickerOpenKey, setDatePickerOpenKey] = useState<string | null>(null);

  // Sync background when switching chats
  useEffect(() => {
    setChatBgId(getChatBackground(chatId));
    setCustomBgUrl(getCustomBackgroundUrl(chatId));
  }, [chatId]);

  // Jump to date handler — finds the first message on or after the selected date and scrolls to it
  const handleJumpToDate = (date: Date | undefined) => {
    if (!date || !messages) return;
    setDatePickerOpenKey(null);
    // Set target to start of selected day
    const targetStart = new Date(date);
    targetStart.setHours(0, 0, 0, 0);
    // Find the first message on or after the selected date
    let targetMsg = messages.find(msg => {
      const msgDate = new Date(msg.createdAt!);
      return msgDate >= targetStart;
    });
    // If no message found on/after that date, jump to the last message
    if (!targetMsg && messages.length > 0) {
      targetMsg = messages[messages.length - 1];
    }
    if (targetMsg) {
      // Wait for popover close animation to finish before scrolling
      const msgId = targetMsg.id;
      setTimeout(() => {
        const element = document.querySelector(`[data-message-id="${msgId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Brief highlight
          element.classList.add('ring-2', 'ring-primary/50', 'rounded-lg');
          setTimeout(() => element.classList.remove('ring-2', 'ring-primary/50', 'rounded-lg'), 2000);
        }
      }, 300);
    }
  };

  // pin message mutation
  const pinMessage = usePinMessage();
  const unpinMessage = useUnpinMessage();

  // Calculate all text matches in messages (for navigation)
  const allMatches = (() => {
    if (!searchQuery.trim() || !messages) return [];
    const matches: { messageId: number; messageIndex: number; text: string }[] = [];
    messages.forEach((msg, idx) => {
      if (msg.content && msg.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        matches.push({ messageId: msg.id, messageIndex: idx, text: msg.content });
      }
    });
    return matches;
  })();

  const goToNextMatch = () => {
    if (allMatches.length > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % allMatches.length);
    }
  };

  const goToPrevMatch = () => {
    if (allMatches.length > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + allMatches.length) % allMatches.length);
    }
  };

  // emoji categories explicitly grouped
  const EMOJI_CATEGORIES: { title: string; icon: string; items: string[] }[] = [
    {
      title: 'Faces & Emotions',
      icon: '😀',
      items: [
        '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
        '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥',
        '😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓',
        '🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣',
        '😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾',
        '🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾',
      ],
    },
    {
      title: 'Animals',
      icon: '🐶',
      items: [
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧',
        '🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗',
        '🕷️','🦂','🐢','🐍','🦎','🐲','🦕','🦖','🦏','🦛','🦘','🦙','🦒','🦓','🐘','🦣','🐪','🐫','🦬',
        '🐃','🐂','🐄','🐎','🐖','🐏','🐑','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🐓','🦃','🦤','🦚',
        '🦜','🦢','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔',
        '🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦍','🦧',
        '🐟','🐠','🐡','🦐','🦑','🐙','🦞','🦀','🦪','🐚',
      ],
    },
    {
      title: 'Nature',
      icon: '🌸',
      items: [
        '🌸','🌺','🌻','🌹','🌷','🌼','💐','🌾','🍀','🌿','🌱','🌲','🌳','🌴','🌵','🎋','🎍','🍁','🍂','🍃',
        '🍄','🌰','🎄','🌊','🌬️','🌀','🌈','⛅','🌤️','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','🌪️','🌫️','🌙',
        '🌛','🌜','🌝','🌞','⭐','🌟','💫','✨','⚡','🔥','💥','🌍','🌎','🌏','🪐','🌑','🌒','🌓','🌔','🌕',
      ],
    },
    {
      title: 'Food & Drink',
      icon: '🍔',
      items: [
        '🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🫒','🥑','🍆','🥦','🥬','🥒',
        '🌶️','🫑','🧄','🧅','🥕','🌽','🍠','🧆','🥜','🌰','🍞','🥐','🥖','🫓','🥨','🧀','🥚','🍳','🧈','🥞',
        '🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🥙','🍝','🍜','🍛','🍲','🫕',
        '🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩',
        '🍪','🍯','🧃','🥤','🧋','☕','🍵','🫖','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧉','🍾',
      ],
    },
    {
      title: 'Activities',
      icon: '⚽',
      items: [
        '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏑','🏏','🪃','🥅','⛳',
        '🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️',
        '🤺','🏇','🧘','🏄','🚣','🧗','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🎫','🎟️','🎪','🤹','🎭','🎨',
        '🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🎰',
      ],
    },
    {
      title: 'Travel',
      icon: '✈️',
      items: [
        '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹',
        '🚁','🛸','✈️','🛩️','🚀','🛶','⛵','🚤','🛥️','🛳️','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝',
        '🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡',
        '🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','🗺️','🗾','🧭',
      ],
    },
    {
      title: 'Objects',
      icon: '💡',
      items: [
        '⌚','📱','💻','🖥️','⌨️','🖱️','🖨️','📠','📺','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📡',
        '🔋','🪫','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💰','💴','💵','💶','💷','💸','💳','🪙','💹','📈','📉',
        '📊','📋','📌','📍','✂️','🗃️','🗄️','🗑️','🔒','🔓','🔏','🔐','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️',
        '⚔️','🔫','🪃','🛡️','🪚','🔧','🪛','🔩','⚙️','🗜️','⚖️','🦯','🔗','⛓️','🪝','🧲','🪜','⚗️','🔭','🔬',
        '🩺','💊','💉','🩹','🩼','🩻','🪤','🧸','🪆','🖼️','🧵','🪡','🧶','🪢','👓','🕶️','🥽','🧣','🧤','🧥',
        '👒','🎩','🎓','⛑️','📿','💄','👟','👠','👡','👢','👑','👜','👛','👝','🛍️','🎒','🧳','🌂','☂️',
      ],
    },
    {
      title: 'Symbols',
      icon: '❤️',
      items: [
        '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️',
        '✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐',
      ],
    },
    {
      title: 'Hands & People',
      icon: '👋',
      items: [
        '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
        '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻',
        '👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','🫦','💋',
      ],
    },
    {
      title: 'Flags',
      icon: '🏁',
      items: [
        '🏁','🚩','🎌','🏴','🏳️','🎏','🎀','🎁','🎊','🎉','🎈','🎍','🎋','🎎','🎑','🎃','🎄','🎆','🎇','🧨',
        '✨','🎐','🧧','🎠','🎡','🎢','🎪','🤹','🎭','🎨','🖼️','🎰','🎲','🧩','🎯','🎳','🎮','🕹️',
      ],
    },
  ];

  const ALL_EMOJIS = new Set(EMOJI_CATEGORIES.flatMap(c => c.items));
  const onlyEmoji = (text?: string) => {
    if (!text) return false;
    const chars = Array.from(text.trim());
    return chars.length > 0 && chars.every(ch => ALL_EMOJIS.has(ch));
  };

  // helper for rendering attachments of a message
  const renderAttachments = (msg: any, isMine: boolean) => {
    const files: any[] = (msg.attachments || []).filter((f: any) => f.type !== 'reply' && f.type !== 'forward');
    if (files.length === 0) return null;

    const onlyStickers = files.every(f => f.type === 'sticker');
    if (onlyStickers) {
      return (
        <div className="mt-3 flex items-center justify-center space-x-2">
          {files.map((f, idx) => (
            <span key={idx} className="text-4xl">{f.name}</span>
          ))}
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-2">
        {files.map((file: any, idx: number) => {
          if (file.type === 'sticker') {
            return <span key={idx} className="text-4xl">{file.name}</span>;
          }

          // ── Call history entry ──
          const isCallEntry = file.type?.startsWith('call/');
          if (isCallEntry) {
            try {
              const meta = JSON.parse(file.url || '{}');
              const callType = meta.callType || 'audio';
              const reason = meta.endReason || 'hangup';
              const dur = meta.duration;
              const durationStr = dur
                ? `${Math.floor(dur / 60000).toString().padStart(2, '0')}:${Math.floor((dur % 60000) / 1000).toString().padStart(2, '0')}`
                : null;
              const icon = callType === 'video' ? '🎥' : '📞';
              const labels: Record<string, string> = {
                hangup: durationStr ? `Call · ${durationStr}` : 'Call ended',
                rejected: 'Call declined',
                busy: 'User busy',
                missed: 'Missed call',
                error: 'Call failed',
              };
              return (
                <div key={idx} className="flex items-center gap-2 text-xs opacity-80">
                  <span>{icon}</span>
                  <span>{labels[reason] || 'Call ended'}</span>
                </div>
              );
            } catch {
              return <div key={idx} className="text-xs opacity-60">📞 Call</div>;
            }
          }

          const fileExt = file.name?.split('.').pop()?.toLowerCase() || '';
          const mimeType: string = (file.type || '').toLowerCase();

          const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp', 'ogv'];
          const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'wma', 'opus', 'ogg'];

          // Recorded audio is saved as "audio-<timestamp>.webm" — honour that name over extension
          const isRecordedAudio = file.name?.startsWith('audio-') && fileExt === 'webm';
          const isRecordedVideo = file.name?.startsWith('video-') && fileExt === 'webm';

          const isGifVideo = !isRecordedAudio && (mimeType.startsWith('video/') || videoExtensions.includes(fileExt)) && file.name === 'GIF';
          const isGif     = mimeType === 'image/gif' || fileExt === 'gif';
          const isImage   = !isGif && !isGifVideo && !isRecordedAudio && !isRecordedVideo && (mimeType.startsWith('image/') || ['png','jpg','jpeg','webp','bmp','svg'].includes(fileExt));
          const isVideo   = !isGif && !isGifVideo && !isRecordedAudio && (isRecordedVideo || mimeType.startsWith('video/') || videoExtensions.includes(fileExt));
          const isAudio   = !isVideo && (isRecordedAudio || mimeType.startsWith('audio/') || audioExtensions.includes(fileExt));
          
          console.log(`[File Detection] name: ${file.name}, type: ${file.type}, ext: ${fileExt}, isVideo: ${isVideo}, isAudio: ${isAudio}`);

          // Render GIF images and GIF mp4 videos as looping silent videos
          if (isGif || isGifVideo) {
            return (
              <div key={idx} className="rounded-lg overflow-hidden max-w-xs">
                <video
                  src={file.url}
                  className="max-w-xs max-h-96 rounded-lg"
                  loop
                  muted
                  autoPlay
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
                  disableRemotePlayback
                  controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
                />
              </div>
            );
          }

          if (isImage) {
            return (
              <a
                key={idx}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
              >
                <img src={file.url} alt={file.name} className="max-w-xs max-h-96 rounded-lg" />
              </a>
            );
          } else if (isVideo) {
            return <VideoMessage key={idx} url={file.url} name={file.name} isMine={isMine} />;
          } else if (isAudio) {
            return <AudioMessage key={idx} url={file.url} name={file.name} isMine={isMine} />;
          } else {
            return (
              <div
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  const link = document.createElement('a');
                  link.href = file.url;
                  link.download = file.name;
                  link.click();
                }}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                {getFileIcon(file.name, file.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className={`text-[11px] ${isMine ? 'text-primary-foreground/50' : 'text-muted-foreground'}`}>
                    {getFileLabel(file.name)}
                  </p>
                </div>
                <Download className={`w-4 h-4 shrink-0 ${isMine ? 'text-primary-foreground/50' : 'text-muted-foreground'}`} />
              </div>
            );
          }
        })}
      </div>
    );
  };

  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const openProfileByUsername = (username: string) => {
    if (!chat?.members?.length) return;
    const normalized = username.toLowerCase();
    const matchedMember = chat.members.find(
      (m) => m.user?.username?.toLowerCase() === normalized
    );
    if (!matchedMember?.user) return;
    setProfileUser(matchedMember.user);
    setProfileModalOpen(true);
  };

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    if (chatId) {
      markRead.mutate(chatId);
    }
  }, [messages?.length, chatId]);

  // cleanup recorder if component unmounts
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      if (recordingCleanupRef.current) {
        recordingCleanupRef.current();
        recordingCleanupRef.current = null;
      }
    };
  }, []);

  // Scroll to current match
  useEffect(() => {
    if (isSearching && allMatches.length > 0) {
      const currentMatch = allMatches[currentMatchIndex];
      if (currentMatch) {
        const messageElement = document.querySelector(`[data-message-id="${currentMatch.messageId}"]`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }, [currentMatchIndex, isSearching, allMatches]);

  // Helper function to highlight matching text in a string
  const highlightText = (text: string): (string | JSX.Element)[] => {
    if (!isSearching || !searchQuery.trim()) return [text];
    
    const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, idx) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={idx} className="bg-amber-200 dark:bg-amber-700 font-semibold text-foreground rounded px-0.5">
          {part}
        </mark>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  };

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editingMessageId && textareaRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [editingMessageId]);

  // Close sticker picker on click outside
  useEffect(() => {
    if (!showStickerPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (stickerPickerRef.current && !stickerPickerRef.current.contains(e.target as Node)) {
        setShowStickerPicker(false);
      }
    };
    // Delay adding listener to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStickerPicker]);

  // GIF search using Tenor API
  const fetchGifs = async (query: string, append = false) => {
    setGifLoading(true);
    try {
      const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
      let endpoint = query.trim()
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=20&media_filter=mp4,tinygif,nanogif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=20&media_filter=mp4,tinygif,nanogif`;
      if (append && gifNextPos) {
        endpoint += `&pos=${gifNextPos}`;
      }
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('GIF fetch failed');
      const data = await res.json();
      const results = (data.results || []).map((r: any) => ({
        id: r.id,
        title: r.title || '',
        url: r.media_formats?.mp4?.url || r.media_formats?.tinygif?.url || '',
        preview: r.media_formats?.nanogif?.url || r.media_formats?.tinygif?.url || '',
        mp4: r.media_formats?.mp4?.url || '',
      }));
      setGifNextPos(data.next || null);
      if (append) {
        setGifResults(prev => {
          const existingIds = new Set(prev.map(g => g.id));
          const newItems = results.filter((r: any) => !existingIds.has(r.id));
          return [...prev, ...newItems];
        });
      } else {
        setGifResults(results);
      }
    } catch (err) {
      console.error('GIF search error:', err);
      if (!append) setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  };

  // Fetch trending GIFs when GIF tab opens
  useEffect(() => {
    if (showStickerPicker && stickerTab === 'gif' && gifResults.length === 0 && !gifSearchQuery.trim()) {
      fetchGifs('');
    }
  }, [showStickerPicker, stickerTab]);

  // Debounced GIF search
  useEffect(() => {
    if (stickerTab !== 'gif' || !showStickerPicker) return;
    const timer = setTimeout(() => {
      setGifNextPos(null);
      fetchGifs(gifSearchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [gifSearchQuery]);

  // Infinite scroll for GIFs
  const handleGifScroll = () => {
    const el = gifScrollRef.current;
    if (!el || gifLoading || !gifNextPos) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      fetchGifs(gifSearchQuery, true);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    // If we're editing, save the edit instead
    if (editingMessageId) {
      saveEditedMessage();
      return;
    }
    
    if (!inputValue.trim() && attachments.length === 0) return;

    // Build attachments with reply info if replying
    const allAttachments = [...attachments];
    if (replyToMessage) {
      allAttachments.push({
        type: 'reply',
        name: replyToMessage.senderName,
        url: JSON.stringify({ messageId: replyToMessage.id, content: replyToMessage.content, senderId: replyToMessage.senderId }),
      });
    }

    sendMessage.mutate({
      chatId,
      content: inputValue.trim(),
      attachments: allAttachments.length > 0 ? allAttachments : undefined
    }, {
      onSuccess: () => {
        setInputValue("");
        setAttachments([]);
        setReplyToMessage(null);
      }
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error("Upload failed");

        const data = await response.json();
        setAttachments((prev) => [...prev, { name: data.name, url: data.url, type: data.type }]);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const buildScreenCompositeStream = async (
    displayStream: MediaStream,
    micStream: MediaStream | null,
    cameraStream: MediaStream | null,
    includeCamera: boolean,
  ): Promise<{ stream: MediaStream; cleanup: () => void }> => {
    const cleanupFns: Array<() => void> = [];

    const displayAudioTracks = displayStream.getAudioTracks();
    const micAudioTracks = micStream?.getAudioTracks() || [];

    let mixedAudioTrack: MediaStreamTrack | null = null;
    if (displayAudioTracks.length > 0 || micAudioTracks.length > 0) {
      const audioCtx = new AudioContext();
      const destination = audioCtx.createMediaStreamDestination();

      if (displayAudioTracks.length > 0) {
        const displayAudioSource = audioCtx.createMediaStreamSource(new MediaStream([displayAudioTracks[0]]));
        displayAudioSource.connect(destination);
      }

      if (micAudioTracks.length > 0) {
        const micAudioSource = audioCtx.createMediaStreamSource(new MediaStream([micAudioTracks[0]]));
        micAudioSource.connect(destination);
      }

      mixedAudioTrack = destination.stream.getAudioTracks()[0] || null;
      cleanupFns.push(() => {
        try { audioCtx.close(); } catch {}
      });
    }

    if (!includeCamera || !cameraStream?.getVideoTracks().length) {
      const composed = new MediaStream();
      const displayVideoTrack = displayStream.getVideoTracks()[0];
      if (displayVideoTrack) composed.addTrack(displayVideoTrack);
      if (mixedAudioTrack) composed.addTrack(mixedAudioTrack);
      return {
        stream: composed,
        cleanup: () => { cleanupFns.forEach(fn => fn()); },
      };
    }

    const screenVideo = document.createElement('video');
    screenVideo.srcObject = displayStream;
    screenVideo.muted = true;
    screenVideo.playsInline = true;

    const cameraVideo = document.createElement('video');
    cameraVideo.srcObject = cameraStream;
    cameraVideo.muted = true;
    cameraVideo.playsInline = true;

    await Promise.all([
      screenVideo.play().catch(() => {}),
      cameraVideo.play().catch(() => {}),
    ]);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const sourceW = screenVideo.videoWidth || 1280;
    const sourceH = screenVideo.videoHeight || 720;
    const maxW = 960;
    const scale = Math.min(1, maxW / sourceW);
    const width = Math.max(640, Math.floor(sourceW * scale));
    const height = Math.max(360, Math.floor(sourceH * scale));
    canvas.width = width;
    canvas.height = height;

    let intervalId: number | null = null;
    const draw = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      const screenW = screenVideo.videoWidth || width;
      const screenH = screenVideo.videoHeight || height;
      const screenScale = Math.min(width / screenW, height / screenH);
      const drawW = screenW * screenScale;
      const drawH = screenH * screenScale;
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;

      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(screenVideo, drawX, drawY, drawW, drawH);

      const camW = Math.floor(width * 0.22);
      const camH = Math.floor(camW * 9 / 16);
      const camX = width - camW - 20;
      const camY = height - camH - 20;

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(camX - 4, camY - 4, camW + 8, camH + 8);
      ctx.drawImage(cameraVideo, camX, camY, camW, camH);

    };

    draw();

    intervalId = window.setInterval(draw, 1000 / 20);

    const canvasStream = canvas.captureStream(24);
    const composed = new MediaStream();
    const composedVideoTrack = canvasStream.getVideoTracks()[0];
    if (composedVideoTrack) composed.addTrack(composedVideoTrack);
    if (mixedAudioTrack) composed.addTrack(mixedAudioTrack);

    cleanupFns.push(() => {
      if (intervalId) clearInterval(intervalId);
      canvasStream.getTracks().forEach(t => t.stop());
      screenVideo.pause();
      cameraVideo.pause();
      screenVideo.srcObject = null;
      cameraVideo.srcObject = null;
    });

    return {
      stream: composed,
      cleanup: () => { cleanupFns.forEach(fn => fn()); },
    };
  };

  const startRecording = async (type: RecordingType = 'audio', screenOptions?: ScreenRecordingOptions) => {
    try {
      let stream: MediaStream;
      let displayStream: MediaStream | null = null;
      let micStream: MediaStream | null = null;
      let cameraStream: MediaStream | null = null;

      if (recordingCleanupRef.current) {
        recordingCleanupRef.current();
        recordingCleanupRef.current = null;
      }

      if (type === 'screen') {
        const includeMicrophone = !!screenOptions?.includeMicrophone;
        const includeCamera = !!screenOptions?.includeCamera;

        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 24, max: 30 } },
          audio: true,
        }).catch(async () => {
          return navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 24, max: 30 } },
            audio: false,
          });
        });

        if (includeMicrophone) {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        if (includeCamera) {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
          });
        }

        const composed = await buildScreenCompositeStream(
          displayStream,
          micStream,
          cameraStream,
          includeCamera,
        );
        stream = composed.stream;
        recordingCleanupRef.current = () => {
          composed.cleanup();
          displayStream?.getTracks().forEach(t => t.stop());
          micStream?.getTracks().forEach(t => t.stop());
          cameraStream?.getTracks().forEach(t => t.stop());
        };
      } else {
        const constraints = type === 'audio'
          ? { audio: true }
          : { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      streamRef.current = stream;
      
      // Check what tracks we actually got
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      console.log(`[Recording] Video tracks: ${videoTracks.length}, Audio tracks: ${audioTracks.length}`);
      
      // Determine MIME type and options
      let mimeType = 'video/webm';
      let options: MediaRecorderOptions = {};
      
      if (type === 'audio') {
        mimeType = 'audio/webm';
        options = { mimeType: 'audio/webm' };
      } else {
        // For video, try to use a supported video codec
        const possibleTypes = [
          { mimeType: 'video/webm;codecs=vp9,opus', description: 'VP9+Opus' },
          { mimeType: 'video/webm;codecs=vp8,opus', description: 'VP8+Opus' },
          { mimeType: 'video/webm', description: 'WebM (auto)' }
        ];
        
        for (const type of possibleTypes) {
          if (MediaRecorder.isTypeSupported(type.mimeType)) {
            mimeType = type.mimeType;
            options = { mimeType };
            console.log(`[Recording] Using MIME type: ${type.description}`);
            break;
          }
        }

        if (type === 'screen') {
          options.videoBitsPerSecond = 2_500_000;
        }
      }
      
      console.log(`[Recording] MediaRecorder type: ${mimeType}`);
      const recorder = new MediaRecorder(stream, options);
      recordedChunksRef.current = [];

      if (type === 'screen') {
        const screenTrack = displayStream?.getVideoTracks()[0] || stream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.onended = () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
            }
          };
        }
      }

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          console.log(`[Recording] Data available: ${ev.data.size} bytes, type: ${ev.data.type}`);
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        console.log('[Recording] onstop handler called');
        // stop timer
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setRecording(false);
        setRecordingType(null);
        setRecordTime(0);

        // stop the stream tracks so camera/microphone are released
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (recordingCleanupRef.current) {
          recordingCleanupRef.current();
          recordingCleanupRef.current = null;
        }

        console.log(`[Recording] Chunks collected: ${recordedChunksRef.current.length}`);
        const finalMimeType = recordedChunksRef.current[0]?.type || mimeType;
        const blob = new Blob(recordedChunksRef.current, { type: finalMimeType });
        console.log(`[Recording] Blob size: ${blob.size} bytes, MIME: ${finalMimeType}`);
        
        if (blob.size === 0) {
          console.error('[Recording] Recording is empty');
          alert('Recording is empty. Please try again.');
          return;
        }

        // create file and upload
        const ext = type === 'audio' ? 'webm' : 'webm';
        const file = new File([blob], `${type}-${Date.now()}.${ext}`, { type: finalMimeType });
        console.log(`[Recording] File created: ${file.name}, MIME: ${file.type}, preparing to upload`);
        console.log(`[Recording] Current chatId: ${chatId}`);
        try {
          await uploadAndSendMedia(file);
          console.log('[Recording] Upload and send completed');
        } catch (error) {
          console.error('[Recording] Upload and send failed:', error);
          alert(`Failed to send: ${(error as any)?.message || 'Unknown error'}`);
        }
      };

      recorder.onerror = (ev: MediaRecorderErrorEvent) => {
        console.error('Recording error:', ev.error);
        alert(`Recording error: ${ev.error}`);
        setRecording(false);
        setRecordingType(null);
        stream.getTracks().forEach(t => t.stop());
        if (recordingCleanupRef.current) {
          recordingCleanupRef.current();
          recordingCleanupRef.current = null;
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingType(type);
      
      // simple timer
      const start = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        setRecordTime(Date.now() - start);
      }, 250);
    } catch (err) {
      console.error("Recording failed", err);
      const sourceName = type === 'audio' ? 'microphone' : type === 'video' ? 'camera/microphone' : 'screen';
      alert(`Unable to access ${sourceName}: ${(err as any)?.message}`);
    }
  };

  const stopRecording = () => {
    console.log('[Recording] Stop button clicked');
    if (!mediaRecorderRef.current) {
      console.error('[Recording] No media recorder active');
      return;
    }
    try {
      mediaRecorderRef.current.stop();
      console.log('[Recording] Stop called on recorder, waiting for onstop event...');
    } catch (err) {
      console.error('[Recording] Error stopping recorder:', err);
    }
  };

  const formatRecordTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const uploadAndSendMedia = async (file: File) => {
    console.log(`[Upload] Starting upload for file: ${file.name}`);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      console.log('[Upload] Sending to /api/upload...');
      const response = await fetch('/api/upload', { method: 'POST', body: formData, credentials: 'include' });
      console.log(`[Upload] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Upload failed with status ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[Upload] Upload successful, got URL: ${data.url}`);
      console.log(`[Upload] Sending message to chatId: ${chatId}`);
      
      const attachment = { name: data.name, url: data.url, type: data.type };
      
      // send message immediately - return promise to track completion
      return new Promise((resolve, reject) => {
        sendMessage.mutate({ chatId, content: '', attachments: [attachment] }, {
          onSuccess: () => {
            console.log('[Upload] Message sent successfully');
            recordedChunksRef.current = [];
            resolve(undefined);
          },
          onError: (err) => {
            console.error('[Upload] Send message error:', err);
            reject(err);
          }
        });
      });
    } catch (err) {
      console.error('[Upload] Error:', err);
      throw err;
    } finally {
      console.log('[Upload] Setting uploading to false');
      setUploading(false);
    }
  };

  const getChatDisplayName = () => {
    if (!chat) return "";
    if (chat.isGroup) return chat.name;
    const otherMember = chat.members?.find((m: any) => m.userId !== user?.id);
    if (!otherMember) return "Saved Messages";
    const { firstName, lastName, email } = otherMember.user;
    return [firstName, lastName].filter(Boolean).join(" ") || email || "Unknown";
  };

  const getChatAvatar = () => {
    if (!chat) return "";
    if (chat.isGroup) return chat.avatarUrl;
    const otherMember = chat.members?.find((m: any) => m.userId !== user?.id);
    return otherMember?.user?.profileImageUrl;
  };

  const otherMember = chat?.members?.find((m: any) => m.userId !== user?.id);
  const statusInfo = useUserStatus(otherMember?.userId);
  const statusText = formatLastSeen(statusInfo, otherMember?.user?.status, otherMember?.user?.lastSeen);

  // Typing indicator
  const typingUsers = useTypingUsers(chatId);
  const sendTyping = useSendTyping(chatId);

  const typingLabel = (() => {
    if (typingUsers.length === 0) return null;
    if (chat?.isGroup) {
      if (typingUsers.length === 1) return `${typingUsers[0].userName} is typing`;
      if (typingUsers.length === 2) return `${typingUsers[0].userName} and ${typingUsers[1].userName} are typing`;
      return `${typingUsers[0].userName} and ${typingUsers.length - 1} others are typing`;
    }
    return 'typing';
  })();

  const handleClearHistoryForMe = async () => {
    if (!confirm("Clear all chat history from your view only?")) return;
    try {
      const response = await fetch(`/api/chats/${chatId}/clear-for-me`, { method: 'POST', credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const msg = data.cleared != null ? ` (${data.cleared} messages)` : '';
        alert("Chat history cleared for you" + msg);
        window.location.reload();
      } else {
        alert("Failed to clear history: " + response.status + " " + await response.text());
      }
    } catch (err) {
      console.error("Error clearing history:", err);
      alert("Failed to clear history");
    }
  };

  const handleClearHistoryForAll = async () => {
    if (!confirm("This will remove every message from your view and delete your own messages for the other person. Proceed?")) return;
    try {
      const response = await fetch(`/api/chats/${chatId}/clear-for-all`, { method: 'POST', credentials: 'include' });
      if (response.ok) {
        alert("Conversation cleared for you and your messages removed for the other user");
        window.location.reload();
      } else {
        alert("Failed to clear history: " + response.status + " " + await response.text());
      }
    } catch (err) {
      console.error("Error clearing history:", err);
      alert("Failed to clear history");
    }
  };

  const handleDeleteChat = async () => {
    if (!confirm("Delete this chat? This action cannot be undone.")) return;
    try {
      const response = await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
      if (response.ok) navigate('/');
    } catch (err) {
      console.error("Error deleting chat:", err);
      alert("Failed to delete chat");
    }
  };

  const handleDeleteGroup = async () => {
    try {
      const response = await fetch(`/api/chats/${chatId}`, { method: 'DELETE', credentials: 'include' });
      if (response.ok) {
        setDeleteGroupConfirmOpen(false);
        navigate('/');
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.message || "Failed to delete group");
      }
    } catch (err) {
      console.error("Error deleting group:", err);
      alert("Failed to delete group");
    }
  };

  const leaveGroup = useLeaveGroup();
  const addGroupMembers = useAddGroupMembers();
  const removeGroupMember = useRemoveGroupMember();
  const updateGroupChat = useUpdateGroupChat();

  const handleLeaveGroup = () => {
    if (!confirm('Leave this group? You will no longer receive messages.')) return;
    leaveGroup.mutate(chatId, {
      onSuccess: () => navigate('/'),
    });
  };

  const { data: blockStatus } = useBlockStatus(otherMember?.userId);
  const blockMut = useBlockUser();
  const unblockMut = useUnblockUser();

  const handleBlockUser = async () => {
    if (!otherMember) return;
    if (confirm('Are you sure you want to block this user?')) {
      blockMut.mutate(otherMember.userId);
    }
  };

  const handleUnblockUser = async () => {
    if (!otherMember) return;
    unblockMut.mutate(otherMember.userId, {
      onSuccess: () => { alert('User unblocked'); }
    });
  };

  const toggleMessageSelection = (messageId: number) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) { next.delete(messageId); } else { next.add(messageId); }
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const handleEditSelected = () => {
    if (selectedMessages.size !== 1) {
      alert('Please select exactly one message to edit');
      return;
    }
    const messageId = Array.from(selectedMessages)[0];
    const message = messages?.find(m => m.id === messageId);
    if (!message) return;
    
    if (message.senderId !== user?.id) {
      alert('You can only edit your own messages');
      return;
    }

    // Populate input with message content
    setInputValue(message.content || '');
    setEditingMessageId(messageId);
    setAttachments([]); // Clear any attachments when editing
    setShowStickerPicker(false); // Close emoji picker
    setSelectionMode(false);
    setSelectedMessages(new Set());
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setInputValue('');
    setAttachments([]);
  };

  const saveEditedMessage = () => {
    if (!editingMessageId || !inputValue.trim()) return;
    editMessage.mutate(
      { messageId: editingMessageId, content: inputValue },
      {
        onSuccess: () => {
          setEditingMessageId(null);
          setInputValue('');
          setAttachments([]);
        },
        onError: (error: any) => {
          alert(error.message || "Failed to edit message");
        }
      }
    );
  };

  const handleDeleteSelected = () => {
    if (selectedMessages.size === 0) return;

    const items: Array<{ id: number; forAll: boolean }> = [];
    let ownCount = 0;
    selectedMessages.forEach(id => {
      const msg = messages?.find(m => m.id === id);
      const isMine = msg?.senderId === user?.id;
      items.push({ id, forAll: false });
      if (isMine) ownCount += 1;
    });

    setPendingDeleteItems(items);
    setHasOwnInDelete(ownCount > 0);
    setDeleteDialogOpen(true);
  };

  const executeDelete = (forAll: boolean) => {
    const items = pendingDeleteItems.map(item => {
      const msg = messages?.find(m => m.id === item.id);
      const isMine = msg?.senderId === user?.id;
      return { id: item.id, forAll: forAll && !!isMine };
    });
    deleteMessages.mutate(items, {
      onSuccess: () => { setSelectedMessages(new Set()); setSelectionMode(false); }
    });
    setDeleteDialogOpen(false);
    setPendingDeleteItems([]);
  };

  const cancelSelection = () => {
    setSelectedMessages(new Set());
    setSelectionMode(false);
  };

  if (chatLoading || messagesLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background/50">
        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background/50 text-muted-foreground">
        <p>Chat not found</p>
      </div>
    );
  }

  const handleAddReaction = (messageId: number, emoji: string) => {
    addReaction.mutate({ messageId, emoji });
  };

  const handleRemoveReaction = (messageId: number, emoji: string) => {
    removeReaction.mutate({ messageId, emoji });
  };

  const displayName = getChatDisplayName();
  const avatarUrl = getChatAvatar();

  return (
    <div
      className={`flex-1 flex flex-col h-screen relative overflow-hidden ${isCustomBg ? '' : 'bg-[#f8f9fa] dark:bg-[#0e1621]'}`}
      style={effectiveBgStyle}
    >

      {/* Header */}
      <header className="h-16 glass-panel flex items-center justify-between px-4 z-10 shrink-0 shadow-sm">
        {selectionMode ? (
          <>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="rounded-full h-9 w-9" onClick={cancelSelection}>
                <X className="w-5 h-5" />
              </Button>
              <span className="font-semibold text-[15px]">{selectedMessages.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedMessages.size === 1 && (() => {
                const selId = Array.from(selectedMessages)[0];
                const selMsg = messages?.find(m => m.id === selId);
                return selMsg?.senderId === user?.id;
              })() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditSelected}
                  className="flex items-center gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={selectedMessages.size === 0 || deleteMessages.isPending}
                className="flex items-center gap-2"
              >
                {deleteMessages.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {isMobile && <SidebarTrigger className="mr-1 -ml-2" />}

              <Avatar 
                className={`w-10 h-10 border border-border/50 ${chat?.isGroup || (!chat?.isGroup && otherMember) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                onClick={() => {
                  if (chat?.isGroup) {
                    setGroupInfoOpen(true);
                  } else if (otherMember) {
                    setProfileUser(otherMember.user);
                    setProfileModalOpen(true);
                  }
                }}
              >
                <AvatarImage src={avatarUrl || ""} />
                <AvatarFallback className="bg-primary/10 text-primary font-medium">{chat?.isGroup ? <Users className="w-5 h-5" /> : (displayName?.[0] || 'U')}</AvatarFallback>
              </Avatar>

              <div 
                className={`flex flex-col ${chat?.isGroup || (!chat?.isGroup && otherMember) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                onClick={() => {
                  if (chat?.isGroup) {
                    setGroupInfoOpen(true);
                  } else if (otherMember) {
                    setProfileUser(otherMember.user);
                    setProfileModalOpen(true);
                  }
                }}
              >
                <h2 className="font-semibold text-[15px] leading-tight text-foreground">{displayName}</h2>
                <span className={`text-[12px] ${typingLabel ? 'text-primary font-medium' : !chat.isGroup && statusText === 'online' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                  {typingLabel ? (
                    <span className="inline-flex items-baseline">
                      {typingLabel}
                      <span className="inline-flex ml-[1px] gap-[1.5px]">
                        <span className="w-[3px] h-[3px] rounded-full bg-primary animate-typing-dot-1" />
                        <span className="w-[3px] h-[3px] rounded-full bg-primary animate-typing-dot-2" />
                        <span className="w-[3px] h-[3px] rounded-full bg-primary animate-typing-dot-3" />
                      </span>
                    </span>
                  ) : (chat.isGroup ? `${chat.members.length} members` : statusText)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Call buttons (direct chats only, hidden when blocked) */}
              {!chat?.isGroup && otherMember && !blockStatus?.blocked && !blockStatus?.blockedBy && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground rounded-full h-9 w-9 hover:text-primary"
                    onClick={() => call.startCall(
                      {
                        userId: otherMember.userId,
                        name: [otherMember.user.firstName, otherMember.user.lastName].filter(Boolean).join(' ') || otherMember.user.email || 'Unknown',
                        avatarUrl: otherMember.user.profileImageUrl,
                      },
                      chatId,
                      'audio',
                      [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Unknown',
                      user?.profileImageUrl
                    )}
                    title="Voice call"
                  >
                    <Phone className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground rounded-full h-9 w-9 hover:text-primary"
                    onClick={() => call.startCall(
                      {
                        userId: otherMember.userId,
                        name: [otherMember.user.firstName, otherMember.user.lastName].filter(Boolean).join(' ') || otherMember.user.email || 'Unknown',
                        avatarUrl: otherMember.user.profileImageUrl,
                      },
                      chatId,
                      'video',
                      [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Unknown',
                      user?.profileImageUrl
                    )}
                    title="Video call"
                  >
                    <Video className="w-5 h-5" />
                  </Button>
                </>
              )}

              <PinnedMessagesButton
                chatId={chatId}
                currentUserId={user?.id}
                onNavigateToMessage={(messageId) => {
                  const element = document.querySelector(`[data-message-id="${messageId}"]`);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
              />

              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground rounded-full h-9 w-9 hover:text-primary"
                onClick={() => setIsSearching(!isSearching)}
                title="Search messages"
              >
                <Search className="w-5 h-5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground rounded-full h-9 w-9">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Chat Options</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {chat?.isGroup && (
                    <>
                      <DropdownMenuItem onClick={() => setCreatePollOpen(true)}>
                        <BarChart3 className="w-4 h-4 mr-2" />
                        Create Poll
                      </DropdownMenuItem>
                      {chat?.members.find(m => m.userId === user?.id)?.role === 'admin' && (
                        <DropdownMenuItem onClick={() => setInviteLinksOpen(true)}>
                          <Link2 className="w-4 h-4 mr-2" />
                          Invite Links
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => setBgPickerOpen(true)}>
                    <Paintbrush className="w-4 h-4 mr-2" />
                    Change Background
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleClearHistoryForMe()}>Clear history for me</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleClearHistoryForAll()}>Clear history for everyone</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {!chat?.isGroup && otherMember && (
                    <DropdownMenuItem
                      onClick={() => { blockStatus?.blocked ? handleUnblockUser() : handleBlockUser(); }}
                      className={blockStatus?.blocked ? undefined : 'text-destructive'}
                    >
                      {blockStatus?.blocked ? 'Unblock user' : 'Block user'}
                    </DropdownMenuItem>
                  )}
                  {chat?.isGroup && (
                    <DropdownMenuItem onClick={handleLeaveGroup} className="text-destructive">
                      Leave group
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {chat?.isGroup ? (() => {
                    const effectiveCreator = chat.creatorId || (() => {
                      const admins = (chat.members || [])
                        .filter((m: any) => m.role === 'admin')
                        .sort((a: any, b: any) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());
                      return admins.length > 0 ? admins[0].userId : null;
                    })();
                    return effectiveCreator === user?.id ? (
                      <DropdownMenuItem onClick={() => setDeleteGroupConfirmOpen(true)} className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete group
                      </DropdownMenuItem>
                    ) : null;
                  })() : (
                    <DropdownMenuItem onClick={() => handleDeleteChat()} className="text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete chat
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </header>

      {/* Search Bar */}
      {isSearching && (
        <div className="h-14 glass-panel flex items-center px-4 gap-2 border-b border-border/50">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentMatchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey ? goToPrevMatch() : goToNextMatch();
              }
            }}
            className="flex-1 bg-transparent border-none outline-none text-sm"
            autoFocus
          />
          {allMatches.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {currentMatchIndex + 1} of {allMatches.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                  onClick={goToPrevMatch}
                  disabled={allMatches.length === 0}
                  title="Previous match (Shift+Enter)"
                >
                  <ArrowLeft className="w-4 h-4 rotate-90" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                  onClick={goToNextMatch}
                  disabled={allMatches.length === 0}
                  title="Next match (Enter)"
                >
                  <ArrowLeft className="w-4 h-4 -rotate-90" />
                </Button>
              </div>
            </>
          )}
          {allMatches.length === 0 && searchQuery.trim() && (
            <span className="text-xs text-muted-foreground">No matches</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={() => {
              setIsSearching(false);
              setSearchQuery("");
              setCurrentMatchIndex(0);
            }}
            title="Close search"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide flex flex-col">
        {messages?.length === 0 ? (
          <div className="m-auto text-center p-6 bg-card rounded-2xl shadow-sm border border-border/50 max-w-sm">
            <h3 className="font-semibold mb-1">Say Hello! 👋</h3>
            <p className="text-sm text-muted-foreground">Send a message to start the conversation.</p>
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {messages?.map((msg, idx) => {
                const isMine = msg.senderId === user?.id;
                const showAvatar = !isMine && (!messages[idx - 1] || messages[idx - 1].senderId !== msg.senderId);
                const isSelected = selectedMessages.has(msg.id);
                const isCurrentMatch = isSearching && allMatches.length > 0 && allMatches[currentMatchIndex]?.messageId === msg.id;
                const hasMatch = isSearching && allMatches.some(m => m.messageId === msg.id);
                const currentMsgDate = new Date(msg.createdAt!);
                const previousMsgDate = messages[idx - 1]?.createdAt ? new Date(String(messages[idx - 1].createdAt)) : null;
                const showDateDivider = !previousMsgDate || currentMsgDate.toDateString() !== previousMsgDate.toDateString();
                const dateDividerLabel = isToday(currentMsgDate)
                  ? "Today"
                  : isYesterday(currentMsgDate)
                    ? "Yesterday"
                    : format(currentMsgDate, "MMMM d, yyyy");


                return (
                  <div key={msg.id}>
                    {showDateDivider && (() => {
                      const dividerKey = currentMsgDate.toDateString();
                      return (
                        <div className="flex justify-center my-2">
                          <Popover
                            open={datePickerOpenKey === dividerKey}
                            onOpenChange={(open) => setDatePickerOpenKey(open ? dividerKey : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                className="px-3 py-1 rounded-full text-[11px] font-medium bg-muted/80 text-muted-foreground border border-border/50 hover:bg-muted hover:text-foreground hover:border-border transition-colors cursor-pointer flex items-center gap-1.5"
                                title="Jump to date"
                              >
                                <CalendarDays className="w-3 h-3" />
                                {dateDividerLabel}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="center" sideOffset={8}>
                              <Calendar
                                mode="single"
                                onSelect={handleJumpToDate}
                                disabled={(date) => date > new Date()}
                                defaultMonth={currentMsgDate}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      );
                    })()}
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                      <motion.div
                        data-message-id={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'} cursor-pointer`}
                        onClick={() => { if (selectionMode) toggleMessageSelection(msg.id); }}
                      >
                    {/* Selection checkbox */}
                    {selectionMode && (
                      <div className="flex items-center shrink-0 self-center">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 bg-transparent'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                      </div>
                    )}

                    {!isMine && (
                      <div className="w-8 shrink-0 flex justify-center">
                        {showAvatar && (
                          <Avatar 
                            className="w-8 h-8 border border-border/50 shadow-sm cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!selectionMode) {
                                setProfileUser(msg.sender);
                                setProfileModalOpen(true);
                              }
                            }}
                          >
                            <AvatarImage src={msg.sender?.profileImageUrl || ""} />
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                              {msg.sender?.firstName?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}

                    <div className={`group relative max-w-[75%] md:max-w-[60%] px-4 py-2.5 shadow-sm transition-all
                      ${isMine
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
                        : 'bg-card text-card-foreground rounded-2xl rounded-bl-sm border border-border/50'
                      }
                      ${isSelected ? 'ring-2 ring-primary/50 scale-[0.98]' : ''}
                      ${isCurrentMatch ? 'ring-2 ring-amber-500 scale-[1.02] shadow-lg shadow-amber-500/30' : hasMatch && isSearching ? 'ring-1 ring-amber-400/50' : ''}
                    `}>
                      {/* Sender name in group chats */}
                      {chat?.isGroup && !isMine && showAvatar && (() => {
                        const senderMember = chat.members?.find((m: any) => m.userId === msg.senderId);
                        return (
                          <p className="text-[12px] font-semibold text-primary mb-1">
                            {msg.sender?.firstName || 'Unknown'}
                            {senderMember?.title && (
                              <span className="ml-1.5 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {senderMember.title}
                              </span>
                            )}
                          </p>
                        );
                      })()}

                      {/* Reply preview */}
                      {msg.attachments && msg.attachments.some((a: any) => a.type === 'reply') && (() => {
                        const replyAttachment = msg.attachments.find((a: any) => a.type === 'reply');
                        if (!replyAttachment) return null;
                        try {
                          const replyData = JSON.parse(replyAttachment.url);
                          const repliedMsg = messages?.find(m => m.id === replyData.messageId);
                          const replyContent = repliedMsg?.content || replyData.content || '';
                          const replySenderName = repliedMsg
                            ? (repliedMsg.senderId === user?.id
                              ? [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'You'
                              : repliedMsg.sender?.firstName || 'Unknown')
                            : replyAttachment.name;
                          return (
                            <div
                              className={`mb-2 px-3 py-1.5 rounded-lg border-l-4 cursor-pointer transition-colors
                                ${isMine
                                  ? 'bg-white/10 border-white/40 hover:bg-white/15'
                                  : 'bg-primary/5 border-primary/40 hover:bg-primary/10'
                                }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const el = document.querySelector(`[data-message-id="${replyData.messageId}"]`);
                                if (el) {
                                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  el.classList.add('ring-2', 'ring-primary/50');
                                  setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50'), 2000);
                                }
                              }}
                            >
                              <p className={`text-[11px] font-semibold ${isMine ? 'text-primary-foreground/80' : 'text-primary'}`}>
                                {replySenderName}
                              </p>
                              <p className={`text-[12px] truncate max-w-[200px] ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                {replyContent || '📎 Attachment'}
                              </p>
                            </div>
                          );
                        } catch { return null; }
                      })()}

                      {/* Forwarded message indicator */}
                      {msg.attachments && msg.attachments.some((a: any) => a.type === 'forward') && (() => {
                        const forwardAttachment = msg.attachments.find((a: any) => a.type === 'forward');
                        if (!forwardAttachment) return null;
                        try {
                          const forwardData = JSON.parse(forwardAttachment.url);
                          return (
                            <div
                              className={`mb-2 flex items-center gap-1.5 text-[11px] italic
                                ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}
                            >
                              <Share2 className="w-3 h-3" />
                              <span>Forwarded from <span className="font-semibold not-italic">{forwardAttachment.name}</span></span>
                            </div>
                          );
                        } catch { return null; }
                      })()}

                      {msg.content && !(msg as any).poll && (() => {
                        const emojiOnly = onlyEmoji(msg.content) && !(msg.attachments && msg.attachments.length);
                        if (emojiOnly) {
                          return (
                            <div className="mt-1 flex items-center justify-center space-x-1 text-4xl">
                              {Array.from(msg.content).map((ch, i) => <span key={i}>{ch}</span>)}
                            </div>
                          );
                        }
                        // Apply highlighting only to text content when searching
                        const displayContent = isSearching && allMatches.length > 0
                          ? highlightText(msg.content)
                          : formatMessageContent(msg.content, { onMentionClick: openProfileByUsername });
                        return <div className="text-[15px] leading-relaxed break-words">{displayContent}</div>;
                      })()}

                      {/* Attachments */}
                      {renderAttachments(msg, isMine)}

                      {/* Poll */}
                      {(msg as any).poll && (
                        <div className="mt-2">
                          <PollMessage
                            poll={(msg as any).poll}
                            currentUserId={user?.id}
                            isCreator={isMine}
                            isAdmin={chat?.members.find(m => m.userId === user?.id)?.role === 'admin'}
                          />
                        </div>
                      )}

                      <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {msg.isEdited && (
                          <span className="text-[10px] italic mr-1">edited</span>
                        )}
                        <span className="text-[10px] uppercase font-medium tracking-wider">
                          {new Date(msg.createdAt!).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                        {isMine && (
                          msg.isRead ? (
                            <svg className="w-4 h-4 ml-0.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M1 13l4 4L15 7" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 13l4 4L22 7" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )
                        )}
                      </div>

                      {/* Reactions */}
                      <div className="mt-2 flex flex-wrap gap-1 items-center">
                        {/* Reaction badges */}
                        {msg.reactions && msg.reactions.length > 0 && (() => {
                          const reactionCounts: { [emoji: string]: string[] } = {};
                          msg.reactions.forEach(r => {
                            if (!reactionCounts[r.emoji]) {
                              reactionCounts[r.emoji] = [];
                            }
                            reactionCounts[r.emoji].push(r.userId);
                          });
                          
                          return Object.entries(reactionCounts).map(([emoji, userIds]) => {
                            const userReacted = userIds.includes(user?.id || '');
                            return (
                              <button
                                key={emoji}
                                onClick={() => {
                                  if (userReacted) {
                                    handleRemoveReaction(msg.id, emoji);
                                  } else {
                                    handleAddReaction(msg.id, emoji);
                                  }
                                }}
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all cursor-pointer
                                  ${userReacted 
                                    ? isMine 
                                      ? 'bg-primary-foreground/20 text-primary-foreground' 
                                      : 'bg-primary/20 text-primary' 
                                    : isMine
                                      ? 'bg-foreground/10 text-primary-foreground/70 hover:bg-foreground/20'
                                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                  }
                                `}
                                title={userIds.map(uid => {
                                  const u = messages?.find(m => userIds.includes(m.senderId))?.sender;
                                  return u?.firstName || uid;
                                }).join(', ')}
                              >
                                <span>{emoji}</span>
                                <span className="text-[11px]">{userIds.length}</span>
                              </button>
                            );
                          });
                        })()}

                        {/* Add reaction button removed - use right-click context menu instead */}
                      </div>
                    </div>
                      </motion.div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                      <ContextMenuItem onClick={() => {
                        const senderName = isMine
                          ? [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'You'
                          : msg.sender?.firstName || 'Unknown';
                        setReplyToMessage({
                          id: msg.id,
                          senderName,
                          content: msg.content || (msg.attachments?.length ? '📎 Attachment' : ''),
                          senderId: msg.senderId,
                        });
                        textareaRef.current?.focus();
                      }}>
                        <Reply className="w-4 h-4 mr-2" />
                        Reply
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => {
                        const senderName = isMine
                          ? [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'You'
                          : msg.sender?.firstName || 'Unknown';
                        setForwardMessage({
                          id: msg.id,
                          content: msg.content || '',
                          senderName,
                          attachments: msg.attachments?.filter((a: any) => a.type !== 'reply' && a.type !== 'forward') || [],
                        });
                        setForwardSearchQuery('');
                        setForwardDialogOpen(true);
                      }}>
                        <Share2 className="w-4 h-4 mr-2" />
                        Forward
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => {
                        pinMessage.mutate({ chatId, messageId: msg.id });
                      }}>
                        <Pin className="w-4 h-4 mr-2" />
                        Pin Message
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => {
                        if (!selectionMode) setSelectionMode(true);
                        toggleMessageSelection(msg.id);
                      }}>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Select
                      </ContextMenuItem>
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>
                              <Smile className="w-4 h-4 mr-2" />
                              React
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="p-0 w-64">
                              <div className="flex flex-col">
                                <div className="flex border-b border-border/50">
                                  {EMOJI_CATEGORIES.map((cat, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setSelectedCategory(idx)}
                                      className={`flex-1 py-2 text-center transition-colors ${selectedCategory === idx
                                        ? 'bg-muted text-foreground'
                                        : 'hover:bg-muted/50 text-muted-foreground'
                                      }`}
                                      title={cat.title}
                                    >
                                      {cat.icon}
                                    </button>
                                  ))}
                                </div>
                                <div className="p-2 bg-card/50 grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
                                  {EMOJI_CATEGORIES[selectedCategory].items.map((emoji, i) => (
                                    <button
                                      key={i}
                                      onClick={() => {
                                        handleAddReaction(msg.id, emoji);
                                      }}
                                      className="flex items-center justify-center text-2xl hover:bg-muted rounded transition-colors p-1"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                        </>
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>
                );
              })}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background/80 backdrop-blur-md border-t border-border/50 shrink-0">
        {blockStatus?.blockedBy ? (
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 py-3 text-muted-foreground">
            <Ban className="w-5 h-5 text-destructive/70" />
            <span className="text-sm">You have been blocked by this user.</span>
          </div>
        ) : blockStatus?.blocked ? (
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 py-3 text-muted-foreground">
            <Ban className="w-5 h-5 text-destructive/70" />
            <span className="text-sm">You blocked this user. Unblock to send messages.</span>
          </div>
        ) : (
        <form onSubmit={handleSend} className="max-w-4xl mx-auto space-y-2">
          {/* Reply indicator */}
          {replyToMessage && !editingMessageId && (
            <div className="flex items-center justify-between bg-muted/50 border border-border/50 rounded-lg p-2 px-3">
              <div className="flex items-center gap-2 min-w-0">
                <Reply className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-primary">{replyToMessage.senderName}</span>
                  <p className="text-xs text-muted-foreground truncate max-w-[300px]">{replyToMessage.content || '📎 Attachment'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyToMessage(null)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* Editing indicator */}
          {editingMessageId && (
            <div className="flex items-center justify-between bg-muted/50 border border-border/50 rounded-lg p-2 px-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Editing message</span>
              </div>
              <button
                type="button"
                onClick={cancelEditingMessage}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, idx) => (
                <div key={idx} className="relative flex items-center gap-2 bg-card border border-border/50 rounded-lg p-2 px-3">
                  {file.type === 'sticker' ? (
                    <span className="text-2xl">{file.name}</span>
                  ) : (
                    <>
                      {getFileIcon(file.name, file.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-foreground">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{getFileLabel(file.name)}</p>
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative flex items-end gap-2">
            <div className="flex-1 bg-card border border-border/50 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all flex items-center p-1.5">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); sendTyping(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  if (e.key === 'Escape' && editingMessageId) { e.preventDefault(); cancelEditingMessage(); }
                }}
                placeholder="Write a message..."
                className="w-full max-h-32 min-h-[44px] bg-transparent resize-none border-0 outline-none focus:ring-0 focus:outline-none text-[15px] py-2.5 px-3 scrollbar-hide"
                rows={1}
              />
            </div>

            {/* Sticker picker toggle - hidden when editing */}
            {!editingMessageId && (
            <div className="relative" ref={stickerPickerRef}>
              <button
                type="button"
                onClick={() => setShowStickerPicker(v => !v)}
                className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                <Smile className="w-5 h-5" />
              </button>
              {showStickerPicker && (
                <div className="absolute bottom-full mb-2 right-0 w-[340px] bg-card border border-border/50 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
                  {/* Tab switcher: Emoji | GIF */}
                  <div className="flex border-b border-border/50">
                    <button
                      type="button"
                      className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${stickerTab === 'emoji' ? 'bg-muted text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setStickerTab('emoji')}
                    >
                      😀 Emoji
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${stickerTab === 'gif' ? 'bg-muted text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setStickerTab('gif')}
                    >
                      GIF
                    </button>
                  </div>

                  {stickerTab === 'emoji' ? (
                    <>
                      {/* Category name header */}
                      <div className="px-3 pt-2.5 pb-1">
                        <span className="text-xs font-semibold text-muted-foreground">{EMOJI_CATEGORIES[selectedCategory].title}</span>
                      </div>
                      {/* emoji grid */}
                      <div ref={emojiGridRef} className="px-2 pb-1 overflow-y-auto" style={{ height: '220px' }}>
                        <div className="grid grid-cols-8 gap-0.5">
                          {EMOJI_CATEGORIES[selectedCategory].items.map((emoji, i) => (
                            <button
                              key={`${selectedCategory}-${i}`}
                              type="button"
                              className="w-9 h-9 flex items-center justify-center text-[22px] rounded-lg hover:bg-accent transition-colors"
                              onClick={() => {
                                setInputValue(prev => prev + emoji);
                                setShowStickerPicker(false);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* category icon bar at bottom */}
                      <div className="flex items-center justify-around border-t border-border/50 px-1 py-1.5 bg-accent/30">
                        {EMOJI_CATEGORIES.map((cat, idx) => (
                          <button
                            key={cat.title}
                            type="button"
                            title={cat.title}
                            className={`w-8 h-8 flex items-center justify-center text-lg rounded-lg transition-colors ${
                              selectedCategory === idx
                                ? 'bg-primary/15 scale-110'
                                : 'hover:bg-accent opacity-70 hover:opacity-100'
                            }`}
                            onClick={() => {
                              setSelectedCategory(idx);
                              emojiGridRef.current?.scrollTo(0, 0);
                            }}
                          >
                            {cat.icon}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* GIF search input */}
                      <div className="px-2 pt-2 pb-1">
                        <input
                          type="text"
                          placeholder="Search GIFs..."
                          value={gifSearchQuery}
                          onChange={(e) => setGifSearchQuery(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm bg-muted rounded-lg border-0 outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                        />
                      </div>
                      {/* GIF grid */}
                      <div ref={gifScrollRef} onScroll={handleGifScroll} className="px-2 pb-2 overflow-y-auto" style={{ height: '240px' }}>
                        {gifResults.length === 0 && gifLoading ? (
                          <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : gifResults.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                            {gifSearchQuery.trim() ? 'No GIFs found' : 'Search for GIFs'}
                          </div>
                        ) : (
                          <>
                          <div className="grid grid-cols-2 gap-1.5">
                            {gifResults.map((gif) => (
                              <button
                                key={gif.id}
                                type="button"
                                className="rounded-lg overflow-hidden hover:opacity-80 transition-opacity bg-muted relative group"
                                onClick={() => {
                                  // Send GIF as mp4 video attachment for performance
                                  const sendUrl = gif.mp4 || gif.url;
                                  const sendType = gif.mp4 ? 'video/mp4' : 'image/gif';
                                  sendMessage.mutate({
                                    chatId,
                                    content: '',
                                    attachments: [{ name: gif.title || 'GIF', url: sendUrl, type: sendType }],
                                  });
                                  setShowStickerPicker(false);
                                  setGifSearchQuery('');
                                }}
                              >
                                <video
                                  src={gif.mp4 || gif.url}
                                  className="w-full h-24 object-cover"
                                  loop
                                  muted
                                  autoPlay
                                  playsInline
                                  preload="metadata"
                                  disablePictureInPicture
                                  disableRemotePlayback
                                  controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
                                />
                              </button>
                            ))}
                          </div>
                          {gifLoading && (
                            <div className="flex items-center justify-center py-3">
                              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                          )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Unified record button with mode picker - hidden when editing */}
            {!editingMessageId && (
              recording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  disabled={uploading}
                  className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative"
                  title="Stop recording"
                >
                  <StopCircle className="w-5 h-5 text-red-500" />
                  <span className="absolute -top-1 -right-1 bg-red-500 rounded-full w-2 h-2 animate-pulse" />
                </button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={uploading}
                      className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Record message"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>Record message</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => startRecording('audio')} className="gap-2">
                      <Mic className="w-4 h-4" />
                      Audio message
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => startRecording('video')} className="gap-2">
                      <Video className="w-4 h-4" />
                      Video message
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <ScreenShare className="w-4 h-4" />
                        Screen recording
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56">
                        <DropdownMenuItem onClick={() => startRecording('screen', { includeMicrophone: false, includeCamera: false })}>
                          Screen only
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startRecording('screen', { includeMicrophone: true, includeCamera: false })}>
                          Screen + voice
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startRecording('screen', { includeMicrophone: false, includeCamera: true })}>
                          Screen + camera
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startRecording('screen', { includeMicrophone: true, includeCamera: true })}>
                          Screen + voice + camera
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            )}

            {/* File upload button - hidden when editing */}
            {!editingMessageId && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>
            )}

            {!editingMessageId && (
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            )}

            <Button
              type="submit"
              size="icon"
              disabled={editingMessageId ? !inputValue.trim() || editMessage.isPending : (!inputValue.trim() && attachments.length === 0) || sendMessage.isPending}
              className="h-12 w-12 rounded-full shrink-0 bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none"
              title={editingMessageId ? "Save changes" : "Send message"}
            >
              {editingMessageId ? (
                editMessage.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />
              ) : (
                sendMessage.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />
              )}
            </Button>
            {recording && (
              <div className="absolute bottom-full mb-1 text-xs text-red-500">
                {formatRecordTime(recordTime)}
              </div>
            )}
          </div>
        </form>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogOpen(false);
          setPendingDeleteItems([]);
        }
      }}>
        <DialogContent className="sm:max-w-md" aria-describedby="delete-dialog-description">
          <DialogHeader>
            <DialogTitle>Delete {pendingDeleteItems.length} message{pendingDeleteItems.length !== 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription id="delete-dialog-description">
              {hasOwnInDelete
                ? "Choose how you want to delete the selected message(s)."
                : "You can only delete other people's messages for yourself."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {hasOwnInDelete && (
              <Button
                variant="destructive"
                onClick={() => executeDelete(true)}
                className="w-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete for everyone
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => executeDelete(false)}
              className="w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete for me
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setDeleteDialogOpen(false); setPendingDeleteItems([]); }}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Forward message dialog */}
      <Dialog open={forwardDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setForwardDialogOpen(false);
          setForwardMessage(null);
          setForwardSearchQuery('');
        }
      }}>
        <DialogContent className="sm:max-w-md" aria-describedby="forward-dialog-description">
          <DialogHeader>
            <DialogTitle>Forward message</DialogTitle>
            <DialogDescription id="forward-dialog-description">
              Choose a chat to forward this message to.
            </DialogDescription>
          </DialogHeader>
          {/* Forward message preview */}
          {forwardMessage && (
            <div className="px-3 py-2 rounded-lg bg-muted/50 border border-border/50 mb-2">
              <p className="text-[11px] font-semibold text-primary">{forwardMessage.senderName}</p>
              <p className="text-sm text-foreground/80 truncate">{forwardMessage.content || '📎 Attachment'}</p>
            </div>
          )}
          {/* Search chats */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search chats..."
              value={forwardSearchQuery}
              onChange={(e) => setForwardSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>
          {/* Chat list */}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {allChats
              ?.filter((c) => {
                if (!forwardSearchQuery.trim()) return true;
                const q = forwardSearchQuery.toLowerCase();
                const chatName = c.isGroup
                  ? c.name || 'Group Chat'
                  : c.members
                      .filter((m) => m.userId !== user?.id)
                      .map((m) => [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' '))
                      .join(', ') || 'Chat';
                return chatName.toLowerCase().includes(q);
              })
              .map((c) => {
                const chatName = c.isGroup
                  ? c.name || 'Group Chat'
                  : c.members
                      .filter((m) => m.userId !== user?.id)
                      .map((m) => [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' '))
                      .join(', ') || 'Chat';
                const chatAvatar = c.isGroup
                  ? c.avatarUrl
                  : c.members.find((m) => m.userId !== user?.id)?.user?.profileImageUrl;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (!forwardMessage) return;
                      // Build forwarded attachments: include the forward tag + original attachments
                      const fwdAttachments: any[] = [
                        {
                          type: 'forward',
                          name: forwardMessage.senderName,
                          url: JSON.stringify({ originalMessageId: forwardMessage.id }),
                        },
                        ...(forwardMessage.attachments || []),
                      ];
                      const targetChatId = c.id;
                      sendMessage.mutate({
                        chatId: targetChatId,
                        content: forwardMessage.content,
                        attachments: fwdAttachments,
                      }, {
                        onSuccess: () => {
                          // Navigate to the target chat
                          navigate(`/chat/${targetChatId}`);
                        },
                      });
                      setForwardDialogOpen(false);
                      setForwardMessage(null);
                      setForwardSearchQuery('');
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted/80 transition-colors text-left"
                  >
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarImage src={chatAvatar || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {chatName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{chatName}</p>
                    </div>
                    <Share2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            {allChats && allChats.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No chats found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* User Profile Modal */}
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          open={profileModalOpen}
          onOpenChange={setProfileModalOpen}
          onCall={(type) => {
            if (profileUser.id && chat) {
              call.startCall(
                {
                  userId: profileUser.id,
                  name: [profileUser.firstName, profileUser.lastName].filter(Boolean).join(' ') || profileUser.email || 'Unknown',
                  avatarUrl: profileUser.profileImageUrl,
                },
                chat.id,
                type === 'video' ? 'video' : 'audio',
                [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Unknown',
                user?.profileImageUrl
              );
              setProfileModalOpen(false);
            }
          }}
        />
      )}

      {/* Group Info Dialog */}
      {chat?.isGroup && (
        <GroupInfoDialog
          open={groupInfoOpen}
          onOpenChange={setGroupInfoOpen}
          chat={chat}
          currentUserId={user?.id}
          onViewProfile={(u: any) => { setProfileUser(u); setProfileModalOpen(true); }}
          addGroupMembers={addGroupMembers}
          removeGroupMember={removeGroupMember}
          updateGroupChat={updateGroupChat}
          leaveGroup={leaveGroup}
          onLeave={() => navigate('/')}
        />
      )}

      {/* Create Poll Dialog */}
      {chat?.isGroup && (
        <CreatePollDialog
          open={createPollOpen}
          onOpenChange={setCreatePollOpen}
          chatId={chatId}
        />
      )}

      {/* Group Invite Links Dialog */}
      {chat?.isGroup && (
        <GroupInviteLinksDialog
          open={inviteLinksOpen}
          onOpenChange={setInviteLinksOpen}
          chatId={chatId}
        />
      )}

      {/* Background Picker Dialog */}
      <BackgroundPicker
        open={bgPickerOpen}
        onOpenChange={setBgPickerOpen}
        currentBgId={chatBgId}
        onSelect={(bgId) => {
          setChatBgId(bgId);
          setChatBackground(chatId, bgId);
        }}
        customImageUrl={customBgUrl}
        onCustomImage={(url) => {
          setCustomBackgroundUrl(chatId, url);
          setCustomBgUrl(url);
          setChatBgId("custom-image");
          setChatBackground(chatId, "custom-image");
        }}
        onRemoveCustomImage={() => {
          removeCustomBackground(chatId);
          setCustomBgUrl(null);
          setChatBgId("default");
        }}
      />

      {/* Delete Group Confirmation Dialog */}
      <Dialog open={deleteGroupConfirmOpen} onOpenChange={setDeleteGroupConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this group? All messages, members, and group data will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteGroupConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteGroup}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}