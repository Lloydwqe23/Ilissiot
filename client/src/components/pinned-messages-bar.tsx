import { X, Pin } from "lucide-react";
import { usePinnedMessages, useUnpinMessage } from "@/hooks/use-chats";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { resolveLanguage, translate } from "@/lib/i18n";

interface PinnedMessagesBarProps {
  chatId: number;
  currentUserId?: string;
  isAdmin?: boolean;
  onNavigateToMessage: (messageId: number) => void;
}

export function PinnedMessagesBar({ chatId, currentUserId, isAdmin, onNavigateToMessage }: PinnedMessagesBarProps) {
  const { user } = useAuth();
  const language = resolveLanguage(user?.language);
  const t = (key: string) => translate(language, key);
  const { data: pinnedMessages } = usePinnedMessages(chatId);
  const unpinMessage = useUnpinMessage();
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!pinnedMessages || pinnedMessages.length === 0) {
    return null;
  }

  const currentPinned = pinnedMessages[currentIndex];

  const handleUnpin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentPinned) {
      unpinMessage.mutate(
        { chatId, messageId: currentPinned.messageId },
        {
          onSuccess: () => {
            // Move to next message if available
            if (currentIndex >= pinnedMessages.length - 1) {
              setCurrentIndex(Math.max(0, pinnedMessages.length - 2));
            }
          },
        }
      );
    }
  };

  const handleNavigate = () => {
    if (currentPinned) {
      onNavigateToMessage(currentPinned.messageId);
    }
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % pinnedMessages.length);
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + pinnedMessages.length) % pinnedMessages.length);
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="border-b border-border bg-background/95 backdrop-blur-sm overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Pin className="w-4 h-4 text-primary shrink-0" />
        
        <div className="flex-1 min-w-0 cursor-pointer" onClick={handleNavigate}>
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="w-5 h-5">
              <AvatarImage src={currentPinned.message.sender?.profileImageUrl || ""} />
              <AvatarFallback className="text-[10px]">
                {currentPinned.message.sender?.firstName?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold text-foreground">
              {currentPinned.message.sender?.firstName || t("profile.unknown")}
            </span>
          </div>
          <p className="text-sm truncate text-foreground/80">
            {currentPinned.message.content || t("pinned.attachment")}
          </p>
        </div>

        {pinnedMessages.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                goToPrev();
              }}
            >
              <span className="text-xs">←</span>
            </Button>
            <span className="text-xs text-muted-foreground px-1">
              {currentIndex + 1}/{pinnedMessages.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
            >
              <span className="text-xs">→</span>
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive shrink-0"
          onClick={handleUnpin}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
