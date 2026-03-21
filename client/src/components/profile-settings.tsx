import { useState, useRef, useEffect, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
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
import { Loader2, Camera, Trash2, X, Shield, Ban } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { APP_LANGUAGES, getLanguageLabel, resolveLanguage, translate, type AppLanguage } from "@/lib/i18n";

export function ProfileSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [birthday, setBirthday] = useState(user?.birthday || "");
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profileImageUrl || "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  // Crop state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const defaultTheme = user?.theme || 'light';
  const [theme, setTheme] = useState<string>(defaultTheme);
  const [language, setLanguage] = useState<AppLanguage>(resolveLanguage(user?.language));
  const [colorTheme, setColorTheme] = useState<string>(user?.colorTheme || 'blue');
  const [fontType, setFontType] = useState<string>(user?.fontType || 'inter');
  const [textSize, setTextSize] = useState<string>(user?.textSize || 'normal');
  const [sidebarPlacement, setSidebarPlacement] = useState<'left' | 'right' | 'top' | 'bottom'>((user?.sidebarPlacement as 'left' | 'right' | 'top' | 'bottom') || 'left');
  const t = (key: string) => translate(language, key);

  // settings view state
  const [view, setView] = useState<'profile' | 'design' | 'privacy'>('profile');
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);
  const [privacyLastSeen, setPrivacyLastSeen] = useState<'everyone' | 'nobody'>((user?.lastSeenPrivacy as 'everyone' | 'nobody') || 'everyone');
  const [privacyWhoCanAdd, setPrivacyWhoCanAdd] = useState<'everyone' | 'nobody'>((user?.groupAddPrivacy as 'everyone' | 'nobody') || 'everyone');
  const blockedUsersQuery = useBlockedUsers();
  const unblockMut = useUnblockUser();

  // Sync state when dialog opens or user data changes
  useEffect(() => {
    if (open && user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setUsername(user.username || "");
      setBio(user.bio || "");
      setBirthday(user.birthday || "");
      setProfileImageUrl(user.profileImageUrl || "");
      setTheme(user.theme || 'light');
      setLanguage(resolveLanguage(user.language));
      setColorTheme(user.colorTheme || 'blue');
      setFontType(user.fontType || 'inter');
      setTextSize(user.textSize || 'normal');
      setSidebarPlacement((user.sidebarPlacement as 'left' | 'right' | 'top' | 'bottom') || 'left');
      setPrivacyLastSeen((user.lastSeenPrivacy as 'everyone' | 'nobody') || 'everyone');
      setPrivacyWhoCanAdd((user.groupAddPrivacy as 'everyone' | 'nobody') || 'everyone');
    }
  }, [open, user]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate it's an image
    if (!file.type.startsWith('image/')) {
      toast({ title: t("profile.upload.selectImage"), variant: "destructive" });
      return;
    }

    // Validate size (5MB max for profile image)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("profile.upload.sizeLimit"), variant: "destructive" });
      return;
    }

    // Read the file and open the crop dialog
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const getCroppedBlob = async (): Promise<Blob> => {
    const image = new Image();
    image.src = cropImageSrc!;
    await new Promise((resolve) => { image.onload = resolve; });

    const canvas = document.createElement("canvas");
    const size = 512; // output size
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const { x, y, width, height } = croppedAreaPixels!;
    ctx.drawImage(image, x, y, width, height, 0, 0, size, size);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
    });
  };

  const handleCropConfirm = async () => {
    if (!croppedAreaPixels || !cropImageSrc) return;

    setUploadingImage(true);
    try {
      const blob = await getCroppedBlob();
      const formData = new FormData();
      formData.append("file", blob, "profile.jpg");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      setProfileImageUrl(data.url);
      toast({ title: t("profile.upload.success") });
    } catch (err) {
      console.error("Upload error:", err);
      toast({ title: t("profile.upload.failed"), variant: "destructive" });
    } finally {
      setUploadingImage(false);
      setCropImageSrc(null);
    }
  };

  const handleCropCancel = () => {
    setCropImageSrc(null);
  };

  const handleRemoveImage = () => {
    setProfileImageUrl("");
  };

  const handleClearBio = () => {
    setBio("");
  };

  const handleSave = () => {
    updateProfile.mutate({
      username: username.trim().toLowerCase(),
      firstName,
      lastName,
      bio: bio.trim() || null,
      birthday: birthday || null,
      profileImageUrl: profileImageUrl || null,
      theme,
      language,
      colorTheme,
      fontType,
      textSize,
      sidebarPlacement,
      lastSeenPrivacy: privacyLastSeen,
      groupAddPrivacy: privacyWhoCanAdd,
    }, {
      onSuccess: () => {
        const appearanceClasses = ['light', 'dark', 'greenish', 'yellowish', 'blueish', 'purpleish', 'pinkish', 'orangeish'];
        const colorThemeClasses = ['theme-blue', 'theme-green', 'theme-red', 'theme-gold', 'theme-purple', 'theme-pink', 'theme-teal', 'theme-orange', 'theme-indigo'];
        const fontClasses = ['font-inter', 'font-poppins', 'font-lora', 'font-jetbrains', 'font-nunito', 'font-merriweather', 'font-manrope', 'font-playfair'];
        const textSizeClasses = ['text-size-small', 'text-size-normal', 'text-size-large'];

        // Apply appearance theme - remove old appearance modes first
        document.documentElement.classList.remove(...appearanceClasses);
        document.documentElement.classList.add(theme);

        // Apply color theme
        document.documentElement.classList.remove(...colorThemeClasses);
        document.documentElement.classList.add(`theme-${colorTheme}`);

        // Apply global font type
        document.documentElement.classList.remove(...fontClasses);
        document.documentElement.classList.add(`font-${fontType}`);

        // Apply global text size
        document.documentElement.classList.remove(...textSizeClasses);
        document.documentElement.classList.add(`text-size-${textSize}`);

        // Store layout preference on the root for immediate UI updates.
        document.documentElement.setAttribute('data-sidebar-placement', sidebarPlacement);

        toast({ title: t("profile.updated") });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: t("profile.updateFailed"), description: err.message, variant: "destructive" });
      }
    });
  };

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="p-6 bg-muted/30 border-b border-border/50">
          <DialogTitle className="text-2xl font-display">{t("profile.title")}</DialogTitle>
          <div className="mt-2 flex space-x-4">
            <button
              type="button"
              className={`text-sm font-medium ${view === 'profile' ? 'text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setView('profile')}
            >
              {t("profile.tabGeneral")}
            </button>
            <button
              type="button"
              className={`text-sm font-medium ${view === 'design' ? 'text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setView('design')}
            >
              {t("profile.tabDesign")}
            </button>
            <button
              type="button"
              className={`text-sm font-medium ${view === 'privacy' ? 'text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setView('privacy')}
            >
              {t("profile.tabPrivacy")}
            </button>
          </div>
        </DialogHeader>
        
        <div className="p-6 space-y-6 overflow-y-auto min-h-0">
          {view === 'profile' && (
            <>
              {/* Profile Image Section */}
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => profileImageUrl && setPreviewImageUrl(profileImageUrl)}
                    className="relative cursor-pointer"
                  >
                    <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                      <AvatarImage src={profileImageUrl || ""} alt={firstName || "User"} />
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary">{initials}</AvatarFallback>
                    </Avatar>
                  </button>
                  {/* Remove image button */}
                  {profileImageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors z-10"
                      title={t("profile.removeImage")}
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
                  <p className="text-sm text-muted-foreground">{t("profile.account")}</p>
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
                      {t("profile.changePhoto")}
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
                        {t("profile.remove")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("profile.firstName")}</Label>
                  <Input 
                    id="firstName" 
                    value={firstName} 
                    onChange={e => setFirstName(e.target.value)}
                    className="rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("profile.lastName")}</Label>
                  <Input 
                    id="lastName" 
                    value={lastName} 
                    onChange={e => setLastName(e.target.value)}
                    className="rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">{t("profile.username")}</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder={t("profile.usernamePlaceholder")}
                  className="rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
                />
                <p className="text-xs text-muted-foreground">{t("profile.usernameHelp")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthday">{t("profile.birthday")}</Label>
                <Input 
                  id="birthday" 
                  type="date"
                  value={birthday} 
                  onChange={e => setBirthday(e.target.value)}
                  className="rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">{t("profile.language")}</Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(resolveLanguage(e.target.value))}
                  className="w-full h-10 rounded-xl bg-muted/50 border border-transparent px-3 text-sm focus:bg-background focus:border-primary transition-all"
                >
                  {APP_LANGUAGES.map((langCode) => (
                    <option key={langCode} value={langCode}>
                      {getLanguageLabel(langCode)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{t("profile.languageHelp")}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bio">{t("profile.bio")}</Label>
                  {bio && (
                    <button
                      type="button"
                      onClick={handleClearBio}
                      className="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t("profile.clearBio")}
                    </button>
                  )}
                </div>
                <Textarea 
                  id="bio" 
                  value={bio} 
                  onChange={e => setBio(e.target.value)}
                  placeholder={t("profile.bioPlaceholder")}
                  className="resize-none rounded-xl bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
                  rows={3}
                />
              </div>
            </>
          )}
          {view === 'design' && (
            <>
              {/* Appearance Mode Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">{t("profile.appearanceMode")}</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: 'light', label: t('design.mode.light'), bg: 'from-slate-50 to-slate-200', border: 'border-slate-300' },
                    { name: 'dark', label: t('design.mode.dark'), bg: 'from-slate-800 to-slate-950', border: 'border-slate-700' },
                    { name: 'greenish', label: t('design.mode.greenish'), bg: 'from-emerald-100 to-teal-200', border: 'border-emerald-300' },
                    { name: 'yellowish', label: t('design.mode.yellowish'), bg: 'from-amber-100 to-yellow-200', border: 'border-amber-300' },
                    { name: 'blueish', label: t('design.mode.blueish'), bg: 'from-blue-100 to-cyan-200', border: 'border-blue-300' },
                    { name: 'purpleish', label: t('design.mode.purpleish'), bg: 'from-purple-100 to-violet-200', border: 'border-purple-300' },
                    { name: 'pinkish', label: t('design.mode.pinkish'), bg: 'from-pink-100 to-rose-200', border: 'border-pink-300' },
                    { name: 'orangeish', label: t('design.mode.orangeish'), bg: 'from-orange-100 to-amber-200', border: 'border-orange-300' },
                  ].map(({ name, label, bg, border }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setTheme(name)}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        theme === name 
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${bg} border ${border}`}></div>
                        <span className="text-xs font-medium">{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Theme Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">{t("profile.colorTheme")}</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: 'blue', label: t('design.color.blue'), color: 'hsl(202, 83%, 55%)' },
                    { name: 'green', label: t('design.color.green'), color: 'hsl(142, 76%, 45%)' },
                    { name: 'red', label: t('design.color.red'), color: 'hsl(0, 72%, 51%)' },
                    { name: 'gold', label: t('design.color.gold'), color: 'hsl(45, 93%, 47%)' },
                    { name: 'purple', label: t('design.color.purple'), color: 'hsl(271, 81%, 56%)' },
                    { name: 'pink', label: t('design.color.pink'), color: 'hsl(330, 81%, 60%)' },
                    { name: 'teal', label: t('design.color.teal'), color: 'hsl(173, 80%, 40%)' },
                    { name: 'orange', label: t('design.color.orange'), color: 'hsl(24, 95%, 53%)' },
                    { name: 'indigo', label: t('design.color.indigo'), color: 'hsl(239, 84%, 67%)' },
                  ].map(({ name, label, color }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setColorTheme(name)}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        colorTheme === name 
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div 
                          className="w-10 h-10 rounded-lg shadow-sm" 
                          style={{ backgroundColor: color }}
                        ></div>
                        <span className="text-xs font-medium">{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Type Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">{t("profile.fontType")}</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: 'inter', label: 'Inter', sampleFamily: 'Inter, sans-serif' },
                    { name: 'poppins', label: 'Poppins', sampleFamily: 'Poppins, sans-serif' },
                    { name: 'lora', label: 'Lora', sampleFamily: 'Lora, serif' },
                    { name: 'jetbrains', label: 'JetBrains Mono', sampleFamily: '"JetBrains Mono", monospace' },
                    { name: 'nunito', label: 'Nunito', sampleFamily: 'Nunito, sans-serif' },
                    { name: 'merriweather', label: 'Merriweather', sampleFamily: 'Merriweather, serif' },
                    { name: 'manrope', label: 'Manrope', sampleFamily: 'Manrope, sans-serif' },
                    { name: 'playfair', label: 'Playfair Display', sampleFamily: '"Playfair Display", serif' },
                  ].map(({ name, label, sampleFamily }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setFontType(name)}
                      className={`p-3 rounded-xl border-2 transition-all text-left ${
                        fontType === name
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="text-sm" style={{ fontFamily: sampleFamily }}>The quick brown fox</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Size Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">{t("profile.textSize")}</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: 'small', label: t('design.size.small'), sampleClass: 'text-xs' },
                    { name: 'normal', label: t('design.size.normal'), sampleClass: 'text-sm' },
                    { name: 'large', label: t('design.size.large'), sampleClass: 'text-base' },
                  ].map(({ name, label, sampleClass }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setTextSize(name)}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        textSize === name
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className={`${sampleClass} font-medium`}>Aa</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">{t("profile.sidebarPlacement")}</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: 'left', label: t('design.sidebar.left') },
                    { name: 'right', label: t('design.sidebar.right') },
                    { name: 'top', label: t('design.sidebar.top') },
                    { name: 'bottom', label: t('design.sidebar.bottom') },
                  ].map(({ name, label }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSidebarPlacement(name as 'left' | 'right' | 'top' | 'bottom')}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        sidebarPlacement === name
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {view === 'privacy' && (
            <>
              <div className="space-y-3">
                <Label className="text-base font-semibold">{t("profile.privacy")}</Label>

                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("profile.lastSeenPrivacy")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'everyone', label: t('profile.privacy.everyone') },
                        { value: 'nobody', label: t('profile.privacy.nobody') },
                      ] as const).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPrivacyLastSeen(option.value)}
                          className={`rounded-lg border px-2 py-2 text-xs transition-all ${
                            privacyLastSeen === option.value
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border bg-background/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("profile.whoCanAddToGroups")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'everyone', label: t('profile.privacy.everyone') },
                        { value: 'nobody', label: t('profile.privacy.nobody') },
                      ] as const).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPrivacyWhoCanAdd(option.value)}
                          className={`rounded-lg border px-2 py-2 text-xs transition-all ${
                            privacyWhoCanAdd === option.value
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border bg-background/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        {t("profile.blockedUsers")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("profile.blockedUsersDescription")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setBlockedUsersOpen(true)}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" />
                      {t("profile.openBlockedUsers")}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="p-6 pt-0 flex justify-end gap-3">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          {(view === 'profile' || view === 'design' || view === 'privacy') && (
            <Button 
              onClick={handleSave} 
              disabled={updateProfile.isPending || uploadingImage}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.saveChanges")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Image Crop Dialog */}
    <Dialog open={!!cropImageSrc} onOpenChange={(open) => { if (!open) handleCropCancel(); }}>
      <DialogContent className="sm:max-w-[450px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl" aria-describedby={undefined}>
        <DialogHeader className="p-4 border-b border-border/50">
          <DialogTitle>{t("profile.cropTitle")}</DialogTitle>
        </DialogHeader>
        <div className="relative w-full" style={{ height: 320 }}>
          {cropImageSrc && (
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <div className="px-6 py-3">
          <Label className="text-xs text-muted-foreground mb-1 block">{t("profile.zoom")}</Label>
          <Slider
            min={1}
            max={3}
            step={0.05}
            value={[zoom]}
            onValueChange={([v]) => setZoom(v)}
          />
        </div>
        <div className="p-4 pt-0 flex justify-end gap-3">
          <Button variant="ghost" className="rounded-xl" onClick={handleCropCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleCropConfirm}
            disabled={uploadingImage}
            className="rounded-xl"
          >
            {uploadingImage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("profile.apply")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Photo Preview Dialog */}
    <Dialog open={!!previewImageUrl} onOpenChange={(open) => { if (!open) setPreviewImageUrl(null); }}>
      <DialogContent className="sm:max-w-[600px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl" aria-describedby={undefined}>
        <DialogHeader className="p-4 border-b border-border/50">
          <DialogTitle>{t("profile.photoTitle")}</DialogTitle>
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
            {t("common.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Blocked Users Dialog */}
    <Dialog open={blockedUsersOpen} onOpenChange={setBlockedUsersOpen}>
      <DialogContent className="sm:max-w-[460px] rounded-2xl p-0 overflow-hidden border-border/50 shadow-2xl" aria-describedby={undefined}>
        <DialogHeader className="p-4 border-b border-border/50">
          <DialogTitle>{t("profile.blockedUsers")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto p-4">
          {blockedUsersQuery.isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {blockedUsersQuery.data?.length === 0 && !blockedUsersQuery.isLoading && (
            <p className="text-sm text-muted-foreground">{t("profile.noBlockedUsers")}</p>
          )}
          {blockedUsersQuery.data?.map(u => (
            <div key={u.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={u.profileImageUrl || ''} />
                  <AvatarFallback>{(u.firstName || u.email || 'U')[0]}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{u.firstName || u.email || t("profile.unknown")}</span>
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
                {t("profile.unblock")}
              </Button>
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 p-4 flex justify-end">
          <Button variant="ghost" className="rounded-xl" onClick={() => setBlockedUsersOpen(false)}>
            {t("common.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
  );
}
