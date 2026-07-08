#!/bin/bash
# ============================================================================
# GapMiner PostgreSQL Database Setup Script (Bash)
# Linux/macOS setup automation script
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Default configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-gapminer}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password}"
USE_DOCKER=false
SKIP_BACKUP=false
FORCE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --docker)
            USE_DOCKER=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --host)
            DB_HOST="$2"
            shift 2
            ;;
        --port)
            DB_PORT="$2"
            shift 2
            ;;
        --dbname)
            DB_NAME="$2"
            shift 2
            ;;
        --user)
            DB_USER="$2"
            shift 2
            ;;
        --password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --docker          Use Docker container instead of local PostgreSQL"
            echo "  --skip-backup     Skip database backup before setup"
            echo "  --force, -f       Force recreate database"
            echo "  --host HOST       Database host (default: localhost)"
            echo "  --port PORT       Database port (default: 5432)"
            echo "  --dbname NAME     Database name (default: gapminer)"
            echo "  --user USER       Database user (default: postgres)"
            echo "  --password PASS   Database password (default: password)"
            echo "  --help, -h        Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# ============================================================================
# Print Header
# ============================================================================

echo -e "${CYAN}============================================================================${NC}"
echo -e "${CYAN}  GapMiner PostgreSQL Database Setup${NC}"
echo -e "${CYAN}============================================================================${NC}"
echo ""

# ============================================================================
# Check Prerequisites
# ============================================================================

echo -e "${YELLOW}[1/7] Checking prerequisites...${NC}"

if [ "$USE_DOCKER" = true ]; then
    echo -e "${GRAY}  Checking Docker...${NC}"
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}  ERROR: Docker is not installed${NC}"
        echo -e "${RED}  Please install Docker from: https://docs.docker.com/get-docker/${NC}"
        exit 1
    fi
    echo -e "${GREEN}  Docker found${NC}"
else
    echo -e "${GRAY}  Checking PostgreSQL...${NC}"
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}  ERROR: PostgreSQL is not installed${NC}"
        echo -e "${RED}  Please install PostgreSQL or use --docker flag${NC}"
        exit 1
    fi
    echo -e "${GREEN}  PostgreSQL found${NC}"
fi

echo ""

# ============================================================================
# Setup Docker Container (if requested)
# ============================================================================

if [ "$USE_DOCKER" = true ]; then
    echo -e "${YELLOW}[2/7] Setting up Docker container...${NC}"
    
    # Check if container already exists
    if docker ps -a --format '{{.Names}}' | grep -q "^gapminer-postgres$"; then
        if [ "$FORCE" = true ]; then
            echo -e "${GRAY}  Removing existing container...${NC}"
            docker stop gapminer-postgres 2>/dev/null || true
            docker rm gapminer-postgres 2>/dev/null || true
        else
            echo -e "${YELLOW}  Container 'gapminer-postgres' already exists${NC}"
            echo -e "${YELLOW}  Use --force to recreate it${NC}"
            read -p "  Start existing container? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker start gapminer-postgres
            fi
            exit 0
        fi
    fi
    
    echo -e "${GRAY}  Creating PostgreSQL container with pgvector...${NC}"
    docker run -d \
        --name gapminer-postgres \
        -e POSTGRES_DB="$DB_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -p "$DB_PORT:5432" \
        -v gapminer_pgdata:/var/lib/postgresql/data \
        pgvector/pgvector:pg16

    echo -e "${GRAY}  Waiting for PostgreSQL to start...${NC}"
    sleep 5
    
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if docker exec gapminer-postgres pg_isready -U "$DB_USER" &>/dev/null; then
            echo -e "${GREEN}  PostgreSQL is ready!${NC}"
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    
    if [ $attempt -eq $max_attempts ]; then
        echo -e "${RED}  ERROR: PostgreSQL failed to start${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}[2/7] Using local PostgreSQL installation${NC}"
fi

echo ""

# ============================================================================
# Set Environment Variables
# ============================================================================

export PGHOST="$DB_HOST"
export PGPORT="$DB_PORT"
export PGUSER="$DB_USER"
export PGPASSWORD="$DB_PASSWORD"
export PGDATABASE="postgres"

CONNECTION_STRING="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo -e "${YELLOW}[3/7] Connection details:${NC}"
echo -e "${GRAY}  Host: $DB_HOST${NC}"
echo -e "${GRAY}  Port: $DB_PORT${NC}"
echo -e "${GRAY}  Database: $DB_NAME${NC}"
echo -e "${GRAY}  User: $DB_USER${NC}"
echo ""

# ============================================================================
# Backup existing database (if exists)
# ============================================================================

if [ "$SKIP_BACKUP" = false ]; then
    echo -e "${YELLOW}[4/7] Checking for existing database...${NC}"
    
    if psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        BACKUP_FILE="gapminer_backup_$TIMESTAMP.sql"
        
        echo -e "${GRAY}  Database exists. Creating backup...${NC}"
        echo -e "${GRAY}  Backup file: $BACKUP_FILE${NC}"
        
        if pg_dump -d "$DB_NAME" -f "$BACKUP_FILE"; then
            echo -e "${GREEN}  Backup created successfully!${NC}"
        else
            echo -e "${YELLOW}  WARNING: Backup failed${NC}"
        fi
    else
        echo -e "${GRAY}  No existing database found${NC}"
    fi
