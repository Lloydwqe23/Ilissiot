import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Crown, Shield, ShieldCheck, Tag, Save, Loader2 } from "lucide-react";
import { useUpdateMemberRole, useUpdateMemberTitle, useUpdateMemberPermissions } from "@/hooks/use-chats";

// Available custom permissions
const PERMISSION_OPTIONS = [
  { key: "canPin", label: "Pin messages", description: "Pin and unpin messages in the group" },
  { key: "canInvite", label: "Invite members", description: "Add new members to the group" },
  { key: "canRemove", label: "Remove members", description: "Remove other members from the group" },
  { key: "canEditInfo", label: "Edit group info", description: "Change group name and avatar" },
  { key: "canDeleteMessages", label: "Delete messages", description: "Delete other members' messages" },
  { key: "canCreatePolls", label: "Create polls", description: "Create polls in the group" },
] as const;

interface MemberSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: number;
  member: any;
  isCurrentUserAdmin: boolean;
}

export function MemberSettingsDialog({
  open,
  onOpenChange,
  chatId,
  member,
  isCurrentUserAdmin,
}: MemberSettingsDialogProps) {
  const user = member?.user;
  const memberName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Unknown";

  const [title, setTitle] = useState(member?.title || "");
  const [role, setRole] = useState(member?.role || "member");
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = { canPin: true, canInvite: true, canCreatePolls: true };
    const p = member?.permissions;
    if (p && typeof p === "object" && !Array.isArray(p)) return { ...defaults, ...p };
    return defaults;
  });

  const updateRole = useUpdateMemberRole();
  const updateTitle = useUpdateMemberTitle();
  const updatePermissions = useUpdateMemberPermissions();

  const isSaving = updateRole.isPending || updateTitle.isPending || updatePermissions.isPending;

  const handleSave = async () => {
    try {
      // Save role if changed
      if (role !== member?.role) {
        await updateRole.mutateAsync({ chatId, userId: member.userId, role });
      }
      // Save title if changed
      const currentTitle = member?.title || "";
      const newTitle = title.trim();
      if (newTitle !== currentTitle) {
        await updateTitle.mutateAsync({ chatId, userId: member.userId, title: newTitle || null });
      }
      // Save permissions if changed
      const currentPerms = (member?.permissions && typeof member.permissions === "object") ? member.permissions : {};
      const permsChanged = PERMISSION_OPTIONS.some(
        (p) => (permissions[p.key] || false) !== (currentPerms[p.key] || false)
      );
      if (permsChanged) {
        await updatePermissions.mutateAsync({ chatId, userId: member.userId, permissions });
      }
      onOpenChange(false);
    } catch (err: any) {
      alert(err.message || "Failed to save changes");
    }
  };

  const togglePermission = (key: string) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!member) return null;

  const isAdmin = role === "admin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user?.profileImageUrl || ""} />
              <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                {memberName[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="text-base">{memberName}</span>
              {member.title && (
                <p className="text-xs text-muted-foreground font-normal">{member.title}</p>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Manage member settings</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 overflow-y-auto flex-1 min-h-0">
          {/* Title / Badge */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Tag className="w-4 h-4 text-primary" />
              Custom Title
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Designer, Moderator, VIP..."
              maxLength={100}
              disabled={!isCurrentUserAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Shown next to this member's name in the group
            </p>
          </div>

          <Separator />

          {/* Role */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Crown className="w-4 h-4 text-primary" />
              Role
            </Label>
            <div className="flex gap-2">
              <Button
                variant={isAdmin ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => setRole("admin")}
                disabled={!isCurrentUserAdmin}
              >
                <Crown className="w-3.5 h-3.5" />
                Admin
              </Button>
              <Button
                variant={!isAdmin ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => setRole("member")}
                disabled={!isCurrentUserAdmin}
              >
                <Shield className="w-3.5 h-3.5" />
                Member
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Admins have full control over the group"
                : "Members have standard access. Use custom permissions below to grant specific abilities."}
            </p>
          </div>

          <Separator />

          {/* Custom Permissions */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Custom Permissions
            </Label>
            {isAdmin ? (
              <p className="text-xs text-muted-foreground italic">
                Admins automatically have all permissions
              </p>
            ) : (
              <div className="space-y-1">
                {PERMISSION_OPTIONS.map((perm) => (
                  <button
                    key={perm.key}
                    type="button"
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    onClick={() => isCurrentUserAdmin && togglePermission(perm.key)}
                    disabled={!isCurrentUserAdmin}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                        permissions[perm.key]
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {permissions[perm.key] && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{perm.label}</p>
                      <p className="text-xs text-muted-foreground">{perm.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {isCurrentUserAdmin && (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
