---
description: How to set up and run the GapMiner backend with PostgreSQL
---

# Backend Setup Workflow

## Prerequisites
- PostgreSQL 14+ installed and running
- Node.js 18+
- npm 9+

## Steps

### 1. Install server dependencies
// turbo
```bash
npm run server:install
```

### 2. Create the PostgreSQL database
```bash
psql -U postgres -c "CREATE DATABASE gapminer;"
```
Or via pgAdmin: Create a new database named `gapminer`.

### 3. Configure environment variables
Copy the server `.env.example` to `.env`:
```bash
cp server/.env.example server/.env
```
Then edit `server/.env` with your values:
- `DATABASE_URL` — your PostgreSQL connection string
- `JWT_SECRET` — a random 32+ character secret
- `GEMINI_API_KEY` — your Google Gemini API key
- `FIRECRAWL_API_KEY` — your Firecrawl API key

### 4. Run database migrations
// turbo
```bash
npm run db:migrate
```
This creates all tables, indexes, and triggers.

### 5. Seed demo data (optional)
// turbo
```bash
npm run db:seed
```
Creates a demo user: `demo@gapminer.ai` / `demo1234`

### 6. Configure frontend environment
Copy the frontend `.env.example`:
```bash
cp .env.example .env
```
Set `VITE_API_URL=http://localhost:3001/api` (already the default).

### 7. Start both frontend and backend
```bash
npm run dev:full
```
This runs:
- Frontend (Vite) on `http://localhost:5173`
- Backend (Express) on `http://localhost:3001`

### Alternative: Run separately
```bash
# Terminal 1 - Backend
npm run dev:server

# Terminal 2 - Frontend
npm run dev
```

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh JWT
- `GET /api/auth/me` — Get profile
- `PATCH /api/auth/profile` — Update profile

### Papers
- `GET /api/papers` — List papers (with search, pagination)
- `GET /api/papers/:id` — Get paper with gaps
- `POST /api/papers` — Create paper
- `DELETE /api/papers/:id` — Delete paper

### Gaps
- `GET /api/gaps` — List gaps (with filters)
- `POST /api/gaps` — Create gap
- `POST /api/gaps/batch` — Batch create from AI analysis
- `POST /api/gaps/:id/vote` — Vote on gap
- `PATCH /api/gaps/:id/resolve` — Mark resolved
- `DELETE /api/gaps/:id` — Delete gap
- `GET /api/gaps/stats/overview` — Dashboard stats

### Collections
- `GET /api/collections` — List collections
- `POST /api/collections` — Create collection
- `POST /api/collections/:id/papers` — Add paper
- `POST /api/collections/:id/gaps` — Add gap
- `PATCH /api/collections/:id/star` — Toggle star
- `DELETE /api/collections/:id` — Delete collection

### AI (Secure Proxy)
- `POST /api/ai/scrape` — Scrape paper URL
- `POST /api/ai/analyze-gaps` — Extract gaps from content
- `POST /api/ai/chat` — Chat with papers
- `POST /api/ai/explain-unsolved` — Explain unsolved problem
- `POST /api/ai/generate-proposal` — Generate research proposal
- `POST /api/ai/compare-papers` — Compare papers
- `POST /api/ai/generate-startup-idea` — Generate startup idea
- `POST /api/ai/generate-research-questions` — Generate questions
- `POST /api/ai/red-team-analysis` — Red-team a direction
- `POST /api/ai/predict-impact` — Predict impact
- `GET /api/ai/health` — AI service health

### Health
- `GET /api/health` — Full health check

## Architecture
```
Frontend (Vite + React)
     │
     │ HTTP (JWT auth)
     ▼
Backend (Express + Node.js)
     │
     ├── /api/auth     → bcrypt + JWT
     ├── /api/papers   → PostgreSQL CRUD
     ├── /api/gaps     → PostgreSQL CRUD
     ├── /api/collections → PostgreSQL CRUD
     └── /api/ai       → Gemini / Firecrawl proxy
           │
           ├── Gemini API (server-side only)
           └── Firecrawl API (server-side only)
```
