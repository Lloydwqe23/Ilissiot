import { X, Pin, ChevronDown } from "lucide-react";
import { usePinnedMessages, useUnpinMessage } from "@/hooks/use-chats";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";

interface PinnedMessagesButtonProps {
  chatId: number;
  currentUserId?: string;
  onNavigateToMessage: (messageId: number) => void;
}

export function PinnedMessagesButton({ chatId, currentUserId, onNavigateToMessage }: PinnedMessagesButtonProps) {
  const { data: pinnedMessages } = usePinnedMessages(chatId);
  const unpinMessage = useUnpinMessage();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!pinnedMessages || pinnedMessages.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground rounded-full h-9 w-9 hover:text-primary relative"
        onClick={() => setOpen(!open)}
        title="Pinned messages"
      >
        <Pin className="w-5 h-5" />
        {pinnedMessages.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {pinnedMessages.length}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Pinned Messages ({pinnedMessages.length})
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="overflow-y-auto max-h-80 divide-y divide-border/30">
            {pinnedMessages.map((pinned: any, idx: number) => (
              <div
                key={pinned.id || idx}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors group"
                onClick={() => {
                  onNavigateToMessage(pinned.messageId);
                  setOpen(false);
                }}
              >
                <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                  <AvatarImage src={pinned.message?.sender?.profileImageUrl || ""} />
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {pinned.message?.sender?.firstName?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      {pinned.message?.sender?.firstName || 'Unknown'}
                    </span>
                    {pinned.pinnedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(pinned.pinnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/80 line-clamp-2 leading-snug">
                    {pinned.message?.content || '📎 Attachment'}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    unpinMessage.mutate({ chatId, messageId: pinned.messageId });
                  }}
                  title="Unpin"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
