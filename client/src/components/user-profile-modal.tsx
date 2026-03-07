import { useState, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Video, MessageCircle, Download, Play, Pause, Mic, ScreenShare, Image as ImageIcon, Film, FileText, File as FileIcon, Maximize } from "lucide-react";
import type { User } from "@shared/models/auth";
import { useMessages } from "@/hooks/use-messages";
import { useChats } from "@/hooks/use-chats";

type VoiceVideoItem = {
  id: number;
  url: string;
  name: string;
  type: string;
  createdAt: any;
  senderName: string;
};

function VoiceVideoTab({ items, onJumpToMessage }: { items: VoiceVideoItem[]; onJumpToMessage?: (messageId: number) => void }) {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<Record<number, number>>({});
  const [duration, setDuration] = useState<Record<number, number>>({});
  const mediaRefs = useRef<Record<number, HTMLAudioElement | HTMLVideoElement>>({});

  const togglePlay = (id: number) => {
    const element = mediaRefs.current[id];
    if (!element) return;

    if (playingId === id) {
      element.pause();
      setPlayingId(null);
      return;
    }

    if (playingId !== null && mediaRefs.current[playingId]) {
      mediaRefs.current[playingId].pause();
    }

    element.play();
    setPlayingId(id);
  };

  const handleTimeUpdate = (id: number, element: HTMLAudioElement | HTMLVideoElement) => {
    setCurrentTime((prev) => ({ ...prev, [id]: element.currentTime }));
  };

  const handleLoadedMetadata = (id: number, element: HTMLAudioElement | HTMLVideoElement) => {
    setDuration((prev) => ({ ...prev, [id]: element.duration }));
  };

  const handleEnded = (id: number) => {
    setPlayingId(null);
    setCurrentTime((prev) => ({ ...prev, [id]: 0 }));
  };

  const openFullscreen = (id: number) => {
    const element = mediaRefs.current[id];
    if (!(element instanceof HTMLVideoElement)) return;

    if (element.requestFullscreen) {
      element.requestFullscreen();
      return;
    }

    const anyElement = element as any;
    if (anyElement.webkitRequestFullscreen) {
      anyElement.webkitRequestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || Number.isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (items.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-muted-foreground">
          <Mic className="w-12 h-12 mx-auto mb-2 opacity-20" />
          <p>No voice or video messages yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="space-y-3">
        {items.map((item) => {
          const isAudio = item.name?.startsWith("audio-");
          const isScreen = item.name?.startsWith("screen-");
          const Icon = isAudio ? Mic : isScreen ? ScreenShare : Video;
          const label = isAudio ? "Audio Message" : isScreen ? "Screen Recording" : "Video Message";
          const isPlaying = playingId === item.id;
          const time = currentTime[item.id] || 0;
          const dur = duration[item.id] || 0;

          return (
            <div key={`${item.id}-${item.url}`} className="rounded-lg border border-border overflow-hidden cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => onJumpToMessage?.(item.id)}>
              <div className="flex items-center gap-3 p-3 bg-accent/20">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.senderName} • {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); togglePlay(item.id); }}>
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  {!isAudio && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); openFullscreen(item.id); }}>
                      <Maximize className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      const a = document.createElement("a");
                      a.href = item.url;
                      a.download = item.name;
                      a.click();
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="px-3 pb-3">
                {isAudio ? (
                  <audio
                    ref={(el) => {
                      if (el) mediaRefs.current[item.id] = el;
                    }}
                    src={item.url}
                    onTimeUpdate={(e) => handleTimeUpdate(item.id, e.currentTarget)}
                    onLoadedMetadata={(e) => handleLoadedMetadata(item.id, e.currentTarget)}
                    onEnded={() => handleEnded(item.id)}
                    className="w-full"
                  />
                ) : (
                  <video
                    ref={(el) => {
                      if (el) mediaRefs.current[item.id] = el;
                    }}
                    src={item.url}
                    onTimeUpdate={(e) => handleTimeUpdate(item.id, e.currentTarget)}
                    onLoadedMetadata={(e) => handleLoadedMetadata(item.id, e.currentTarget)}
                    onEnded={() => handleEnded(item.id)}
                    className="w-full rounded-lg"
                    controls={false}
                  />
                )}

                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground min-w-[35px]">{formatTime(time)}</span>
                  <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${dur > 0 ? (time / dur) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground min-w-[35px]">{formatTime(dur)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UserProfileModal({ 
  user, 
  open, 
  onOpenChange,
  onCall,
  onMessage,
  currentUserId,
  onJumpToMessage
}: { 
  user: User | null; 
  open: boolean; 
  onOpenChange: (o: boolean) => void;
  onCall?: (type: 'audio' | 'video') => void;
  onMessage?: () => void;
  currentUserId?: string;
  onJumpToMessage?: (messageId: number) => void;
}) {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'voice-video' | 'media' | 'documents'>('general');
  
  // Get all chats to find the direct chat with this user
  const { data: allChats = [] } = useChats();
  
  // Find the direct chat between current user and profile user
  const directChatId = useMemo(() => {
    if (!user || !currentUserId) return null;
    
    const directChat = allChats.find(chat => 
      !chat.isGroup && 
      chat.members?.some(m => m.userId === user.id)
    );
    
    return directChat?.id || null;
  }, [user, currentUserId, allChats]);
  
  // Fetch messages from the direct chat
  const { data: messages = [] } = useMessages(directChatId);
  
  // Categorize ALL attachments from ALL messages (both users)
  const mediaData = useMemo(() => {
    if (!messages) return { audioVideo: [], media: [], documents: [] };
    
    const audioVideo: Array<{ id: number; url: string; name: string; type: string; createdAt: any; senderName: string }> = [];
    const media: Array<{ id: number; url: string; name: string; type: string; createdAt: any; senderName: string }> = [];
    const documents: Array<{ id: number; url: string; name: string; type: string; createdAt: any; senderName: string; size?: number }> = [];
    
    messages.forEach(msg => {
      if (!msg.attachments) return;
      
      const senderName = msg.sender 
        ? [msg.sender.firstName, msg.sender.lastName].filter(Boolean).join(' ') || msg.sender.email || 'Unknown'
        : 'Unknown';
      
      msg.attachments.forEach((att: any) => {
        const mimeType = att.type || '';
        const fileExt = att.name?.split('.').pop()?.toLowerCase() || '';
        const isGif = att.name === 'GIF' || fileExt === 'gif';
        
        // Check if it's a recorded audio/video/screen message
        const isRecordedAudio = att.name?.startsWith('audio-') && fileExt === 'webm';
        const isRecordedVideo = att.name?.startsWith('video-') && fileExt === 'webm';
        const isScreenShare = att.name?.startsWith('screen-') && fileExt === 'webm';
        
        if (isRecordedAudio || isRecordedVideo || isScreenShare) {
          audioVideo.push({
            id: msg.id,
            url: att.url,
            name: att.name,
            type: att.type,
            createdAt: msg.createdAt,
            senderName
          });
        } else if (!isGif && (mimeType.startsWith('image/') || mimeType.startsWith('video/'))) {
          media.push({
            id: msg.id,
            url: att.url,
            name: att.name,
            type: att.type,
            createdAt: msg.createdAt,
            senderName
          });
        } else if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/') && !mimeType.startsWith('audio/')) {
          // It's a document/file
          documents.push({
            id: msg.id,
            url: att.url,
            name: att.name,
            type: att.type,
            createdAt: msg.createdAt,
            senderName
          });
        }
      });
    });
    
    // Sort by date (newest first)
    audioVideo.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    media.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    documents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return { audioVideo, media, documents };
  }, [messages]);
  
  if (!user) return null;

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Unknown";
  
  const formatBirthday = (birthday: string | undefined) => {
    if (!birthday) return null;
    const date = new Date(birthday);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl max-h-[90vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="p-6 bg-gradient-to-b from-primary/10 to-transparent border-b border-border/50">
          <div className="flex flex-col items-center gap-4">
            <Avatar 
              className="w-24 h-24 border-4 border-background shadow-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => user.profileImageUrl && setPreviewImageUrl(user.profileImageUrl)}
            >
              <AvatarImage src={user.profileImageUrl || ""} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <DialogTitle className="text-2xl">{displayName}</DialogTitle>
              {user.username && (
                <p className="text-sm text-primary mt-1">@{user.username}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 border-b border-border overflow-x-auto">
            <button
              onClick={() => setActiveTab('general')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'general'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              General
            </button>
            {directChatId && (
              <>
                <button
                  onClick={() => setActiveTab('voice-video')}
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === 'voice-video'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Voice & Video ({mediaData.audioVideo.length})
                </button>
                <button
                  onClick={() => setActiveTab('media')}
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === 'media'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Media ({mediaData.media.length})
                </button>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === 'documents'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Documents ({mediaData.documents.length})
                </button>
              </>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'general' && (
            <div className="p-6 space-y-4">
              {/* Bio */}
              {user.bio && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-1">Bio</h3>
                  <p className="text-sm">{user.bio}</p>
                </div>
              )}

              {/* Birthday */}
              {user.birthday && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-1">Birthday</h3>
                  <p className="text-sm">{formatBirthday(user.birthday)}</p>
                </div>
              )}

              {/* Status */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-1">Status</h3>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    user.status === 'online' ? 'bg-green-500' :
                    user.status === 'away' ? 'bg-yellow-500' :
                    'bg-gray-500'
                  }`} />
                  <p className="text-sm capitalize">{user.status || 'offline'}</p>
                </div>
              </div>

              {/* Action Buttons */}
              {(onCall || onMessage) && (
                <div className="flex gap-2 pt-4 flex-wrap">
                  {onMessage && (
                    <Button 
                      onClick={() => {
                        onMessage();
                        onOpenChange(false);
                      }}
                      variant="default"
                      className="flex-1 rounded-lg"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Message
                    </Button>
                  )}
                  {onCall && (
                    <>
                      <Button 
                        onClick={() => {
                          onCall('audio');
                          onOpenChange(false);
                        }}
                        variant="default"
                        className="flex-1 rounded-lg"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Call
                      </Button>
                      <Button 
                        onClick={() => {
                          onCall('video');
                          onOpenChange(false);
                        }}
                        variant="default"
                        className="flex-1 rounded-lg"
                      >
                        <Video className="w-4 h-4 mr-2" />
                        Video
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'voice-video' && (
            <VoiceVideoTab items={mediaData.audioVideo} onJumpToMessage={onJumpToMessage} />
          )}

          {activeTab === 'media' && (
            <div className="p-6">
              {mediaData.media.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>No media shared yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {mediaData.media.map((item) => {
                    const isVideo = item.type?.startsWith('video/');
                    
                    return (
                      <div
                        key={`${item.id}-${item.url}`}
                        className="aspect-square relative rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-border group"
                      >
                        <div onClick={() => onJumpToMessage?.(item.id)} className="w-full h-full">
                          {isVideo ? (
                            <>
                              <video
                                src={item.url}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                <Film className="w-8 h-8 text-white" />
                              </div>
                            </>
                          ) : (
                            <img
                              src={item.url}
                              alt="Media"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="p-6">
              {mediaData.documents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>No documents shared yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mediaData.documents.map((item) => {
                    const fileExt = item.name?.split('.').pop()?.toUpperCase() || 'FILE';
                    
                    return (
                      <div key={`${item.id}-${item.url}`} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => onJumpToMessage?.(item.id)}>
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.senderName} • {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={(e) => { e.stopPropagation(); window.open(item.url, '_blank'); }}
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              const a = document.createElement('a');
                              a.href = item.url;
                              a.download = item.name;
                              a.click();
                            }}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Media Preview Dialog */}
    <Dialog open={!!previewImageUrl} onOpenChange={(open) => { if (!open) setPreviewImageUrl(null); }}>
      <DialogContent className="sm:max-w-[800px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl" aria-describedby={undefined}>
        <DialogHeader className="p-4 border-b border-border/50">
          <DialogTitle>Media Preview</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center bg-black/90 p-8">
          {previewImageUrl && (
            <>
              {previewImageUrl.match(/\.(mp4|webm|mov|avi)$/i) || previewImageUrl.includes('video') ? (
                <video 
                  src={previewImageUrl} 
                  controls
                  className="max-w-full max-h-[70vh] rounded-lg"
                />
              ) : (
                <img 
                  src={previewImageUrl} 
                  alt="Media Preview" 
                  className="max-w-full max-h-[70vh] rounded-lg"
                />
              )}
            </>
          )}
        </div>
        <div className="p-4 flex justify-between">
          <Button 
            variant="ghost" 
            className="rounded-xl"
            onClick={() => {
              const a = document.createElement('a');
              a.href = previewImageUrl || '';
              a.download = 'media';
              a.click();
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          <Button variant="ghost" className="rounded-xl" onClick={() => setPreviewImageUrl(null)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
