import { useState } from "react";
import { BarChart3, Users, Lock, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useVotePoll, useClosePoll } from "@/hooks/use-chats";
import { Button } from "@/components/ui/button";
import { type PollWithResults } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { resolveLanguage, translate } from "@/lib/i18n";

interface PollMessageProps {
  poll: PollWithResults;
  currentUserId?: string;
  isCreator: boolean;
  isAdmin: boolean;
}

export function PollMessage({ poll, currentUserId, isCreator, isAdmin }: PollMessageProps) {
  const { user } = useAuth();
  const language = resolveLanguage(user?.language);
  const t = (key: string) => translate(language, key);
  const [selectedOptions, setSelectedOptions] = useState<number[]>(poll.userVotes || []);
  const [isChangingVote, setIsChangingVote] = useState(false);
  const votePoll = useVotePoll();
  const closePoll = useClosePoll();

  const hasVoted = poll.userVotes && poll.userVotes.length > 0;
  const isClosed = poll.isClosed || (poll.closesAt && new Date(poll.closesAt) < new Date());
  const canVote = !isClosed;
  const showSelectors = canVote && (!hasVoted || isChangingVote);

  const handleOptionToggle = (optionId: number) => {
    if (!canVote) return;
    if (!showSelectors) return;
    if (poll.allowMultipleAnswers) {
      setSelectedOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      setSelectedOptions([optionId]);
    }
  };

  const handleVote = () => {
    if (selectedOptions.length === 0 || !canVote) return;
    votePoll.mutate({ pollId: poll.id, optionIds: selectedOptions }, {
      onSuccess: () => setIsChangingVote(false),
    });
  };

  const handleClosePoll = () => {
    closePoll.mutate(poll.id);
  };

  return (
    // Poll always renders on a neutral card so it's legible regardless of
    // whether the parent message bubble is bg-primary (sent) or bg-card (received).
    <div className="mt-2 -mx-1 rounded-xl bg-background dark:bg-zinc-900 border border-border/60 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-start gap-2.5 px-4 pt-4 pb-3 border-b border-border/40">
        <BarChart3 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-foreground leading-snug">{poll.question}</h4>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
            {poll.isAnonymous && (
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                {t("poll.anonymousVoting")}
              </span>
            )}
            {poll.allowMultipleAnswers && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {t("poll.allowMultiple")}
              </span>
            )}
            {isClosed && (
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="w-3 h-3" />
                {t("poll.closed")}
              </span>
            )}
            {poll.closesAt && !isClosed && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {t("poll.closes")} {new Date(poll.closesAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="px-3 py-3 space-y-2">
        {poll.options.map((option) => {
          const result = poll.results.find((r) => r.optionId === option.id);
          const voteCount = result?.count || 0;
          const percentage = poll.totalVotes > 0 ? (voteCount / poll.totalVotes) * 100 : 0;
          const isSelected = selectedOptions.includes(option.id);
          const hasUserVoted = poll.userVotes?.includes(option.id);
          const isLeading = hasVoted && voteCount > 0 && voteCount === Math.max(...poll.results.map(r => r.count));

          return (
            <div key={option.id} className="relative">
              <button
                onClick={() => handleOptionToggle(option.id)}
                disabled={!showSelectors}
                className={`
                  w-full text-left rounded-lg border transition-all duration-150 relative overflow-hidden
                  ${showSelectors
                    ? 'cursor-pointer hover:border-primary/70 active:scale-[0.99]'
                    : 'cursor-default'
                  }
                  ${isSelected && showSelectors
                    ? 'border-primary bg-primary/8 dark:bg-primary/15'
                    : hasUserVoted && hasVoted
                      ? 'border-primary/50 bg-primary/5 dark:bg-primary/10'
                      : 'border-border/70 bg-muted/30 dark:bg-zinc-800/60 hover:bg-muted/60 dark:hover:bg-zinc-800'
                  }
                `}
              >
                {/* Progress bar — lives behind content, clearly visible in both themes */}
                {hasVoted && percentage > 0 && (
                  <div
                    className={`absolute inset-y-0 left-0 rounded-lg transition-all duration-500
                      ${hasUserVoted
                        ? 'bg-primary/20 dark:bg-primary/30'
                        : 'bg-muted/60 dark:bg-zinc-700/70'
                      }
                    `}
                    style={{ width: `${percentage}%` }}
                  />
                )}

                <div className="relative flex items-center gap-3 px-3 py-2.5">
                  {/* Radio / check indicator */}
                  {showSelectors && (
                    <div
                      className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all
                        ${isSelected
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground/40 dark:border-zinc-500'
                        }
                      `}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                    </div>
                  )}

                  {/* Option text */}
                  <span className={`flex-1 text-sm font-medium leading-tight
                    ${hasUserVoted ? 'text-foreground' : 'text-foreground/90'}
                  `}>
                    {option.text}
                  </span>

                  {/* Vote count + percentage — always high-contrast */}
                  {hasVoted && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold tabular-nums text-foreground">
                        {percentage.toFixed(0)}%
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ({voteCount})
                      </span>
                      {isLeading && (
                        <span className="text-primary text-xs">✓</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Voter avatars */}
                {hasVoted && !poll.isAnonymous && result?.voters && result.voters.length > 0 && (
                  <div className="relative px-3 pb-2 flex items-center gap-1">
                    <div className="flex -space-x-1">
                      {result.voters.slice(0, 4).map((voter) => (
                        <Avatar key={voter.id} className="w-5 h-5 border border-background">
                          <AvatarImage src={voter.profileImageUrl || ""} />
                          <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                            {voter.firstName?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    {result.voters.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{result.voters.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border/40 bg-muted/20 dark:bg-zinc-900">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="w-3 h-3" />
          <span>{poll.totalVotes} {poll.totalVotes === 1 ? t("poll.vote") : t("poll.votes")}</span>
        </div>

        <div className="flex items-center gap-2">
          {canVote && hasVoted && !isChangingVote && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setIsChangingVote(true); setSelectedOptions(poll.userVotes || []); }}
              className="h-7 text-xs px-3"
            >
              {t("poll.changeVote")}
            </Button>
          )}

          {showSelectors && selectedOptions.length > 0 && (
            <Button
              size="sm"
              onClick={handleVote}
              disabled={votePoll.isPending}
              className="h-7 text-xs px-3"
            >
              {votePoll.isPending ? t("poll.voting") : t("poll.voteNow")}
            </Button>
          )}

          {(isCreator || isAdmin) && !isClosed && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleClosePoll}
              disabled={closePoll.isPending}
              className="h-7 text-xs px-3"
            >
              {t("poll.closePoll")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}