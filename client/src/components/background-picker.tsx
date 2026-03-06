import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CHAT_BACKGROUNDS, type ChatBackground } from "@/lib/chat-backgrounds";
import { cn } from "@/lib/utils";

interface BackgroundPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBgId: string;
  onSelect: (bgId: string) => void;
  /** URL of the current custom image background (if any) */
  customImageUrl: string | null;
  /** Called when user uploads a custom image */
  onCustomImage: (url: string) => void;
  /** Called when user removes the custom image */
  onRemoveCustomImage: () => void;
}

export function BackgroundPicker({
  open,
  onOpenChange,
  currentBgId,
  onSelect,
  customImageUrl,
  onCustomImage,
  onRemoveCustomImage,
}: BackgroundPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Track when native file picker is open — prevent dialog from closing
  const pickingFileRef = useRef(false);

  const handleUploadClick = () => {
    pickingFileRef.current = true;
    fileInputRef.current?.click();
    // Native file picker doesn't give us an "opened" event, so we reset
    // the flag on the next focus (which fires when the picker closes)
    const onFocus = () => {
      // Small delay so the change event fires first
      setTimeout(() => { pickingFileRef.current = false; }, 300);
      window.removeEventListener("focus", onFocus);
    };
    window.addEventListener("focus", onFocus);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only accept images
    if (!file.type.startsWith("image/")) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onCustomImage(data.url);
      onOpenChange(false);
    } catch (err) {
      console.error("Background upload failed:", err);
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isCustomSelected = currentBgId === "custom-image";

  // Prevent Radix Dialog from closing while the native file picker is open
  const preventClose = (e: Event) => {
    if (pickingFileRef.current || uploading) e.preventDefault();
  };

  return (
    <>
    {/* File input lives OUTSIDE the Dialog so it is never unmounted mid-pick */}
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFileSelect}
    />
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && (pickingFileRef.current || uploading)) return; // block close
      onOpenChange(v);
    }}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={preventClose}
        onPointerDownOutside={preventClose}
        onFocusOutside={preventClose}
      >
        <DialogHeader>
          <DialogTitle>Chat Background</DialogTitle>
          <DialogDescription>Choose a background for this chat.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 py-2">
          {CHAT_BACKGROUNDS.map((bg) => (
            <BackgroundSwatch
              key={bg.id}
              bg={bg}
              selected={bg.id === currentBgId}
              onClick={() => {
                onSelect(bg.id);
                onOpenChange(false);
              }}
            />
          ))}

          {/* Custom image swatch — shows uploaded image or upload button */}
          {customImageUrl ? (
            <div className="flex flex-col items-center gap-1.5 group relative">
              <button
                onClick={() => {
                  onSelect("custom-image");
                  onOpenChange(false);
                }}
                className="w-full"
              >
                <div
                  className={cn(
                    "w-full aspect-square rounded-xl border-2 transition-all overflow-hidden relative",
                    "hover:scale-105 active:scale-95",
                    isCustomSelected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border/60 hover:border-primary/50",
                  )}
                  style={{
                    backgroundImage: `url(${customImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  {isCustomSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              </button>
              {/* Remove button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveCustomImage();
                }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Remove custom image"
              >
                <X className="w-3 h-3" />
              </button>
              <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors leading-tight text-center">
                Custom
              </span>
            </div>
          ) : (
            <button
              onClick={handleUploadClick}
              disabled={uploading}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                className={cn(
                  "w-full aspect-square rounded-xl border-2 border-dashed transition-all overflow-hidden relative flex items-center justify-center",
                  "hover:scale-105 active:scale-95",
                  "border-border/60 hover:border-primary/50",
                )}
              >
                {uploading ? (
                  <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                ) : (
                  <ImagePlus className="w-6 h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </div>
              <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors leading-tight text-center">
                {uploading ? "Uploading…" : "Your Image"}
              </span>
            </button>
          )}
        </div>

      </DialogContent>
    </Dialog>
    </>
  );
}

function BackgroundSwatch({
  bg,
  selected,
  onClick,
}: {
  bg: ChatBackground;
  selected: boolean;
  onClick: () => void;
}) {
  const isDefault = bg.id === "default";

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 group"
    >
      <div
        className={cn(
          "w-full aspect-square rounded-xl border-2 transition-all overflow-hidden relative",
          "hover:scale-105 active:scale-95",
          selected
            ? "border-primary ring-2 ring-primary/30"
            : "border-border/60 hover:border-primary/50",
          isDefault && bg.previewExtra,
        )}
        style={isDefault ? {} : bg.style}
      >
        {/* Mini chat bubble previews inside the swatch */}
        <div className="absolute inset-0 flex flex-col justify-center items-center gap-1 p-1.5">
          <div className="w-[60%] h-2 rounded-full bg-white/80 self-end" />
          <div className="w-[50%] h-2 rounded-full bg-white/40 self-start" />
          <div className="w-[55%] h-2 rounded-full bg-white/80 self-end" />
        </div>

        {/* Selected checkmark */}
        {selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-4 h-4 text-primary-foreground" />
            </div>
          </div>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors leading-tight text-center">
        {bg.name}
      </span>
    </button>
  );
}
