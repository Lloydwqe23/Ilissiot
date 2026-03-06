import { useState } from "react";
import { Plus, X, BarChart3 } from "lucide-react";
import { useCreatePoll } from "@/hooks/use-chats";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface CreatePollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: number;
}

export function CreatePollDialog({ open, onOpenChange, chatId }: CreatePollDialogProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);

  const createPoll = useCreatePoll();

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions([...options, ""]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleCreatePoll = () => {
    const validOptions = options.filter((opt) => opt.trim());
    
    if (!question.trim() || validOptions.length < 2) {
      return;
    }

    const closesAt = hasExpiry
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    createPoll.mutate(
      {
        chatId,
        question: question.trim(),
        options: validOptions,
        allowMultipleAnswers,
        isAnonymous,
        closesAt,
      },
      {
        onSuccess: () => {
          // Reset form
          setQuestion("");
          setOptions(["", ""]);
          setAllowMultipleAnswers(false);
          setIsAnonymous(false);
          setHasExpiry(false);
          setExpiryDays(7);
          onOpenChange(false);
        },
      }
    );
  };

  const validOptions = options.filter((opt) => opt.trim());
  const canCreate = question.trim() && validOptions.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Create Poll
          </DialogTitle>
          <DialogDescription>
            Ask a question and provide options for group members to vote on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Question */}
          <div className="space-y-2">
            <Label htmlFor="question">Question *</Label>
            <Input
              id="question"
              placeholder="What's your question?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              {question.length}/200 characters
            </p>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <Label>Options * (at least 2)</Label>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder={`Option ${index + 1}`}
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  maxLength={100}
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveOption(index)}
                    className="shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddOption}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Option
              </Button>
            )}
          </div>

          {/* Poll Settings */}
          <div className="space-y-3 pt-2 border-t border-border">
            <Label className="text-sm font-semibold">Poll Settings</Label>

            {/* Multiple Answers */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Allow multiple answers</p>
                <p className="text-xs text-muted-foreground">
                  Users can select more than one option
                </p>
              </div>
              <Button
                variant={allowMultipleAnswers ? "default" : "outline"}
                size="sm"
                onClick={() => setAllowMultipleAnswers(!allowMultipleAnswers)}
              >
                {allowMultipleAnswers ? "On" : "Off"}
              </Button>
            </div>

            {/* Anonymous */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Anonymous voting</p>
                <p className="text-xs text-muted-foreground">
                  Hide who voted for what
                </p>
              </div>
              <Button
                variant={isAnonymous ? "default" : "outline"}
                size="sm"
                onClick={() => setIsAnonymous(!isAnonymous)}
              >
                {isAnonymous ? "On" : "Off"}
              </Button>
            </div>

            {/* Expiry */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-close poll</p>
                  <p className="text-xs text-muted-foreground">
                    Poll closes automatically after set days
                  </p>
                </div>
                <Button
                  variant={hasExpiry ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHasExpiry(!hasExpiry)}
                >
                  {hasExpiry ? "On" : "Off"}
                </Button>
              </div>

              {hasExpiry && (
                <div className="space-y-2 pl-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Close after</Label>
                    <span className="text-sm font-medium">
                      {expiryDays} {expiryDays === 1 ? "day" : "days"}
                    </span>
                  </div>
                  <Slider
                    value={[expiryDays]}
                    onValueChange={(value) => setExpiryDays(value[0])}
                    min={1}
                    max={30}
                    step={1}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createPoll.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreatePoll}
            disabled={!canCreate || createPoll.isPending}
          >
            {createPoll.isPending ? "Creating..." : "Create Poll"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
