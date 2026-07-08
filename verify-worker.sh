#!/bin/bash
# ============================================================================
# GAPMINER WORKER QUICKSTART VERIFICATION
# 
# This script verifies that the worker is properly configured and can
# process jobs. Run this after setting up the worker for the first time.
# ============================================================================

set -e

echo "============================================================================"
echo " 🚀 GAPMINER WORKER VERIFICATION"
echo "============================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Node.js version
echo "📋 Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "   ✅ Found $NODE_VERSION"
echo ""

# Check 2: PostgreSQL connection
echo "🗄️  Checking PostgreSQL connection..."
if ! command -v psql &> /dev/null; then
    echo "   ⚠️  psql not found in PATH (it's OK if using Docker)"
else
    if psql -U postgres -d gapminer -c "SELECT 1" &>/dev/null; then
        echo "   ✅ PostgreSQL connection successful"
    else
        echo "   ⚠️  PostgreSQL connection failed (check DATABASE_URL in .env)"
    fi
fi
echo ""

# Check 3: Redis connection
echo "🔴  Checking Redis connection..."
if ! command -v redis-cli &> /dev/null; then
    echo "   ⚠️  redis-cli not found in PATH (it's OK if using Docker)"
else
    if redis-cli ping &>/dev/null; then
        echo "   ✅ Redis connection successful"
    else
        echo "   ⚠️  Redis connection failed (check REDIS_URL in .env)"
    fi
fi
echo ""

# Check 4: Environment variables
echo "🔑  Checking environment variables..."
MISSING_VARS=()

if [ -z "$DATABASE_URL" ]; then
    MISSING_VARS+=("DATABASE_URL")
fi

if [ -z "$REDIS_URL" ]; then
    MISSING_VARS+=("REDIS_URL")
fi

if [ -z "$FIRECRAWL_API_KEY" ]; then
    echo "   ⚠️  FIRECRAWL_API_KEY not set (needed for scraping)"
    MISSING_VARS+=("FIRECRAWL_API_KEY")
else
    echo "   ✅ FIRECRAWL_API_KEY configured"
fi

if [ -z "$GEMINI_API_KEY" ] && [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "   ⚠️  No AI provider configured (set at least one API key)"
    MISSING_VARS+=("AI_PROVIDER_KEY")
else
    if [ -n "$GEMINI_API_KEY" ]; then
        echo "   ✅ GEMINI_API_KEY configured"
    elif [ -n "$OPENAI_API_KEY" ]; then
        echo "   ✅ OPENAI_API_KEY configured"
    elif [ -n "$ANTHROPIC_API_KEY" ]; then
        echo "   ✅ ANTHROPIC_API_KEY configured"
    fi
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "   ❌ Missing critical variables: ${MISSING_VARS[*]}"
    echo ""
    echo "   💡 Copy server/.env.example to server/.env and fill in values:"
    echo "      cp server/.env.example server/.env"
    exit 1
fi
echo ""

# Check 5: Dependencies installed
echo "📦  Checking dependencies..."
if [ ! -d "server/node_modules" ]; then
    echo "   ⚠️  Dependencies not installed, installing now..."
    npm --prefix server install
fi
echo "   ✅ Dependencies installed"
echo ""

# Check 6: TypeScript compilation
echo "🔨  Checking TypeScript compilation..."
if npm --prefix server run build &>/dev/null; then
    echo "   ✅ TypeScript compilation successful"
else
    echo "   ❌ TypeScript compilation failed"
    npm --prefix server run build
    exit 1
fi
echo ""

# Check 7: Database schema
echo "📐  Checking database schema..."
if ! psql -U postgres -d gapminer -c "SELECT 1 FROM batch_jobs LIMIT 1" &>/dev/null 2>&1; then
    echo "   ⚠️  Database tables not initialized"
    echo "   💡 Run: npm --prefix server run db:setup"
else
    echo "   ✅ Database schema initialized"
fi
echo ""

echo "============================================================================"
echo " ✅ VERIFICATION COMPLETE"
echo "============================================================================"
echo ""
echo "📚 Next Steps:"
echo ""
echo "1️⃣  START THE WORKER:"
echo "    npm --prefix server run dev:worker"
echo ""
echo "2️⃣  IN ANOTHER TERMINAL, START THE API:"
echo "    npm --prefix server run dev"
echo ""
echo "3️⃣  TEST WITH A REQUEST (in third terminal):"
echo "    curl -X POST http://localhost:3001/api/public/analyze \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"url\": \"https://arxiv.org/abs/2310.00001\", \"includeGaps\": true}'"
echo ""
echo "4️⃣  POLL FOR RESULTS:"
echo "    curl http://localhost:3001/api/public/jobs/{jobId}"
echo ""
echo "📖 For more info, see WORKER.md"
echo ""
