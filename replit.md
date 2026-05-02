# Nursing Academic Projects Generator

## Overview
A full-stack bilingual (Arabic/English) AI-powered academic project generator for nursing college students. Students fill in a form, the AI generates a full research project via streaming SSE, they pick Pexels images, pay via Vodafone Cash/InstaPay, and an admin approves/rejects before they get their download.

## Architecture

### Frontend — `artifacts/nursing-projects` (React + Vite)
- **Preview path:** `/` (root)
- **Port:** 21677
- RTL/LTR switching via react-i18next (Arabic default)
- Cairo/Amiri fonts for Arabic, Inter for English
- Framer Motion animations throughout
- Tailwind CSS with a medical blue/teal theme

**Pages:**
- `/` — Multi-step intake form (topic, students, supervisor, department, language, logo upload)
- `/generate/:id` — Live SSE streaming text with sentence-by-sentence Framer Motion animation + Pexels image grid
- `/payment/:id` — Receipt upload (Cloudinary)
- `/status/:id` — Project status tracker (polls API)
- `/admin` — Admin dashboard (login: admin / nursing2025)
- `/admin/stats` — Admin statistics

### Backend — `artifacts/api-server` (Node.js/Express + TypeScript)
- **Preview path:** `/api`
- **Port:** 8080
- Routes: `src/routes/projects.ts`, `src/routes/media.ts`, `src/routes/admin.ts`
- Database: PostgreSQL via Drizzle ORM

### Database — `lib/db`
- Table: `projects` — stores all project state, generated content, image URLs, receipt URLs, download links

## API Endpoints
- `GET /api/projects` — list projects (filterable by status)
- `POST /api/projects` — create project
- `GET /api/projects/:id` — get project
- `POST /api/projects/:id/generate` — stream AI generation (SSE)
- `POST /api/projects/:id/select-images` — save selected images
- `POST /api/projects/:id/upload-receipt` — save receipt URL
- `POST /api/projects/:id/approve` — admin approve
- `POST /api/projects/:id/reject` — admin reject
- `GET /api/media/pexels-search` — search Pexels
- `POST /api/media/upload-image` — upload to Cloudinary
- `GET /api/admin/stats` — dashboard stats

## External Services & Secrets
| Secret | Purpose |
|--------|---------|
| `GROQ_KEY_1`, `GROQ_KEY_2` | Primary AI generation (llama-3.3-70b) |
| `OPENROUTER_KEY_1`, `OPENROUTER_KEY_2` | Fallback AI (llama-3.3-70b via OpenRouter) |
| `GEMINI_API_KEY` | Final AI fallback (gemini-2.0-flash) |
| `PEXELS_API_KEY` | Image search |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image/receipt upload |
| `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` | Reserved for future auth |
| `SESSION_SECRET` | Reserved |

## AI Fallback Chain
1. Groq Key 1 (llama-3.3-70b-versatile)
2. Groq Key 2
3. OpenRouter Key 1 (meta-llama/llama-3.3-70b-instruct)
4. OpenRouter Key 2
5. Gemini (gemini-2.0-flash)

## Key Features
- **Logo Upload:** University + Faculty logos uploaded via Cloudinary, stored per-project
- **SSE Streaming:** AI text streams sentence-by-sentence with Framer Motion fade-in animation
- **Image Selection:** Pexels grid with glowing selection border, up to 5 images
- **Payment Gate:** Admin must approve receipt before student gets download
- **Admin Dashboard:** Filter by status, view receipts, approve/reject with reason

## Status Flow
`draft` → `generating` → `images_pending` → `payment_pending` → `pending_approval` → `approved`/`rejected` → `completed`

## i18n
- Arabic (RTL, Cairo/Amiri fonts) — default
- English (LTR, Inter font)
- Toggle in header
