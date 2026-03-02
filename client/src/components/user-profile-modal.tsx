import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Video } from "lucide-react";
import type { User } from "@shared/models/auth";

export function UserProfileModal({ 
  user, 
  open, 
  onOpenChange,
  onCall
}: { 
  user: User | null; 
  open: boolean; 
  onOpenChange: (o: boolean) => void;
  onCall?: (type: 'audio' | 'video') => void;
}) {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  if (!user) return null;

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Unknown";
  
  const formatBirthday = (birthday: string | undefined) => {
    if (!birthday) return null;
    const date = new Date(birthday);
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl">
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
              <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
            </div>
          </div>
        </DialogHeader>

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
          {onCall && (
            <div className="flex gap-2 pt-4">
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Photo Preview Dialog */}
    <Dialog open={!!previewImageUrl} onOpenChange={(open) => { if (!open) setPreviewImageUrl(null); }}>
      <DialogContent className="sm:max-w-[600px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl">
        <DialogHeader className="p-4 border-b border-border/50">
          <DialogTitle>Profile Photo</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center bg-muted/50 p-8">
          {previewImageUrl && (
            <img 
              src={previewImageUrl} 
              alt="Profile Preview" 
              className="max-w-full max-h-96 rounded-lg"
            />
          )}
        </div>
        <div className="p-4 flex justify-end">
          <Button variant="ghost" className="rounded-xl" onClick={() => setPreviewImageUrl(null)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
