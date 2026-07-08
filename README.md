# GapMiner

> **Discover Unsolved Research Problems from Academic Papers**

GapMiner is an AI-powered research tool that automatically extracts limitations, identifies research gaps, and helps researchers discover opportunities from academic papers. Powered by Firecrawl for web scraping and Google Gemini for intelligent analysis.

![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Environment Setup](#-environment-setup)
- [Database Setup](#-database-setup)
- [Local Development](#-local-development)
- [Deployment](#-deployment)
  - [Vercel](#vercel-recommended)
  - [Netlify](#netlify)
  - [Static Hosting](#static-hosting)
- [Project Structure](#-project-structure)
- [API Keys](#-api-keys)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

- **🔍 Intelligent Web Scraping** - Extract content from arXiv, OpenReview, ACL Anthology, and other academic sources
- **🤖 AI-Powered Gap Analysis** - Leverage Google Gemini to identify research limitations and unsolved problems
- **📊 Gap Categorization** - Automatically classify gaps into data, compute, evaluation, and methodology types
- **📚 Collections Management** - Organize discovered gaps into custom collections
- **🔐 Secure Authentication** - JWT auth through the backend API
- **☁️ Cloud Storage** - Persist results in PostgreSQL through the backend API
- **🎨 Modern UI** - Beautiful, responsive interface with dark mode and smooth animations

---

## 🛠 Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Framer Motion |
| **Build Tool** | Vite (Rolldown) |
| **Backend Services** | Express, PostgreSQL, JWT auth |
| **AI/ML** | Google Gemini 2.0 Flash |
| **Web Scraping** | Firecrawl API |
| **Routing** | React Router v7 |
| **Icons** | Lucide React |

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** ≥ 18.0.0
- **npm** ≥ 9.0.0 or **pnpm** ≥ 8.0.0
- A **PostgreSQL** database ([postgresql.org](https://www.postgresql.org))
- A **Firecrawl** API key ([firecrawl.dev](https://firecrawl.dev))
- A **Google AI Studio** API key ([aistudio.google.com](https://aistudio.google.com))

---

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/gapminer.git
cd gapminer
```

### 2. Install Dependencies

```bash
npm install
```

Or using pnpm:

```bash
pnpm install
```

---

## 🔐 Environment Setup

### 1. Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` with your credentials:

```env
# Frontend API base URL
VITE_API_URL=http://localhost:3001/api

# Firecrawl API
VITE_FIRECRAWL_API_KEY=your_firecrawl_api_key

# Gemini API
VITE_GEMINI_API_KEY=your_gemini_api_key

# Server-only secrets are loaded by the backend from server/.env or the repo root .env
DATABASE_URL=postgresql://postgres:password@localhost:5432/gapminer
JWT_SECRET=replace-with-a-long-random-secret
REDIS_URL=redis://localhost:6379
```

> ⚠️ **Important**: Never commit your `.env` file to version control. It's already included in `.gitignore`.

---

## 🗄️ Database Setup

### 1. Local PostgreSQL Installation

1. Install PostgreSQL 14+ (https://www.postgresql.org/download/windows/)
2. Create a `gapminer` database and a database user if needed.
3. Optional: install Redis if you plan to run the queue/cron workers locally.

### 2. Initialize the Database

```cmd
cd C:\GAPFINDER\server
npm install
npm run db:setup:win
```

Or, if PostgreSQL is already running and `DATABASE_URL` is set:

```cmd
npm run db:setup:win
```

### 3. Apply Migrations and Seed Demo Data

```cmd
npm run db:migrate
npm run db:seed
```

### 4. Configure Backend Connection

The backend reads its database connection from `DATABASE_URL` in `server/.env` or the repo root `.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/gapminer
```

### 5. What the frontend uses

The React app talks to the backend through `VITE_API_URL` and stores research data in PostgreSQL via the API.
There is no Firestore setup step for the core app flow.

> ⚠️ **Important**: Never commit your `.env` file to version control. It's already included in `.gitignore`.

---

## 💻 Local Development

### Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

---

## 🚀 Deployment

### Vercel (Recommended)

Vercel is the recommended platform for deploying GapMiner.

#### Option 1: Deploy via Vercel Dashboard

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com) and sign in
3. Click **"New Project"**
4. Import your GitHub repository
5. Configure environment variables:
   - Add all variables from `.env.example`
6. Click **"Deploy"**

#### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# For production deployment
vercel --prod
```

#### Vercel Configuration

A `vercel.json` configuration file is already included in the project root:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

### Netlify

#### Option 1: Deploy via Netlify Dashboard

1. Push your code to GitHub
2. Go to [Netlify](https://netlify.com) and sign in
3. Click **"Add new site"** > **"Import an existing project"**
4. Connect to your GitHub repository
5. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
6. Add environment variables in **Site settings > Environment variables**
7. Click **"Deploy site"**

#### Option 2: Deploy via Netlify CLI

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Login to Netlify
netlify login

# Initialize project
netlify init

# Deploy
netlify deploy --prod
```

#### Netlify Configuration

A `netlify.toml` configuration file is already included in the project root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

### Static Hosting

You can deploy the built frontend (`dist/`) to any static hosting provider that supports SPA rewrites, such as:

- Vercel
- Netlify
- Cloudflare Pages
- GitHub Pages with a client-side router fallback

Build the app with `npm run build`, then configure your host to serve `dist/index.html` for unknown routes.

---

## 📁 Project Structure

```
gapminer/
├── public/                 # Static assets
│   └── vite.svg           # Favicon
├── src/
│   ├── assets/            # Images and static files
│   ├── components/        # React components
│   │   ├── layout/        # Layout components (Navbar, Footer, Sidebar)
│   │   └── ui/            # UI components (Button, Modal, etc.)
│   ├── context/           # React context providers
│   │   └── AuthContext.tsx
│   ├── lib/               # Utility libraries and services
│   │   ├── api.ts         # Firecrawl & Gemini API integration
│   │   ├── firebase.ts    # Legacy compatibility shim used by a few feature modules
│   │   ├── firestore.ts   # Backend API-backed persistence helpers
│   │   └── utils.ts       # Utility functions
│   ├── pages/             # Page components
│   │   ├── AssistantPage.tsx
│   │   ├── CollectionsPage.tsx
│   │   ├── CrawlPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── ExplorePage.tsx
│   │   ├── HomePage.tsx
│   │   └── InsightsPage.tsx
│   ├── App.tsx            # Main App component
│   ├── index.css          # Global styles
│   ├── main.tsx           # Entry point
│   └── vite-env.d.ts      # Vite type declarations
├── .env.example           # Environment template
├── .gitignore
├── eslint.config.js       # ESLint configuration
├── index.html             # HTML entry point
├── package.json
├── tsconfig.json          # TypeScript configuration
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts         # Vite configuration
```

---

## 🔑 API Keys

### Firecrawl API Key

1. Go to [Firecrawl](https://firecrawl.dev)
2. Sign up or log in
3. Navigate to **Dashboard > API Keys**
4. Create a new API key
5. Copy the key to `VITE_FIRECRAWL_API_KEY`

### Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Sign in with your Google account
3. Click **"Get API Key"**
4. Create API key in a new or existing project
5. Copy the key to `VITE_GEMINI_API_KEY`

### Backend API Configuration

1. Confirm `VITE_API_URL` points to the backend API, for example `http://localhost:3001/api`
2. Set `DATABASE_URL` for the PostgreSQL backend
3. Make sure `JWT_SECRET` and `GEMINI_API_KEY` are set for server-side auth and analysis

---

## 🔧 Troubleshooting

### Common Issues

#### "401 Unauthorized" from the backend

**Solution**: Check the API auth configuration:
1. Verify the backend is running on the URL in `VITE_API_URL`
2. Clear stale access tokens from localStorage and sign in again
3. Confirm `JWT_SECRET` is consistent across backend restarts in the same environment

#### "Firecrawl API error: 401"

**Solution**: Verify your Firecrawl API key:
1. Check that `VITE_FIRECRAWL_API_KEY` is correctly set
2. Ensure the API key is active in your Firecrawl dashboard
3. Check for any leading/trailing whitespace

#### "Database connection failed"

**Solution**: Check the PostgreSQL connection:
1. Verify `DATABASE_URL` points at a reachable PostgreSQL instance
2. Run `npm run db:setup:win` or `npm run db:migrate` from `server/`
3. Confirm the database has the `papers`, `gaps`, `collections`, and `api_usage_logs` tables

#### "Cannot find module '@/...'"

**Solution**: Path aliases issue:
1. Ensure `vite.config.ts` has the `@` alias configured
2. Ensure `tsconfig.app.json` has matching paths configuration
3. Restart the dev server

#### Build fails on Vercel/Netlify

**Solution**:
1. Ensure all environment variables are set in the platform dashboard
2. Check that Node.js version is 18 or higher
3. Clear cache and redeploy

### Getting Help

- Open an issue on [GitHub Issues](https://github.com/yourusername/gapminer/issues)
- Check [Vite documentation](https://vite.dev)
- Check [PostgreSQL documentation](https://www.postgresql.org/docs/)

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use functional components with hooks
- Write meaningful commit messages
- Update documentation as needed
- Test changes locally before submitting PR

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Firecrawl](https://firecrawl.dev) for powerful web scraping
- [Google Gemini](https://ai.google.dev) for AI-powered analysis
- [PostgreSQL](https://www.postgresql.org) for reliable data storage
- [Vite](https://vite.dev) for lightning-fast builds
- [Tailwind CSS](https://tailwindcss.com) for utility-first styling

---

<div align="center">

**[⬆ Back to Top](#gapminer)**

Made with ❤️ by the GapMiner Team

</div>
