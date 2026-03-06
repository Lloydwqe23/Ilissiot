import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useInviteLinkInfo, useJoinViaInviteLink } from "@/hooks/use-chats";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Link2, Loader2, CheckCircle2 } from "lucide-react";

export function InviteLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { data: inviteInfo, isLoading: infoLoading } = useInviteLinkInfo(token || null);
  const joinGroup = useJoinViaInviteLink();

  const handleJoin = () => {
    if (!token) return;

    joinGroup.mutate(token, {
      onSuccess: (chat) => {
        // Navigate to the chat
        navigate(`/chat/${chat.id}`);
      },
      onError: (error: any) => {
        alert(error.message || "Failed to join group");
      },
    });
  };

  useEffect(() => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      navigate(`/?redirect=/invite/${token}`);
    }
  }, [isAuthenticated, token, navigate]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (infoLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (!inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-2xl border border-border p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <Link2 className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Invalid Invite Link</h1>
          <p className="text-muted-foreground">
            This invite link is invalid, expired, or has been revoked.
          </p>
          <Button onClick={() => navigate("/")} className="w-full">
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  const { chatName, chatAvatar, memberCount } = inviteInfo;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="bg-primary/5 p-8 text-center border-b border-border">
          <Avatar className="w-24 h-24 mx-auto mb-4 border-4 border-background shadow-lg">
            <AvatarImage src={chatAvatar || ""} />
            <AvatarFallback className="text-3xl bg-primary/10 text-primary">
              {chatName?.[0] || "G"}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-bold mb-2">{chatName}</h1>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Users className="w-4 h-4" />
            <span className="text-sm">
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-lg font-medium text-center">
              You've been invited to join this group
            </p>
            <p className="text-sm text-muted-foreground text-center">
              Click the button below to join and start chatting with the group members.
            </p>
          </div>

          {joinGroup.isSuccess ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <p className="font-medium text-green-600">Successfully joined the group!</p>
              <Button onClick={() => navigate("/")} className="w-full">
                Go to Chats
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleJoin}
              disabled={joinGroup.isPending}
              className="w-full h-12 text-base"
            >
              {joinGroup.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                "Join Group"
              )}
            </Button>
          )}

          {joinGroup.isError && (
            <p className="text-sm text-destructive text-center">
              {(joinGroup.error as Error)?.message || "Failed to join group"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
