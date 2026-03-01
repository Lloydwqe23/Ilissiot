import { useEffect, useRef, useState, ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, MoreVertical, Loader2, Paperclip, X, Trash2, CheckCircle2, Smile, Phone, Video, Mic, StopCircle, Ban } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChat, useBlockStatus, useBlockUser, useUnblockUser } from "@/hooks/use-chats";
import { useMessages, useSendMessage, useMarkMessagesRead, useDeleteMessages } from "@/hooks/use-messages";
import { useUserStatus, formatLastSeen } from "@/hooks/use-user-status";
import { useCall } from "@/hooks/use-call";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";

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

export function ChatWindow({ chatId }: { chatId: number }) {
  const { user } = useAuth();
  const { isMobile } = useSidebar();
  const [, navigate] = useLocation();
  const { data: chat, isLoading: chatLoading } = useChat(chatId);
  const { data: messages, isLoading: messagesLoading } = useMessages(chatId);
  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesRead();
  const deleteMessages = useDeleteMessages(chatId);
  const call = useCall();

  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState<Array<{name: string; url: string; type: string}>>([]);
  const [uploading, setUploading] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const emojiGridRef = useRef<HTMLDivElement>(null);

  // recording state
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0); // ms
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

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
  const renderAttachments = (msg: any) => {
    const files: any[] = msg.attachments || [];
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
      <div className="mt-3 pt-3 border-t border-current border-opacity-20 space-y-2">
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
                <img src={file.url} alt={file.name} className="max-w-xs max-h-96 rounded-lg" />
              </a>
            );
          } else if (isVideo) {
            return <video key={idx} src={file.url} controls className="max-w-xs rounded-lg" />;
          } else if (isAudio) {
            return (
              <div
                key={idx}
                className="flex items-center gap-2 p-3 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors max-w-xs"
              >
                <audio src={file.url} controls className="flex-1 h-8" />
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
    );
  };

  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    };
  }, []);

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        // stop timer
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setRecording(false);
        setRecordTime(0);

        // stop the stream tracks so microphone is released
        stream.getTracks().forEach(t => t.stop());

        const blob = new Blob(recordedChunksRef.current, { type: recordedChunksRef.current[0]?.type || 'audio/webm' });
        if (blob.size === 0) return;

        // create file and upload
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        await uploadAndSendAudio(file);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      // simple timer
      const start = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        setRecordTime(Date.now() - start);
      }, 250);
    } catch (err) {
      console.error("Recording failed", err);
      alert("Unable to access microphone");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  const formatRecordTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const uploadAndSendAudio = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      const attachment = { name: data.name, url: data.url, type: data.type };
      // send message immediately
      sendMessage.mutate({ chatId, content: '', attachments: [attachment] });
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload audio');
    } finally {
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

  const handleDeleteSelected = () => {
    if (selectedMessages.size === 0) return;

    const items: Array<{ id: number; forAll: boolean }> = [];
    let ownCount = 0;
    selectedMessages.forEach(id => {
      const msg = messages?.find(m => m.id === id);
      const isMine = msg?.senderId === user?.id;
      items.push({ id, forAll: !!isMine });
      if (isMine) ownCount += 1;
    });
    const otherCount = items.length - ownCount;

    if (otherCount === 0) {
      const deleteForEveryone = confirm(
        `You are deleting ${items.length} message(s).\nOK will remove them for everyone, Cancel will keep them visible to others and only delete for you.`
      );
      items.forEach(i => (i.forAll = deleteForEveryone));
    } else if (ownCount === 0) {
      if (!confirm(`Delete ${items.length} message(s) for yourself? You cannot remove other users' messages.`)) return;
    } else {
      if (!confirm(`Delete ${ownCount} of your messages for everyone and ${otherCount} messages just for yourself?`)) return;
    }

    deleteMessages.mutate(items, {
      onSuccess: () => { setSelectedMessages(new Set()); setSelectionMode(false); }
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground rounded-full h-9 w-9">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Chat Options</DropdownMenuLabel>
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
                    onClick={() => { if (selectionMode) toggleMessageSelection(msg.id); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!selectionMode) setSelectionMode(true);
                      toggleMessageSelection(msg.id);
                    }}
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
                    `}>
                      {msg.content && (() => {
                        const emojiOnly = onlyEmoji(msg.content) && !(msg.attachments && msg.attachments.length);
                        if (emojiOnly) {
                          return (
                            <div className="mt-1 flex items-center justify-center space-x-1 text-4xl">
                              {Array.from(msg.content).map((ch, i) => <span key={i}>{ch}</span>)}
                            </div>
                          );
                        }
                        return <p className="text-[15px] leading-relaxed break-words">{linkifyText(msg.content)}</p>;
                      })()}

                      {/* Attachments */}
                      {renderAttachments(msg)}

                      <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        <span className="text-[10px] uppercase font-medium tracking-wider">
                          {new Date(msg.createdAt!).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
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
          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, idx) => (
                <div key={idx} className="relative flex items-center gap-2 bg-card border border-border/50 rounded-lg p-2 px-3">
                  {file.type === 'sticker' ? (
                    <span className="text-2xl">{file.name}</span>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.type.split("/")[1]}</p>
                    </div>
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
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                placeholder="Write a message..."
                className="w-full max-h-32 min-h-[44px] bg-transparent resize-none border-0 focus:ring-0 text-[15px] py-2.5 px-3 scrollbar-hide"
                rows={1}
              />
            </div>

            {/* Sticker picker toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStickerPicker(v => !v)}
                className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                <Smile className="w-5 h-5" />
              </button>
              {showStickerPicker && (
                <div className="absolute bottom-full mb-2 right-0 w-[340px] bg-card border border-border/50 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
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
                </div>
              )}
            </div>

            {/* Record audio button */}
            <button
              type="button"
              onClick={() => { recording ? stopRecording() : startRecording(); }}
              disabled={uploading}
              className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 relative"
              title={recording ? 'Stop recording' : 'Record voice message'}
            >
              {recording ? (
                <StopCircle className="w-5 h-5 text-red-500" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
              {recording && (
                <span className="absolute -top-1 -right-1 bg-red-500 rounded-full w-2 h-2 animate-pulse" />
              )}
            </button>

            {/* File upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,video/*,audio/*,audio/webm,.pdf,.doc,.docx,.xls,.xlsx"
            />

            <Button
              type="submit"
              size="icon"
              disabled={(!inputValue.trim() && attachments.length === 0) || sendMessage.isPending}
              className="h-12 w-12 rounded-full shrink-0 bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none"
            >
              {sendMessage.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
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
    </div>
  );
}