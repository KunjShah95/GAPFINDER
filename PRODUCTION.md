# Production Deployment Guide

This guide covers what's needed to deploy GapMiner to production.

## Quick Start

To get GapMiner running, you need these services:

1. **PostgreSQL** (Database)
2. **Firebase** (Authentication)
3. **One AI Provider** (for research analysis)

---

## Required API Keys & Services

### 1. Database (REQUIRED)

| Service | Purpose | Cost | Link |
|---------|---------|------|------|
| **Neon** | PostgreSQL serverless | Free tier available | https://neon.tech |
| **Railway** | Full PostgreSQL | Free tier available | https://railway.app |
| **Render** | Managed PostgreSQL | Free tier available | https://render.com |
| **Supabase** | PostgreSQL + extras | Free tier available | https://supabase.com |

```env
DATABASE_URL=postgresql://user:pass@host:5432/gapminer
```

### 2. Authentication (REQUIRED)

| Service | Purpose | Cost | Link |
|---------|---------|------|------|
| **Firebase Auth** | User authentication | Free tier | https://firebase.google.com |

```env
# Frontend (.env)
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
```

### 3. AI Provider (REQUIRED - Choose One)

| Provider | Models | Strength | Cost | Sign Up |
|----------|--------|----------|------|---------|
| **Google Gemini** | gemini-2.0-flash, 1.5-pro | Best overall | Free/Pay | https://aistudio.google.com |
| **OpenAI** | GPT-4o, GPT-4 | Best quality | Pay | https://platform.openai.com |
| **Anthropic** | Claude 4, 3.5 | Best reasoning | Pay | https://console.anthropic.com |
| **OpenRouter** | 200+ models | Flexibility | Pay | https://openrouter.ai |
| **DeepSeek** | DeepSeek-V3 | Cheap/fast | Very cheap | https://platform.deepseek.com |

```env
# Choose ONE provider (or multiple for fallback)
DEFAULT_AI_PROVIDER=gemini

# Add your key (at least one required)
GEMINI_API_KEY=your_gemini_key
# OR
OPENAI_API_KEY=your_openai_key
# OR
ANTHROPIC_API_KEY=your_anthropic_key
# OR
OPENROUTER_API_KEY=your_openrouter_key
```

### 4. Web Scraping (Optional - for crawling)

| Service | Purpose | Cost | Link |
|---------|---------|------|------|
| **Firecrawl** | Web scraping API | Free credits | https://firecrawl.dev |

```env
FIRECRAWL_API_KEY=your_firecrawl_key
```

### 5. Monitoring (Optional but Recommended)

| Service | Purpose | Cost | Link |
|---------|---------|------|------|
| **Sentry** | Error tracking | Free tier | https://sentry.io |

```env
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### 6. Payments (Optional - for subscriptions)

| Service | Purpose | Cost | Link |
|---------|---------|------|------|
| **Stripe** | Payment processing | Pay per use | https://stripe.com |

---

## Environment Configuration

### Frontend (.env)

```env
# Firebase Auth
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Backend
VITE_API_URL=https://your-backend-api.com/api

# Monitoring
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Backend (server/.env)

```env
# Server
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com

# Database (REQUIRED)
DATABASE_URL=postgresql://user:pass@host:5432/gapminer
DB_POOL_MAX=20

# Auth (REQUIRED - generate with: openssl rand -base64 32)
JWT_SECRET=your-secure-random-secret-at-least-32-chars
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=30d
BCRYPT_ROUNDS=12

# AI (REQUIRED - at least one)
DEFAULT_AI_PROVIDER=gemini
GEMINI_API_KEY=
OPENAI_API_KEY=
# ...other AI providers as needed

# Web Scraping (optional)
FIRECRAWL_API_KEY=

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# Monitoring (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx

# Stripe (optional)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## GitHub Actions Secrets

Before running the CI/CD pipeline, add these secrets to your GitHub repository at **Settings → Secrets and variables → Actions**:

### Required for all branches (CI build)

| Secret | Purpose | Source |
|--------|---------|--------|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key | Firebase Console → Project Settings → General |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | Firebase Console |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | `your-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID | Firebase Console → Project Settings → Cloud Messaging |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | Firebase Console → Project Settings → General |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Analytics ID | Firebase Console (optional) |
| `VITE_API_URL` | Backend API URL | `https://gapminer-backend-xxxxx-uc.a.run.app/api` (get after Cloud Run deploy) |
| `DATABASE_URL` | PostgreSQL connection string | Your DB provider (Neon, Cloud SQL, etc.) |
| `JWT_SECRET` | JWT signing secret | Generate with `openssl rand -base64 32` |
| `GEMINI_API_KEY` | Google Gemini API key (or another AI provider) | https://aistudio.google.com |

