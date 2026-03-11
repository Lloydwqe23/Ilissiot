import { useState } from "react";
import { Link2, Copy, Trash2, Plus, Check, Clock, Users } from "lucide-react";
import { useInviteLinks, useCreateInviteLink, useRevokeInviteLink } from "@/hooks/use-chats";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { resolveLanguage, translate } from "@/lib/i18n";

interface GroupInviteLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: number;
}

export function GroupInviteLinksDialog({ open, onOpenChange, chatId }: GroupInviteLinksDialogProps) {
  const { user } = useAuth();
  const language = resolveLanguage(user?.language);
  const t = (key: string) => translate(language, key);
  const { data: inviteLinks, isLoading } = useInviteLinks(chatId);
  const createInviteLink = useCreateInviteLink();
  const revokeInviteLink = useRevokeInviteLink();

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | undefined>(undefined);
  const [maxUses, setMaxUses] = useState<number | undefined>(undefined);

  const handleCopyLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCreateLink = () => {
    const expiresAt = expiryDays
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    createInviteLink.mutate(
      {
        chatId,
        expiresAt,
        maxUses,
      },
      {
        onSuccess: () => {
          setShowCreateForm(false);
          setExpiryDays(undefined);
          setMaxUses(undefined);
        },
      }
    );
  };

  const handleRevokeLink = (token: string) => {
    if (confirm(t("invite.revokeConfirm"))) {
      revokeInviteLink.mutate(token);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            {t("invite.title")}
          </DialogTitle>
          <DialogDescription>
            {t("invite.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Create Link Button */}
          {!showCreateForm && (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="w-full"
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("invite.createNew")}
            </Button>
          )}

          {/* Create Link Form */}
          {showCreateForm && (
            <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/30">
              <h3 className="font-semibold text-sm">{t("invite.newLink")}</h3>

              <div className="space-y-2">
                <Label htmlFor="expiry">{t("invite.expiresAfter")}</Label>
                <Input
                  id="expiry"
                  type="number"
                  min="1"
                  max="365"
                  placeholder={t("invite.neverExpires")}
                  value={expiryDays || ""}
                  onChange={(e) => setExpiryDays(e.target.value ? parseInt(e.target.value) : undefined)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxUses">{t("invite.maximumUses")}</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min="1"
                  max="1000"
                  placeholder={t("invite.unlimited")}
                  value={maxUses || ""}
                  onChange={(e) => setMaxUses(e.target.value ? parseInt(e.target.value) : undefined)}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCreateLink}
                  disabled={createInviteLink.isPending}
                  className="flex-1"
                >
                  {createInviteLink.isPending ? t("invite.creating") : t("invite.createLink")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setExpiryDays(undefined);
                    setMaxUses(undefined);
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}

          {/* Existing Links */}
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {t("invite.loading")}
            </div>
          ) : inviteLinks && inviteLinks.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">{t("invite.activeLinks")}</h3>
              {inviteLinks
                .filter((link: any) => link.isActive)
                .map((link: any) => {
                  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
                  const reachedMaxUses = link.maxUses && link.currentUses >= link.maxUses;
                  const isCopied = copiedToken === link.token;

                  return (
                    <div
                      key={link.id}
                      className={`p-4 border border-border rounded-lg space-y-3 ${
                        isExpired || reachedMaxUses ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-xs bg-muted px-2 py-1 rounded truncate">
                              /invite/{link.token}
                            </code>
                            {(isExpired || reachedMaxUses) && (
                              <span className="text-xs text-destructive font-medium">
                                {isExpired ? t("invite.expired") : t("invite.maxUsesReached")}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {link.expiresAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {t("invite.expires")} {format(new Date(link.expiresAt), "MMM d, yyyy")}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {link.currentUses} {link.maxUses ? `/ ${link.maxUses}` : ""} {t("invite.uses")}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleCopyLink(link.token)}
                            className="h-8 w-8"
                            title={t("invite.copyLink")}
                          >
                            {isCopied ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleRevokeLink(link.token)}
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                            title={t("invite.revokeLink")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-8">
              {t("invite.empty")}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
