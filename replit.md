# EchoPath Nexus

## Overview
Multi-tenant AI-powered safety monitoring system for senior living facilities. Integrates ADT motion sensor webhooks with Google Gemini 1.5 Flash AI for scenario-based inactivity detection and personalized check-ins.

## Recent Changes
- **2026-02-13**: Voice-First Mobile App + Streaming AI
  - Chat screen rebuilt as voice-first interface with large microphone button
  - Audio recording via expo-av, text-to-speech via expo-speech
  - Streaming AI responses via SSE endpoint POST /api/mobile/respond-stream
  - Gemini audio transcription for voice-to-text (no separate STT service needed)
  - In-memory persona cache with 10-min TTL to reduce DB lookups
  - Conversation history summarization for long conversations (>30 messages)
  - Visual state indicators: listening (red), thinking (amber), speaking (green)
  - Text input fallback available via "Type" button
  - Upgraded to Gemini 2.0 Flash model
- **2026-02-13**: Expo React Native Mobile App
  - Standalone Expo project in mobile/ directory with expo-router, expo-secure-store
  - PIN login, AI companion chat, safety status, check-in alerts, announcements screens
  - API client connects to /api/mobile/* endpoints with JWT token management via SecureStore
  - Server URL persisted in SecureStore for cross-session use
  - POST /api/conversations endpoint added for mobile conversation creation
  - mobile/README.md with Expo Go preview instructions
- **2026-02-13**: Phase 6 Deployment & Simulation
  - scripts/onboard.js: Automated facility setup with resident, sensors, and test intake interview
  - scripts/simulateMotion.js: ADT motion simulator with 4 modes (normal, inactivity, burst, stop)
  - README.md: Full guide covering Admin Dashboard, Mobile Companion App, API reference, and architecture
  - mobilePin stripped from dashboard API responses for security
- **2026-02-13**: Phase 5.5 Mobile Companion Frontend
  - Mobile login page at /companion with large-text PIN entry for senior accessibility
  - Full-screen companion chat at /companion/chat with personalized AI conversation
  - EchoPath safety status badge (green=secure, amber=monitoring, red=alert)
  - Proactive check-in popup when inactivity is detected via WebSocket
  - Community announcements panel with unseen counter badge
  - Mobile auth context with 30-day token persistence in localStorage
  - Separate layout (no sidebar) for /companion/* routes
- **2026-02-13**: Phase 5 Mobile API Gateway
  - Mobile Sync: GET /api/mobile/sync/:entityId/:userId returns last AI message, safety status, community announcements
  - CORS: Express configured with origin: true, credentials, mobile-friendly headers (Expo/React Native compatible)
  - Auth: JWT-based token login via POST /api/mobile/login with PIN-based auth (bcrypt hashed)
  - Token lifecycle: 30-day expiry, DB-backed revocation via POST /api/mobile/logout, tokenId binding in JWT claims
  - Profile endpoint: GET /api/mobile/profile for authenticated resident profile data
  - mobile_tokens table and mobilePin column on residents added to schema
  - Auth middleware validates JWT signature, DB token existence, tokenId binding, and expiry
- **2026-02-13**: Phase 4 Facility Admin Dashboard UI
  - Enhanced Nexus Dashboard with resident monitoring grid (status lights: Green/Active, Red/Alert)
  - AI Insights panel: Gemini-powered mood analysis from last conversations per resident
  - Community Broadcast: form to send announcements to all AI companions, delivered as companion messages
  - community_broadcasts DB table for persistence
  - API endpoints: GET/POST /api/entities/:id/broadcasts, GET /api/entities/:id/ai-insights
- **2026-02-13**: Phase 2 Entity & User Management API
  - registryService layer for creating entities and managing residents
  - Privacy-first anonymous username generation (e.g. "Resident_7701") persisted in DB
  - Admin endpoints: POST /api/admin/entities, POST/GET /api/admin/:entityId/users
  - Zod validation in registry service for consistent data integrity
- **2026-02-13**: Phase 1 Multi-Tenant Infrastructure implemented
  - Tenant data folder provisioning at `/data/entities/[entityID]/{profiles,conversations,activity}`
  - `tenantResolver` middleware extracts `x-entity-id` header for data isolation
  - Daily file logging to `/data/logs/echopath-YYYY-MM-DD.log` (JSON format)
  - CORS, uuid, bcryptjs, jsonwebtoken dependencies installed
  - AI engine uses lazy initialization for Gemini client (works with placeholder responses if no API key)

## Project Architecture
- **Database**: PostgreSQL (Neon-backed via Drizzle ORM)
- **Backend**: Express.js with WebSocket support
- **Frontend**: React + Vite + shadcn/ui + Tailwind CSS
- **AI**: Google Gemini 1.5 Flash via @google/genai (lazy init)
- **Multi-tenancy**: Dual layer - PostgreSQL entityId foreign keys + file-based `/data/entities/[id]/` folders
- **Auth packages installed**: bcryptjs, jsonwebtoken (ready for JWT auth implementation)

## Key Files
- `shared/schema.ts` - Drizzle schema with all tables and Zod insert schemas
- `server/storage.ts` - IStorage interface and DatabaseStorage implementation
- `server/routes.ts` - All API routes including ADT webhook, mobile API, scenario triggers
- `server/ai-engine.ts` - Gemini AI integration with Digital Twin personas
- `server/tenant-folders.ts` - File-based tenant data folder management
- `server/daily-logger.ts` - Daily rotating JSON log file utility
- `server/middleware/tenant-resolver.ts` - Multi-tenant header middleware
- `server/middleware/mobile-auth.ts` - JWT-based mobile auth middleware with token binding
- `client/src/pages/dashboard.tsx` - Main Nexus Dashboard
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `scripts/onboard.js` - Facility onboarding automation
- `scripts/simulateMotion.js` - ADT motion sensor simulator
- `README.md` - System documentation and guide

## User Preferences
- API key-based Gemini integration (not managed AI Integrations)
- Multi-tenant file-based data isolation alongside database
