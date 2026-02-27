import { useEffect, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, MoreVertical, Loader2, Paperclip, X, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChat, useBlockStatus, useBlockUser, useUnblockUser } from "@/hooks/use-chats";
import { useMessages, useSendMessage, useMarkMessagesRead, useDeleteMessages } from "@/hooks/use-messages";
import { useUserStatus, formatLastSeen } from "@/hooks/use-user-status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";

export function ChatWindow({ chatId }: { chatId: number }) {
  const { user } = useAuth();
  const { isMobile } = useSidebar();
  const [, navigate] = useLocation();
  const { data: chat, isLoading: chatLoading } = useChat(chatId);
  const { data: messages, isLoading: messagesLoading } = useMessages(chatId);
  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesRead();
  const deleteMessages = useDeleteMessages(chatId);
  
  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState<Array<{name: string; url: string; type: string}>>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    // Mark as read when viewing
    if (chatId) {
      markRead.mutate(chatId);
    }
  }, [messages?.length, chatId]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() && attachments.length === 0) return;
    
    sendMessage.mutate({ 
      chatId, 
      content: inputValue.trim(),
      attachments: attachments.length > 0 ? attachments : undefined
    }, {
      onSuccess: () => {
        setInputValue("");
        setAttachments([]);
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

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const data = await response.json();
        
        setAttachments((prev) => [...prev, {
          name: data.name,
          url: data.url,
          type: data.type,
        }]);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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

  // Real-time online/offline status for the other user in a direct chat
  const otherMember = chat?.members?.find((m: any) => m.userId !== user?.id);
  const statusInfo = useUserStatus(otherMember?.userId);
  const statusText = formatLastSeen(
    statusInfo,
    otherMember?.user?.status,
    otherMember?.user?.lastSeen,
  );

  const handleClearHistoryForMe = async () => {
    if (!confirm("Clear all chat history from your view only?")) return;
    try {
      const response = await fetch(`/api/chats/${chatId}/clear-for-me`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const msg = data.cleared != null ? ` (${data.cleared} messages)` : '';
        alert("Chat history cleared for you" + msg);
        window.location.reload();
      } else {
        const text = await response.text();
        alert("Failed to clear history: " + response.status + " " + text);
      }
    } catch (err) {
      console.error("Error clearing history:", err);
      alert("Failed to clear history");
    }
  };

  const handleClearHistoryForAll = async () => {
    if (!confirm("This will remove every message from your view and delete your own messages for the other person. Proceed?")) return;
    try {
      const response = await fetch(`/api/chats/${chatId}/clear-for-all`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        alert("Conversation cleared for you and your messages removed for the other user");
        window.location.reload();
      } else {
        const text = await response.text();
        alert("Failed to clear history: " + response.status + " " + text);
      }
    } catch (err) {
      console.error("Error clearing history:", err);
      alert("Failed to clear history");
    }
  };

  const handleDeleteChat = async () => {
    if (!confirm("Delete this chat? This action cannot be undone.")) return;
    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        navigate('/');
      }
    } catch (err) {
      console.error("Error deleting chat:", err);
      alert("Failed to delete chat");
    }
  };

  const { data: blockStatus } = useBlockStatus(otherMember?.userId);
  const blockMut = useBlockUser();
  const unblockMut = useUnblockUser();

  const handleBlockUser = async () => {
    if (!otherMember) return;
    if (confirm('Are you sure you want to block this user?')) {
      blockMut.mutate(otherMember.userId, {
        onSuccess: () => {
          alert('User blocked');
          navigate('/');
        }
      });
    }
  };

  const handleUnblockUser = async () => {
    if (!otherMember) return;
    unblockMut.mutate(otherMember.userId, {
      onSuccess: () => {
        alert('User unblocked');
      }
    });
  };

  const toggleMessageSelection = (messageId: number) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      // Exit selection mode if nothing selected
      if (next.size === 0) {
        setSelectionMode(false);
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedMessages.size === 0) return;

    // build list of items with forAll flag
    const items: Array<{ id: number; forAll: boolean }> = [];
    let ownCount = 0;
    selectedMessages.forEach(id => {
      const msg = messages?.find(m => m.id === id);
      const isMine = msg?.senderId === user?.id;
      // default forAll true for your own messages; will adjust below if needed
      items.push({ id, forAll: !!isMine });
      if (isMine) ownCount += 1;
    });
    const otherCount = items.length - ownCount;

    // determine what prompt to show and possibly adjust flags
    if (otherCount === 0) {
      // only our own messages – ask user if they want to remove for everyone or just self
      const deleteForEveryone = confirm(
        `You are deleting ${items.length} message(s).
OK will remove them for everyone, Cancel will keep them visible to others and only delete for you.`
      );
      items.forEach(i => (i.forAll = deleteForEveryone));
      if (!deleteForEveryone && items.length === 0) return; // just guard
    } else if (ownCount === 0) {
      // only others' messages – just remove for self
      if (!confirm(`Delete ${items.length} message(s) for yourself? You cannot remove other users' messages.`)) return;
      // all flags are already false
    } else {
      // mix of your own and others
      if (!confirm(`Delete ${ownCount} of your messages for everyone and ${otherCount} messages just for yourself?`)) return;
      // flags already set correctly
    }

    deleteMessages.mutate(items, {
      onSuccess: () => {
        setSelectedMessages(new Set());
        setSelectionMode(false);
      }
    });
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

  const displayName = getChatDisplayName();
  const avatarUrl = getChatAvatar();

  return (
    <div className="flex-1 flex flex-col h-screen relative bg-[#f8f9fa] dark:bg-[#0e1621] overflow-hidden">
      {/* Telegram-style subtle pattern background could go here */}
      
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
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {isMobile && <SidebarTrigger className="mr-1 -ml-2" />}
          
          <Avatar className="w-10 h-10 border border-border/50">
            <AvatarImage src={avatarUrl || ""} />
            <AvatarFallback className="bg-primary/10 text-primary font-medium">{displayName?.[0] || 'U'}</AvatarFallback>
          </Avatar>
          
          <div className="flex flex-col">
            <h2 className="font-semibold text-[15px] leading-tight text-foreground">{displayName}</h2>
            <span className={`text-[12px] ${!chat.isGroup && statusText === 'online' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
              {chat.isGroup ? `${chat.members.length} members` : statusText}
            </span>
          </div>
        </div>
        
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground rounded-full h-9 w-9">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Chat Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleClearHistoryForMe()}>
                Clear history for me
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleClearHistoryForAll()}>
                Clear history for everyone
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {!chat?.isGroup && otherMember && (
                <DropdownMenuItem
                  onClick={() => {
                    if (blockStatus?.blocked) {
                      handleUnblockUser();
                    } else {
                      handleBlockUser();
                    }
                  }}
                  className={blockStatus?.blocked ? undefined : 'text-destructive'}
                >
                  {blockStatus?.blocked ? 'Unblock user' : 'Block user'}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleDeleteChat()} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
          </>
        )}
      </header>

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
                
                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'} cursor-pointer`}
                    onClick={() => {
                      if (selectionMode) {
                        toggleMessageSelection(msg.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!selectionMode) {
                        setSelectionMode(true);
                      }
                      toggleMessageSelection(msg.id);
                    }}
                  >
                    {/* Selection checkbox */}
                    {selectionMode && (
                      <div className="flex items-center shrink-0 self-center">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected 
                            ? 'bg-primary border-primary text-primary-foreground' 
                            : 'border-muted-foreground/40 bg-transparent'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                      </div>
                    )}

                    {!isMine && (
                      <div className="w-8 shrink-0 flex justify-center">
                        {showAvatar && (
                          <Avatar className="w-8 h-8 border border-border/50 shadow-sm">
                            <AvatarImage src={msg.sender?.profileImageUrl || ""} />
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                              {msg.sender?.firstName?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}
                    
                    <div className={`relative max-w-[75%] md:max-w-[60%] px-4 py-2.5 shadow-sm transition-all
                      ${isMine 
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm' 
                        : 'bg-card text-card-foreground rounded-2xl rounded-bl-sm border border-border/50'
                      }
                      ${isSelected ? 'ring-2 ring-primary/50 scale-[0.98]' : ''}
                    `}
                    >
                      <p className="text-[15px] leading-relaxed break-words">{msg.content}</p>
                      
                      {/* Attachments */}
                      {(msg as any).attachments && (msg as any).attachments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-current border-opacity-20 space-y-2">
                          {(msg as any).attachments.map((file: any, idx: number) => {
                            const isImage = file.type.startsWith('image/');
                            const isVideo = file.type.startsWith('video/');
                            const isAudio = file.type.startsWith('audio/');
                            
                            if (isImage) {
                              return (
                                <a
                                  key={idx}
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
                                >
                                  <img
                                    src={file.url}
                                    alt={file.name}
                                    className="max-w-xs max-h-96 rounded-lg"
                                  />
                                </a>
                              );
                            } else if (isVideo) {
                              return (
                                <video
                                  key={idx}
                                  src={file.url}
                                  controls
                                  className="max-w-xs rounded-lg"
                                />
                              );
                            } else if (isAudio) {
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 p-3 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors max-w-xs"
                                >
                                  <audio
                                    src={file.url}
                                    controls
                                    className="flex-1 h-8"
                                  />
                                  <a
                                    href={file.url}
                                    download={file.name}
                                    className="p-1 rounded hover:bg-black/20 dark:hover:bg-white/20"
                                    title="Download audio"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                  </a>
                                </div>
                              );
                            } else {
                              return (
                                <a
                                  key={idx}
                                  href={file.url}
                                  download={file.name}
                                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{file.name}</p>
                                  </div>
                                </a>
                              );
                            }
                          })}
                        </div>
                      )}
                      
                      <div className={`flex items-center justify-end gap-1 mt-1 
                        ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                      >
                        <span className="text-[10px] uppercase font-medium tracking-wider">
                          {new Date(msg.createdAt!).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                        {/* Fake double check for visual flair */}
                        {isMine && (
                          <svg className="w-3 h-3 ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background/80 backdrop-blur-md border-t border-border/50 shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto space-y-2">
          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, idx) => (
                <div key={idx} className="relative flex items-center gap-2 bg-card border border-border/50 rounded-lg p-2 px-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.type.split("/")[1]}</p>
                  </div>
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
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Write a message..."
                className="w-full max-h-32 min-h-[44px] bg-transparent resize-none border-0 focus:ring-0 text-[15px] py-2.5 px-3 scrollbar-hide"
                rows={1}
              />
            </div>

            {/* File upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            />

            <Button 
              type="submit" 
              size="icon" 
              disabled={(!inputValue.trim() && attachments.length === 0) || sendMessage.isPending}
              className="h-12 w-12 rounded-full shrink-0 bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none"
            >
              {sendMessage.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
