# EchoPath Nexus

## Overview
Multi-tenant AI-powered safety monitoring system for senior living facilities. Integrates ADT motion sensor webhooks with Google Gemini 1.5 Flash AI for scenario-based inactivity detection and personalized check-ins.

## Recent Changes
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
- `client/src/pages/dashboard.tsx` - Main Nexus Dashboard
- `client/src/components/app-sidebar.tsx` - Navigation sidebar

## User Preferences
- API key-based Gemini integration (not managed AI Integrations)
- Multi-tenant file-based data isolation alongside database