### Required for deploy (main branch only)

| Secret | Purpose | Source |
|--------|---------|--------|
| `VERCEL_TOKEN` | Vercel deployment token | Vercel Dashboard → Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel organization ID | Vercel Dashboard → Settings → General |
| `VERCEL_PROJECT_ID` | Vercel project ID | Vercel project → Settings → General |
| `GCP_PROJECT_ID` | GCP project ID | Google Cloud Console → Project Dashboard |
| `GCP_SA_KEY` | GCP service account key (JSON) | GCP → IAM → Service Accounts → Create Key (see below) |
| `CORS_ORIGIN` | Frontend domain for CORS | `https://your-app.vercel.app` |

### Optional secrets

| Secret | Purpose |
|--------|---------|
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o, etc.) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude) |
| `OPENROUTER_API_KEY` | OpenRouter API key (200+ models) |
| `FIRECRAWL_API_KEY` | Firecrawl web scraping API key |
| `REDIS_URL` | Redis connection URL (for BullMQ workers) |
| `SENTRY_DSN` | Sentry error tracking DSN |

> **Variables** (Settings → Secrets → Actions → Variables):
> - `GCP_REGION` — defaults to `us-central1`
> - `DEFAULT_AI_PROVIDER` — defaults to `gemini`
> - `JWT_EXPIRES_IN` — defaults to `24h`
> - `REFRESH_TOKEN_EXPIRES_IN` — defaults to `30d`

### Setting up GCP Service Account

