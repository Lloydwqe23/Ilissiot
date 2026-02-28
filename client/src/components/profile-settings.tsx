import { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateProfile } from "@/hooks/use-users";
import { useToast } from "@/hooks/use-toast";
import { useBlockedUsers, useUnblockUser } from "@/hooks/use-chats";
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
  const defaultTheme = user?.theme === 'dark' ? 'dark' : 'light';
  const [theme, setTheme] = useState<'light' | 'dark'>(defaultTheme);
  const { setTheme: applyTheme } = useTheme();

  // blocked users list view state
  const [view, setView] = useState<'profile' | 'blocked'>('profile');
  const blockedUsersQuery = useBlockedUsers();
  const unblockMut = useUnblockUser();

  // Sync state when dialog opens or user data changes
  useEffect(() => {
    if (open && user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setBio(user.bio || "");
      setProfileImageUrl(user.profileImageUrl || "");
      setTheme(user.theme === 'dark' ? 'dark' : 'light');
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
      theme,
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
          <div className="mt-2 flex space-x-4">
            <button
              type="button"
              className={`text-sm font-medium ${view === 'profile' ? 'text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setView('profile')}
            >
              General
            </button>
            <button
              type="button"
              className={`text-sm font-medium ${view === 'blocked' ? 'text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setView('blocked')}
            >
              Blocked users
            </button>
          </div>
        </DialogHeader>
        
        <div className="p-6 space-y-6">
          {view === 'blocked' ? (
            <div>
              {blockedUsersQuery.isLoading && <Loader2 className="animate-spin" />}
              {blockedUsersQuery.data?.length === 0 && !blockedUsersQuery.isLoading && (
                <p className="text-sm text-muted-foreground">You haven't blocked anyone.</p>
              )}
              {blockedUsersQuery.data?.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={u.profileImageUrl || ''} />
                      <AvatarFallback>{(u.firstName || u.email || 'U')[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{u.firstName || u.email || 'Unknown'}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      unblockMut.mutate(u.id, {
                        onSuccess: () => blockedUsersQuery.refetch(),
                      });
                    }}
                  >
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <>
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
          {/* Theme selection */}
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-1">
                <input
                  type="radio"
                  name="theme"
                  value="light"
                  checked={theme === 'light'}
                  onChange={() => { setTheme('light'); applyTheme('light'); }}
                  className="form-radio"
                />
                <span>Light</span>
              </label>
              <label className="flex items-center space-x-1">
                <input
                  type="radio"
                  name="theme"
                  value="dark"
                  checked={theme === 'dark'}
                  onChange={() => { setTheme('dark'); applyTheme('dark'); }}
                  className="form-radio"
                />
                <span>Dark</span>
              </label>
            </div>
          </div>
            </>
          )}
        </div>
        <div className="p-6 pt-0 flex justify-end gap-3">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {view === 'profile' && (
            <Button 
              onClick={handleSave} 
              disabled={updateProfile.isPending || uploadingImage}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
