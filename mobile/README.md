# EchoPath Companion - Expo Mobile App

A React Native mobile app for senior residents, built with Expo. Connects to the EchoPath Nexus backend running on Replit.

## Features

- **PIN Login** - Simple username + 4-digit PIN authentication with large, senior-friendly text
- **AI Companion Chat** - Full-screen conversation with your personalized Digital Twin AI
- **Safety Status** - Color-coded badge showing current safety status (green/amber/red)
- **Check-In Alerts** - Popup notifications when the system detects unusual inactivity
- **Community Announcements** - View facility-wide broadcasts from administrators

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

   Open `lib/api.ts` and change the `BASE_URL` to your Replit app's published URL:
   ```typescript
   let BASE_URL = 'https://your-replit-app.replit.app';
   ```

   Or you can set it from the login screen via "Server Settings".

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
│   ├── chat.tsx            # AI companion chat
│   └── announcements.tsx   # Community broadcasts
├── lib/
│   ├── api.ts              # API client for EchoPath backend
│   ├── auth-context.tsx    # React auth context/provider
│   └── colors.ts           # Color theme constants
├── app.json                # Expo configuration
├── package.json            # Dependencies
└── tsconfig.json           # TypeScript config
```

## API Endpoints Used

All requests go to the EchoPath Nexus backend:

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/mobile/login` | POST | No | PIN-based authentication |
| `/api/mobile/logout` | POST | JWT | End session |
| `/api/mobile/sync/:entityId/:userId` | GET | JWT | Sync dashboard data |
| `/api/mobile/resident/:id/status` | GET | JWT | Get safety status |
| `/api/mobile/respond` | POST | JWT | Send chat message |
| `/api/mobile/conversation` | POST | JWT | Create or get active conversation |
| `/api/mobile/profile` | GET | JWT | Get resident profile |

## Design Principles

- **Large text** (18-24pt) for readability
- **High contrast** colors with clear visual hierarchy
- **Big touch targets** (48px minimum) for ease of use
- **Minimal navigation** - three main screens only
- **Color-coded safety** - green (safe), amber (monitoring), red (alert)
