# HeyGrand

AI-powered safety monitoring system for senior living facilities. Integrates ADT motion sensors with Google Gemini AI for inactivity detection, personalized companion chat, and proactive check-ins.

---

## Quick Start

### 1. Launch the Application

Click **Run** or start the workflow. The server starts on port 5000, serving both the Admin Dashboard and Mobile Companion App.

### 2. Seed Demo Data (Optional)

If starting fresh, seed the database with sample residents and sensors:

```bash
curl -X POST http://localhost:5000/api/seed
```

### 3. Open the Admin Dashboard

Navigate to the root URL in your browser:

```
https://<your-replit-url>/
```

The dashboard shows:
- **Resident Monitoring Grid** with status lights (green = safe, amber = checking, red = alert)
- **AI Mood Insights** analyzing recent conversations per resident
- **Community Broadcasts** to send announcements through AI companions
- **Alerts Panel** with active scenario tracking

### 4. Expo Mobile App (React Native)

A standalone Expo React Native app lives in the `mobile/` directory. To run it on your phone:

1. **On your local computer**, copy or clone the `mobile/` folder
2. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```
3. Start the Expo development server:
   ```bash
   npx expo start
   ```
   Or use tunnel mode for cross-network access:
   ```bash
   npx expo start --tunnel
   ```
4. Scan the QR code with your phone (Expo Go must be installed)
5. On the login screen, tap **Server Settings** and enter your Replit app's published URL
6. Log in with your resident username, PIN, and facility ID

See `mobile/README.md` for full details.

---

## Simulation Scripts

### Onboard a New Facility

Sets up a complete facility with a resident, sensors, and a processed intake interview:

```bash
node scripts/onboard.js
```

This creates:
- A new facility ("Sunset Gardens Senior Living")
- A resident with full biography and Digital Twin persona
- 3 ADT motion sensors (hallway, common room, resident room)
- Default scenario configurations (inactivity, fall detection, etc.)

### Simulate ADT Motion Sensors

Send mock motion events to test the inactivity monitoring system:

```bash
# Keep a resident "safe" with regular motion pings (every 5 min)
node scripts/simulateMotion.js 1 1 normal

# Trigger a 10-minute inactivity alert (sends one ping, waits 12 min)
node scripts/simulateMotion.js 1 1 inactivity

# Send rapid motion bursts (10 pings in 10 seconds)
node scripts/simulateMotion.js 1 1 burst

# Send a single ping and exit
node scripts/simulateMotion.js 1 1 stop
```

**Arguments:**
| Argument   | Description                              | Default |
|------------|------------------------------------------|---------|
| entityId   | Facility ID                              | 1       |
| residentId | Target resident ID (omit for shared)     | all     |
| mode       | `normal`, `inactivity`, `burst`, `stop`  | normal  |

---

## Testing the Full Flow

### Step 1: Onboard

```bash
node scripts/onboard.js
```

Note the Entity ID, Resident ID, and Anonymous Username from the output.

### Step 2: Start Motion Simulation

In a separate terminal, start the simulator to keep the resident marked as "safe":

```bash
node scripts/simulateMotion.js <entityId> <residentId> normal
```

### Step 3: Monitor the Dashboard

Open the Admin Dashboard and watch the resident status stay green while motion is being detected.

### Step 4: Test Inactivity Alert

Stop the motion simulator (Ctrl+C), then wait 10 minutes. The system will:
1. Detect the inactivity period
2. Trigger a "Gentle Check-in" scenario
3. Send an AI-powered check-in message through the companion chat
4. Create an alert visible on the dashboard

Or run the inactivity simulation directly:

```bash
node scripts/simulateMotion.js <entityId> <residentId> inactivity
```

### Step 5: Test the Mobile App

The resident-facing companion app is a standalone Expo React Native app in the `mobile/` directory. See `mobile/README.md` for setup instructions to run it on your phone via Expo Go.

**Mobile API endpoints available:**
- `POST /api/mobile/login` for PIN-based authentication
- `GET /api/mobile/sync/:entityId/:userId` with Bearer token for data sync
- `POST /api/mobile/respond` for AI companion chat
- `POST /api/mobile/conversation` for creating conversations
- CORS is configured to accept requests from any origin

---

## API Reference

### Admin Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/entities/:id/dashboard` | Full dashboard data |
| POST | `/api/admin/entities` | Create facility |
| POST | `/api/admin/:entityId/users` | Add resident |
| GET | `/api/entities/:id/ai-insights` | AI mood analysis |
| GET/POST | `/api/entities/:id/broadcasts` | Community announcements |

### Chat Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/:entityId/:userId` | Send chat message |
| GET | `/api/chat/:entityId/:userId/history` | Get conversation history |

### Mobile Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mobile/login` | Authenticate with username + PIN |
| POST | `/api/mobile/logout` | Revoke session token |
| GET | `/api/mobile/sync/:entityId/:userId` | Sync latest data |
| GET | `/api/mobile/profile` | Get resident profile |

### Webhook Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhook/adt` | ADT motion sensor webhook |
| POST | `/api/safety/adt-webhook/:entityId/:userId` | Per-resident safety webhook |

### Test Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/seed` | Seed demo data |
| POST | `/api/test/ingest` | Process intake transcript |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-configured on Replit) |
| `SESSION_SECRET` | Yes | JWT signing key for mobile auth |
| `GEMINI_API_KEY` | No | Google Gemini API key for AI features (falls back to keyword analysis) |

---

## Architecture

```
Client (React + Vite) - Admin Dashboard Only
  /                  -> Admin Dashboard (sidebar layout)

Mobile (Expo React Native) - Resident Companion App
  Standalone app in mobile/ directory

Server (Express + WebSocket)
  /api/*             -> REST API endpoints
  /ws                -> WebSocket for real-time updates
  /api/webhook/adt   -> ADT sensor integration

Database (PostgreSQL via Drizzle ORM)
  entities           -> Facilities (multi-tenant)
  residents          -> Resident profiles + Digital Twin personas
  sensors            -> ADT motion sensor registry
  motion_events      -> Motion detection log
  conversations      -> Chat sessions
  messages           -> Chat messages
  active_scenarios   -> Inactivity/safety scenarios
  alerts             -> System alerts
  mobile_tokens      -> Mobile auth sessions
  community_broadcasts -> Facility announcements
```
