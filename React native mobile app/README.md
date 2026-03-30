# Ilissiot Mobile (Expo React Native)

React Native (Expo) version of Ilissiot messenger. It connects to the same backend API as the web app.

## Features

- Authentication (login/register)
- 1-on-1 and group chats
- Real-time messaging via WebSocket
- Message reactions, edit, delete
- File sharing (images, videos, audio, documents up to 50MB)
- Polls and pinned messages
- User blocking and group management
- Typing indicators and read receipts
- Online status and profile customization
- Audio/video call UI (requires Expo development build with native WebRTC)

## Requirements

- Node.js 18+
- npm
- Expo Go (physical device) or Android Studio (emulator)

## Quick Start

```bash
npm install
npx expo start
```

Useful commands:

- `npm run start` - start Metro
- `npm run android` - open Android target
- `npm run ios` - open iOS target
- `npm run web` - open web target
- `npm run typecheck` - TypeScript check
- `npm run doctor` - Expo project health checks

## Backend Configuration

Server URL is configured in `src/config.ts`.

Current default:

- `https://ilissiot.onrender.com`

For local backend development:

- Android emulator: `http://10.0.2.2:5000`
- Physical device: `http://<your-lan-ip>:5000`
- iOS simulator: `http://localhost:5000`

## Android on Windows

If `expo start --android` fails with:

`Failed to resolve the Android SDK path... Use ANDROID_HOME to set the Android SDK location.`

Install Android Studio/SDK and set environment variables.

Default SDK path:

- `C:\Users\<YOU>\AppData\Local\Android\Sdk`

PowerShell (current session):

```powershell
$env:ANDROID_HOME = "$HOME\AppData\Local\Android\Sdk"
$env:PATH = "$env:PATH;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator"
```

If you do not use emulator, run `npx expo start` and open the app in Expo Go on your phone.

## Pre-Push Checklist

```bash
npm run typecheck
npm run doctor
```
