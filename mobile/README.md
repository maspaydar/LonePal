# EchoPath Companion - Expo Mobile App

A React Native mobile app for senior residents, built with Expo. Connects to the EchoPath Nexus backend running on Replit.

## Features

- **Voice-First AI Chat** - Talk to your companion using your voice, with responses read aloud automatically
- **PIN Login** - Simple username + 4-digit PIN authentication with large, senior-friendly text
- **Safety Status** - Color-coded badge showing current safety status (green/amber/red)
- **Check-In Alerts** - Popup notifications when the system detects unusual inactivity
- **Community Announcements** - View facility-wide broadcasts from administrators
- **Text Fallback** - Optional text input for when voice isn't preferred

## Voice Chat Flow

1. Tap the large microphone button to start speaking
2. Tap again to stop recording
3. Your voice is sent to the backend and transcribed by Gemini AI
4. The AI companion generates a personalized response
5. The response is displayed on screen AND read aloud automatically
6. Visual indicators show the current state: Listening (red), Thinking (amber), Speaking (green)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed on your computer
- [Expo Go](https://expo.dev/go) app installed on your phone (iOS or Android)
- Your computer and phone must be on the same Wi-Fi network

### Setup

1. **Download this `mobile/` folder** to your local computer

2. **Install dependencies:**
   ```bash
   cd mobile
   npm install
   ```

3. **Configure the server URL:**

   You can set it from the login screen - enter your Replit app's published URL (e.g., `https://your-replit-app.replit.app`).

4. **Start the Expo development server:**
   ```bash
   npx expo start
   ```

   For tunnel mode (works across different networks):
   ```bash
   npx expo start --tunnel
   ```

5. **Open on your phone:**
   - Scan the QR code shown in the terminal with your phone's camera
   - Expo Go will open the app automatically

### Login Credentials

Use the anonymous username and facility ID from your EchoPath Nexus setup:

- **Username:** `Resident_XXXX` (assigned during onboarding)
- **PIN:** Any 4-digit number (first login creates your PIN)
- **Facility ID:** The numeric ID of your facility (e.g., `1`)

## Project Structure

```
mobile/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout with navigation
│   ├── index.tsx           # Login screen
│   ├── home.tsx            # Home dashboard
│   ├── chat.tsx            # Voice-first AI companion chat
│   └── announcements.tsx   # Community broadcasts
├── lib/
│   ├── api.ts              # API client with streaming support
│   ├── auth-context.tsx    # React auth context/provider
│   └── colors.ts           # Color theme constants
├── app.json                # Expo configuration
├── package.json            # Dependencies
└── tsconfig.json           # TypeScript config
```

## Key Dependencies

- `expo-speech` - Text-to-speech for reading AI responses aloud
- `expo-av` - Audio recording for voice input
- `expo-file-system` - Reading recorded audio files for upload
- `expo-secure-store` - Secure storage for tokens and server URL

## API Endpoints Used

All requests go to the EchoPath Nexus backend:

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/mobile/login` | POST | No | PIN-based authentication |
| `/api/mobile/logout` | POST | JWT | End session |
| `/api/mobile/sync/:entityId/:userId` | GET | JWT | Sync dashboard data |
| `/api/mobile/resident/:id/status` | GET | JWT | Get safety status |
| `/api/mobile/respond` | POST | JWT | Send text chat message |
| `/api/mobile/respond-stream` | POST | JWT | Send voice/text with streaming SSE response |
| `/api/mobile/conversation` | POST | JWT | Create or get active conversation |
| `/api/mobile/profile` | GET | JWT | Get resident profile |

## Design Principles

- **Voice-first** - Primary interaction is through voice, not typing
- **Large text** (18-24pt) for readability
- **High contrast** colors with clear visual hierarchy
- **Big touch targets** (80px microphone button) for ease of use
- **Minimal navigation** - three main screens only
- **Color-coded states** - visual feedback for listening, thinking, speaking
- **Text-to-speech** - all AI responses are read aloud automatically

## App Store Submission

### Before You Build

Update the following placeholder values in `app.json` before running a production build:

| Field | Location in app.json | What to set |
|---|---|---|
| `owner` | `expo.owner` | Your Expo account username (from [expo.dev](https://expo.dev)) |
| `serverUrl` | `expo.extra.serverUrl` | Your deployed Replit backend URL (e.g. `https://your-app.replit.app`) |
| `projectId` | `expo.extra.eas.projectId` | The UUID from `eas init` or your Expo dashboard |

### EAS Build Setup

1. **Install EAS CLI** on your local machine:
   ```bash
   npm install -g eas-cli
   ```

2. **Log in to your Expo account:**
   ```bash
   eas login
   ```

3. **Initialize the project** (links it to your Expo account and sets the projectId):
   ```bash
   cd mobile
   eas init
   ```

4. **Run a preview build** (internal distribution, no store credentials needed):
   ```bash
   npm run build:preview
   ```

5. **Run a production build** (requires Apple Developer / Google Play credentials):
   ```bash
   npm run build:production
   # or separately:
   npm run build:ios
   npm run build:android
   ```

6. **Submit to the stores:**
   ```bash
   npm run submit:ios
   npm run submit:android
   ```

### Build Profiles

Three profiles are defined in `eas.json`:

| Profile | Distribution | iOS | Android | Use for |
|---|---|---|---|---|
| `development` | Internal | Simulator | APK | Local development with dev client |
| `preview` | Internal | Device | APK | QA / stakeholder testing |
| `production` | Store | App Store | AAB | Public release |

### Required Permissions

The app requests the following permissions (already declared in `app.json`):

- **Microphone** (`NSMicrophoneUsageDescription`) — for voice chat recording
- **Speech Recognition** (`NSSpeechRecognitionUsageDescription`) — for on-device transcription fallback
- **Android RECORD_AUDIO** — equivalent microphone permission on Android

### Assets

- `assets/icon.png` — App icon (1024×1024 PNG, replace with final design before submission)
- `assets/adaptive-icon.png` — Android adaptive icon foreground (1024×1024 PNG)
- `assets/favicon.png` — Web favicon (48×48 PNG)
