# Android App Assets

This folder contains the Expo assets used by the Android app.

## Required Android Assets

- `icon.png` - Main app icon (1024x1024)
- `adaptive-icon.png` - Android adaptive foreground icon (1024x1024, transparent background recommended)
- `splash.png` - Splash image (1284x2778 recommended)

## Branding Rule

All Android app icons and splash visuals should be derived from one source logo so branding stays consistent.

## Quick Setup (PowerShell)

From this directory:

```powershell
Copy-Item .\logo-source.png .\icon.png -Force
Copy-Item .\logo-source.png .\adaptive-icon.png -Force
Copy-Item .\logo-source.png .\splash.png -Force
```

Note: This is a fast fallback. For production quality, create a proper splash layout and adaptive icon safe-zone composition from the same source logo.