else
    echo -e "${YELLOW}[4/7] Skipping backup (--skip-backup flag)${NC}"
fi

echo ""

# ============================================================================
# Create Database
# ============================================================================

echo -e "${YELLOW}[5/7] Creating database...${NC}"

# Drop if force flag is set
if [ "$FORCE" = true ]; then
    echo -e "${GRAY}  Dropping existing database (if any)...${NC}"
    psql -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
fi

# Create database
echo -e "${GRAY}  Creating new database: $DB_NAME${NC}"
if ! psql -c "CREATE DATABASE $DB_NAME;" 2>/dev/null; then
    if [ "$FORCE" = false ]; then
        echo -e "${YELLOW}  Database already exists (use --force to recreate)${NC}"
    else
        echo -e "${RED}  ERROR: Failed to create database${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}  Database ready!${NC}"
echo ""

# ============================================================================
# Run Schema
# ============================================================================

echo -e "${YELLOW}[6/7] Initializing database schema...${NC}"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCHEMA_PATH="$SCRIPT_DIR/server/src/db/schema.sql"
INIT_PATH="$SCRIPT_DIR/server/src/db/init-database.sql"

export PGDATABASE="$DB_NAME"

if [ -f "$INIT_PATH" ]; then
    echo -e "${GRAY}  Running init-database.sql...${NC}"
    if psql -f "$INIT_PATH"; then
        echo -e "${GREEN}  Schema initialized successfully!${NC}"
    else
        echo -e "${RED}  ERROR: Schema initialization failed${NC}"
        exit 1
    fi
elif [ -f "$SCHEMA_PATH" ]; then
    echo -e "${GRAY}  Running schema.sql...${NC}"
    if psql -f "$SCHEMA_PATH"; then
        echo -e "${GREEN}  Schema initialized successfully!${NC}"
    else
        echo -e "${RED}  ERROR: Schema initialization failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}  ERROR: Schema files not found${NC}"
    echo -e "${RED}  Please ensure you're running this from the project root${NC}"
    exit 1
fi

echo ""

# ============================================================================
# Update Environment Variables
# ============================================================================

echo -e "${YELLOW}[7/7] Updating environment configuration...${NC}"

ENV_PATH="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

if [ ! -f "$ENV_PATH" ]; then
    if [ -f "$ENV_EXAMPLE" ]; then
        echo -e "${GRAY}  Creating .env from .env.example...${NC}"
        cp "$ENV_EXAMPLE" "$ENV_PATH"
    else
        echo -e "${GRAY}  Creating new .env file...${NC}"
        touch "$ENV_PATH"
    fi
fi

# Update or add DATABASE_URL
if grep -q "DATABASE_URL=" "$ENV_PATH"; then
    sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=$CONNECTION_STRING|" "$ENV_PATH"
    rm -f "$ENV_PATH.bak"
else
    echo "" >> "$ENV_PATH"
    echo "DATABASE_URL=$CONNECTION_STRING" >> "$ENV_PATH"
fi

echo -e "${GREEN}  Updated .env with DATABASE_URL${NC}"
echo ""

# ============================================================================
# Verification
# ============================================================================

echo -e "${CYAN}============================================================================${NC}"
echo -e "${CYAN}  Verifying installation...${NC}"
echo -e "${CYAN}============================================================================${NC}"

TABLE_COUNT=$(psql -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | tr -d '[:space:]')
INDEX_COUNT=$(psql -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';" | tr -d '[:space:]')

echo ""
echo -e "${GREEN}  Database: $DB_NAME${NC}"
echo -e "${GREEN}  Tables: $TABLE_COUNT${NC}"
echo -e "${GREEN}  Indexes: $INDEX_COUNT${NC}"
echo ""

# ============================================================================
# Success Message
# ============================================================================

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}  Setup Complete! ${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${CYAN}Connection String:${NC}"
echo -e "  ${CONNECTION_STRING}"
echo ""
echo -e "${CYAN}Quick Start Commands:${NC}"
echo -e "  psql $CONNECTION_STRING"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo -e "  1. Review .env file configuration"
echo -e "  2. Run: cd server && npm install"
echo -e "  3. Run: npm run dev"
echo ""

if [ "$USE_DOCKER" = true ]; then
    echo -e "${CYAN}Docker Container Management:${NC}"
    echo -e "  Start:  docker start gapminer-postgres"
    echo -e "  Stop:   docker stop gapminer-postgres"
    echo -e "  Remove: docker rm gapminer-postgres"
    echo -e "  Logs:   docker logs gapminer-postgres"
    echo ""
fi

echo -e "${YELLOW}Default Admin Credentials:${NC}"
echo -e "  Email: admin@gapminer.com"
echo -e "  Password: admin123"
echo -e "  ${RED}⚠️  Change password after first login!${NC}"
echo ""
