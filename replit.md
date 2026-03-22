# EchoPath Nexus

## Overview
EchoPath Nexus is a multi-tenant, AI-powered safety monitoring system designed for senior living facilities. Its primary purpose is to enhance resident safety through proactive inactivity detection, personalized check-ins, and a comprehensive suite of administrative tools. The system integrates various hardware sensors (ADT motion sensors, ESP32 mmWave sensors) with Google Gemini AI for intelligent scenario-based monitoring. It offers a secure and isolated environment for each facility, with capabilities for remote management, health monitoring, and a voice-first mobile companion app for residents. The project aims to provide peace of mind for residents and caregivers by leveraging advanced AI and IoT technologies to create a responsive and intuitive safety net.

## User Preferences
- API key-based Gemini integration (not managed AI Integrations)
- Multi-tenant file-based data isolation alongside database

## System Architecture
The system employs a multi-tenant architecture with data isolation at both the database level (PostgreSQL with `entityId` foreign keys) and the file system level (`/data/entities/[id]/` folders). The backend is built with Express.js, providing a robust API layer and WebSocket support for real-time communication. The frontend utilizes React, Vite, shadcn/ui, and Tailwind CSS for a responsive and modern user interface.

**Key Architectural Components:**
- **Dual-Hardware Architecture:** Supports both ADT motion sensors integrated with Google Home (`adt_google`) and custom ESP32-S3-BOX-3 units with HLK-LD2410 mmWave sensors (`esp32_custom`).
- **AI Engine:** Leverages Google Gemini 1.5 Flash for scenario-based inactivity detection, personalized check-ins, mood analysis, and conversational AI. It supports entity-specific API keys and lazy initialization.
- **Smart Speaker Integration:** A `speaker-gateway` service handles pushing AI-generated audio check-ins to Google Home speakers, activates listen mode for voice responses, and respects quiet hours. ESP32 units use a dedicated WebSocket-based speaker service.
- **Mobile Companion App:** A voice-first Expo React Native application provides residents with an AI companion chat, safety status, check-in alerts, and community announcements. It features PIN login, streaming AI responses via SSE, and Gemini audio transcription.
- **Three-Tier Multi-Tenant SaaS Architecture:**
  - **Level 1 (Super Admin):** `/super-admin/*` routes with TOTP 2FA, facility registry, remote health checks. Auth stored in `sa_token`/`sa_admin` localStorage keys.
  - **Level 2 (Company Admin):** `/login` auth gate with `CompanyAuthGuard`. JWT stored as `co_token`/`co_user` in localStorage. `useCompanyAuth` hook provides `getEntityId()`, `setSession()`, `logout()`. All entity-scoped API queries use dynamic entityId. Sidebar shows user name, role, and logout button. User Management page (`/user-management`) visible to admin role only.
  - **Level 3 (Mobile/Resident):** PIN-based login via mobile token endpoints.
- **Super-Admin Command Hub:** A centralized dashboard for managing multiple EchoPath facility installations, including authentication with TOTP 2FA, facility registry, remote configuration push, health monitoring, and a remote diagnostic & maintenance tunnel.
- **Remote Diagnostic & Maintenance Tunnel:** Provides HMAC-signed access for remote log retrieval, service restarts, cache clearing, and system diagnostics for individual facilities.
- **Tenant Isolation & Security:** `tenantResolver` middleware ensures data isolation. Mobile authentication uses JWTs with PIN-based login, DB-backed token revocation, and HMAC-SHA256 for Super-Admin remote commands.
- **Data Storage:** PostgreSQL (Neon-backed via Drizzle ORM) for structured data, and file-based storage for tenant-specific profiles, conversations, and activity logs.
- **UI/UX:** The administrative dashboards (Nexus and Super-Admin) feature intuitive UIs for resident monitoring, unit management, health maps, log streams, and recovery script execution. The mobile app prioritizes accessibility with large-text PIN entry and visual state indicators.

## External Dependencies
- **Database:** PostgreSQL (via Drizzle ORM)
- **AI:** Google Gemini 1.5 Flash (@google/genai)
- **Hardware Integration:**
    - ADT (for motion sensor webhooks)
    - Google Home (for smart speaker integration and audio output)
    - ESP32-S3-BOX-3 with HLK-LD2410 mmWave sensors (for custom sensor and speaker functionality)
- **Authentication:** `bcryptjs`, `jsonwebtoken`, `otplib` (for TOTP 2FA)
- **Mobile Development:** Expo (expo-router, expo-secure-store, expo-av, expo-speech)