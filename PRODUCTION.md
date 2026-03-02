# Production Deployment Guide

This guide covers what's needed to deploy GapMiner to production.

## Pre-Deployment Checklist

### 1. Environment Variables

#### Frontend (.env)
```env
# Firebase
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Backend API
VITE_API_URL=https://your-backend-api.com/api

# Monitoring (Optional)
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
```

#### Backend (server/.env)
```env
# Server
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/gapminer
DB_POOL_MAX=20

# Auth
JWT_SECRET=your-secure-random-secret-at-least-32-chars
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=30d
BCRYPT_ROUNDS=12

# API Keys (CRITICAL - keep secret!)
FIRECRAWL_API_KEY=your_firecrawl_key

# ============================================================================
# AI Provider API Keys (Configure one or more)
# ============================================================================
# Default provider: gemini, openai, anthropic, openrouter, deepseek, mistral, cohere
DEFAULT_AI_PROVIDER=gemini

# Google Gemini (default)
GEMINI_API_KEY=

# OpenAI (GPT-4, GPT-4o, etc.)
OPENAI_API_KEY=

# Anthropic (Claude)
ANTHROPIC_API_KEY=

# OpenRouter (Aggregates 200+ models - recommended)
# Sign up at https://openrouter.ai/ for free credits
OPENROUTER_API_KEY=

# DeepSeek (Cheap & fast)
DEEPSEEK_API_KEY=

# Mistral AI
MISTRAL_API_KEY=

# Cohere
COHERE_API_KEY=

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# Monitoring (Optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### 2. Required Services

- [ ] **PostgreSQL Database** (Neon, Railway, Render, or self-hosted)
- [ ] **Firebase Project** (Auth + Firestore)
- [ ] **Firecrawl** (Web scraping API)
- [ ] **AI Provider** (Choose one or more):
  - **Google Gemini** (gemini-2.0-flash, gemini-1.5-pro)
  - **OpenAI** (GPT-4o, GPT-4, GPT-3.5-turbo)
  - **Anthropic Claude** (Claude 4, Claude 3.5)
  - **OpenRouter** (200+ models - recommended for flexibility)
  - **DeepSeek** (Cheap & fast)
  - **Mistral AI**
  - **Cohere**
- [ ] **Sentry** (Error tracking - optional but recommended)

### 3. Security Checklist

- [ ] Generate strong JWT_SECRET (use `openssl rand -base64 32`)
- [ ] Add production domain to Firebase Authorized Domains
- [ ] Configure CORS_ORIGIN to exact production domain
- [ ] Enable Firestore security rules
- [ ] Set up proper database connection pooling
- [ ] Configure rate limiting for production traffic

### 4. Deployment Steps

#### Option A: Vercel + Render/Railway (Recommended)

**Frontend (Vercel):**
1. Connect GitHub repo to Vercel
2. Add environment variables
3. Deploy

**Backend (Render/Railway):**
1. Connect repo or use CLI
2. Add environment variables
3. Deploy

#### Option B: Firebase Hosting + Cloud Run

**Frontend:**
```bash
npm run build
firebase deploy --only hosting
```

**Backend:**
```bash
cd server
npm run build
# Deploy to Cloud Run via gcloud or Terraform
```

### 5. Post-Deployment

- [ ] Verify /api/health endpoint works
- [ ] Test user registration/login
- [ ] Test paper crawling functionality
- [ ] Set up monitoring alerts in Sentry
- [ ] Configure custom domain (optional)
- [ ] Set up SSL certificates (automatic with most platforms)

### 6. CI/CD Secrets Required

Add these to GitHub Secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `DATABASE_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `FIRECRAWL_API_KEY`
- `SENTRY_DSN`
- All Firebase config values

## Troubleshooting

### Common Issues

**CORS Errors:**
- Check CORS_ORIGIN matches exact frontend URL (no trailing slash)

**API Key Errors:**
- Verify GEMINI_API_KEY and FIRECRAWL_API_KEY are set in server/.env
- Keys should NOT be prefixed with VITE_ in server config

**Database Connection:**
- Verify DATABASE_URL format is correct
- Check database is accessible from deployment IP

**Firebase Auth:**
- Add production domain to Firebase Console → Authentication → Settings → Authorized domains