1. Go to [GCP Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Select your Firebase project (`bwai1-467805` or your project ID)
3. Click **Create Service Account** → name: `github-actions-deploy`
4. Assign roles:
   - **Cloud Run Admin** (`roles/run.admin`)
   - **Cloud Run Service Agent** (`roles/run.serviceAgent`)
   - **Storage Object Admin** (`roles/storage.objectAdmin`) — for Artifact Registry
   - **Artifact Registry Writer** (`roles/artifactregistry.writer`) — for container images
   - **Service Account User** (`roles/iam.serviceAccountUser`) — to act as the run service account
   - **Cloud Build Editor** (`roles/cloudbuild.builds.editor`) — for `gcloud builds submit`
5. Click the key icon → **Manage Keys** → **Add Key** → **Create New Key** → **JSON**
6. Copy the entire JSON contents into the `GCP_SA_KEY` GitHub secret

---

## Deployment Options

### Option 1: Vercel (Frontend) + Cloud Run (Backend) — Recommended

**Frontend (Vercel):**
1. Connect GitHub repo to Vercel
2. Add environment variables (the `VITE_FIREBASE_*` and `VITE_API_URL` values)
3. Push to `main` — the CI/CD pipeline handles the rest

**Backend (Cloud Run):**
1. Enable required GCP APIs:
   ```bash
   gcloud services enable run.googleapis.com \
     artifactregistry.googleapis.com \
     cloudbuild.googleapis.com
   ```
2. Create an Artifact Registry Docker repository:
   ```bash
   gcloud artifacts repositories create cloud-run-source-deploy \
     --repository-format=docker \
     --location=us-central1
   ```
3. Push to `main` — the CI/CD pipeline builds and deploys automatically

### Option 2: Firebase Hosting (Frontend) + Cloud Run (Backend)

**Frontend:**
```bash
npm run build
firebase deploy --only hosting
```

**Backend:**
```bash
gcloud builds submit server/ --tag us-central1-docker.pkg.dev/<PROJECT_ID>/cloud-run-source-deploy/gapminer-backend:latest
gcloud run deploy gapminer-backend \
  --image us-central1-docker.pkg.dev/<PROJECT_ID>/cloud-run-source-deploy/gapminer-backend:latest \
  --platform managed --region us-central1 --allow-unauthenticated \
  --memory=512Mi --cpu=1 --concurrency=80 --timeout=600 \
  --set-env-vars=NODE_ENV=production,DATABASE_URL=...,JWT_SECRET=...,GEMINI_API_KEY=...,CORS_ORIGIN=https://your-firebase-app.web.app
```

### Option 3: Docker (Any host)

```bash
# Build
docker build -t gapminer-server -f server/Dockerfile server/

# Run (set all env vars)
docker run -p 3001:3001 --env-file server/.env gapminer-server
```

### Option 4: Cloud Build (standalone)

Trigger from the CLI (no GitHub Actions needed):
```bash
gcloud builds submit --config server/cloudbuild.yaml \
  --substitutions=_REGION=us-central1 \
  server/
```

---

## Background Worker (Cloud Run Jobs)

The backend includes a BullMQ worker (`server/src/worker.ts`) for background tasks. To run it in production:

```bash
# Deploy as a Cloud Run job
gcloud run jobs create gapminer-worker \
  --image us-central1-docker.pkg.dev/<PROJECT_ID>/cloud-run-source-deploy/gapminer-backend:latest \
  --region us-central1 \
  --memory=256Mi --cpu=1 \
  --command=node,dist/worker.js \
  --set-env-vars=NODE_ENV=production,DATABASE_URL=...,REDIS_URL=...

# Run the job
gcloud run jobs execute gapminer-worker --region us-central1
```

Or deploy as a separate Cloud Run service with `--no-allow-unauthenticated` and trigger it via scheduled jobs or Pub/Sub.

---

## Secret Manager (Recommended for Production)

Instead of passing secrets as env vars, store them in GCP Secret Manager:

```bash
# Create secrets
echo -n "postgresql://..." | gcloud secrets create DATABASE_URL --data-file=-
echo -n "your-jwt-secret" | gcloud secrets create JWT_SECRET --data-file=-
echo -n "your-gemini-key" | gcloud secrets create GEMINI_API_KEY --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:gapminer-backend-sa@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Then reference in `server/cloudbuild.yaml` via `--set-secrets` or in Cloud Run console:
```
--set-secrets=DATABASE_URL=DATABASE_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest
```

---

## Post-Deployment Checklist

- [ ] Set all GitHub Secrets and Variables (see table above)
- [ ] Enable GCP APIs (Cloud Run, Artifact Registry, Cloud Build)
- [ ] Create Artifact Registry Docker repository
- [ ] Configure GCP Service Account with required roles
- [ ] Push to `main` and verify CI/CD pipeline runs
- [ ] Check /api/health endpoint on Cloud Run URL
- [ ] Verify user registration/login works against production backend
- [ ] Test paper crawling functionality
- [ ] Update `VITE_API_URL` secret to match actual Cloud Run URL
- [ ] Add frontend domain to Firebase Auth authorized domains
- [ ] Configure webhooks for integrations
- [ ] Set up monitoring alerts in Sentry
- [ ] Configure custom domain (optional)

---

## API Documentation

See [API.md](./API.md) for complete API reference with endpoints, SDKs, and examples.

---

## Troubleshooting

**CORS Errors:**
- Check `CORS_ORIGIN` matches exact frontend URL (no trailing slash)
- Verify the Cloud Run service has the correct env var

**Cloud Run Deploy Fails:**
- Check `GCP_SA_KEY` has the required roles (see Service Account setup)
- Verify Cloud Run, Artifact Registry, and Cloud Build APIs are enabled
- Run `gcloud builds submit` locally first to debug build issues

**API Key Errors:**
- Verify GEMINI_API_KEY and FIRECRAWL_API_KEY are set in server/.env
- Keys should NOT be prefixed with VITE_ in server config

**Database Connection:**
- Verify DATABASE_URL format is correct
- If using Cloud SQL, enable Cloud SQL Admin API and add the Cloud SQL Client role to the service account
- If using an external provider (Neon, etc.), ensure the IP is allowlisted or use private networking

**Firebase Auth:**
- Add production domain to Firebase Console → Authentication → Settings → Authorized domains
- Both frontend domain AND backend Cloud Run URL need to be authorized for sign-in redirects