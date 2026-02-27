import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateProfile } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, Trash2, X } from "lucide-react";

export function ProfileSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profileImageUrl || "");
  const [uploadingImage, setUploadingImage] = useState(false);

  // Sync state when dialog opens or user data changes
  useEffect(() => {
    if (open && user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setBio(user.bio || "");
      setProfileImageUrl(user.profileImageUrl || "");
    }
  }, [open, user]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate it's an image
    if (!file.type.startsWith('image/')) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }

    // Validate size (5MB max for profile image)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be smaller than 5MB", variant: "destructive" });
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      setProfileImageUrl(data.url);
      toast({ title: "Image uploaded" });
    } catch (err) {
      console.error("Upload error:", err);
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveImage = () => {
    setProfileImageUrl("");
  };

  const handleClearBio = () => {
    setBio("");
  };

  const handleSave = () => {
    updateProfile.mutate({
      firstName,
      lastName,
      bio: bio.trim() || null,
      profileImageUrl: profileImageUrl || null,
    }, {
      onSuccess: () => {
        toast({ title: "Profile updated successfully" });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: "Failed to update profile", description: err.message, variant: "destructive" });
      }
    });
  };

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl">
        <DialogHeader className="p-6 bg-muted/30 border-b border-border/50">
          <DialogTitle className="text-2xl font-display">Profile Settings</DialogTitle>
        </DialogHeader>
        
        <div className="p-6 space-y-6">
          {/* Profile Image Section */}
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                <AvatarImage src={profileImageUrl || ""} alt={firstName || "User"} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              
              {/* Overlay for changing image */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploadingImage ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </button>

              {/* Remove image button */}
              {profileImageUrl && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors z-10"
                  title="Remove profile image"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="font-semibold text-lg">{user?.email}</h3>
              <p className="text-sm text-muted-foreground">Local Account</p>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs rounded-lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Camera className="w-3 h-3 mr-1" />}
                  {profileImageUrl ? "Change" : "Upload"}
                </Button>
                {profileImageUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs rounded-lg text-destructive hover:text-destructive"
                    onClick={handleRemoveImage}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input 
                id="firstName" 
                value={firstName} 
                onChange={e => setFirstName(e.target.value)}
                className="rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input 
                id="lastName" 
                value={lastName} 
                onChange={e => setLastName(e.target.value)}
                className="rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="bio">Bio</Label>
              {bio && (
                <button
                  type="button"
                  onClick={handleClearBio}
                  className="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear bio
                </button>
              )}
            </div>
            <Textarea 
              id="bio" 
              value={bio} 
              onChange={e => setBio(e.target.value)}
              placeholder="Tell us a little bit about yourself"
              className="resize-none rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
              rows={3}
            />
          </div>
        </div>

        <div className="p-6 pt-0 flex justify-end gap-3">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={updateProfile.isPending || uploadingImage}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
