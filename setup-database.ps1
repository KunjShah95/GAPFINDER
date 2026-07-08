# ============================================================================
# GapMiner PostgreSQL Database Setup Script (PowerShell)
# Windows setup automation script
# ============================================================================

param(
    [string]$DBHost = "localhost",
    [int]$DBPort = 5432,
    [string]$DBName = "gapminer",
    [string]$DBUser = "postgres",
    [string]$DBPassword = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "postgres" },
    [switch]$Docker,
    [switch]$SkipBackup,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
# ============================================================================
# Load Environment Variables from .env
# ============================================================================

$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Write-Host "Loading environment variables from .env..." -ForegroundColor Gray
    $databaseUrl = $null
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+?)\s*$') {
            $name = $matches[1]
            $value = $matches[2]
            # Only set if not already provided via parameters
            if ($name -eq "DB_HOST" -and $DBHost -eq "localhost") { $DBHost = $value }
            if ($name -eq "DB_PORT" -and $DBPort -eq 5432) { $DBPort = [int]$value }
            if ($name -eq "DB_NAME" -and $DBName -eq "gapminer") { $DBName = $value }
            if ($name -eq "DB_USER" -and $DBUser -eq "postgres") { $DBUser = $value }
            if ($name -eq "DB_PASSWORD" -and $DBPassword -eq "password") { $DBPassword = $value }
            if ($name -eq "DATABASE_URL") { $databaseUrl = $value }
        }
    }

    # Fallback: if DB_PASSWORD is unchanged/default, derive from DATABASE_URL
    if (($DBPassword -eq "password" -or [string]::IsNullOrWhiteSpace($DBPassword)) -and ![string]::IsNullOrWhiteSpace($databaseUrl)) {
        try {
            $uri = [System.Uri]$databaseUrl
            if (!([string]::IsNullOrWhiteSpace($uri.UserInfo)) -and $uri.UserInfo.Contains(":")) {
                $parts = $uri.UserInfo.Split(":", 2)
                if ($parts.Length -eq 2 -and !([string]::IsNullOrWhiteSpace($parts[1]))) {
                    $DBPassword = [System.Uri]::UnescapeDataString($parts[1])
                }
            }
        } catch {
            # Ignore malformed DATABASE_URL and keep current values
        }
    }

    Write-Host "Environment variables loaded" -ForegroundColor Green
    Write-Host ""
}


Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  GapMiner PostgreSQL Database Setup" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Check Prerequisites
# ============================================================================

Write-Host "[1/7] Checking prerequisites..." -ForegroundColor Yellow

if ($Docker) {
    Write-Host "  Checking Docker..." -ForegroundColor Gray
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "  ERROR: Docker is not installed or not in PATH" -ForegroundColor Red
        Write-Host "  Please install Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Docker found" -ForegroundColor Green
} else {
    Write-Host "  Checking PostgreSQL..." -ForegroundColor Gray
    if (!(Get-Command psql -ErrorAction SilentlyContinue)) {
        Write-Host "  ERROR: PostgreSQL is not installed or not in PATH" -ForegroundColor Red
        Write-Host "  Please install PostgreSQL from: https://www.postgresql.org/download/windows/" -ForegroundColor Red
        Write-Host "  Or use -Docker flag to run with Docker" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  PostgreSQL found" -ForegroundColor Green
}

Write-Host ""

# ============================================================================
# Setup Docker Container (if requested)
# ============================================================================

if ($Docker) {
    Write-Host "[2/7] Setting up Docker container..." -ForegroundColor Yellow
    
    # Check if container already exists
    $containerExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "gapminer-postgres" -Quiet
    
    if ($containerExists) {
        if ($Force) {
            Write-Host "  Removing existing container..." -ForegroundColor Gray
            docker stop gapminer-postgres 2>$null
            docker rm gapminer-postgres 2>$null
        } else {
            Write-Host "  Container 'gapminer-postgres' already exists" -ForegroundColor Yellow
            Write-Host "  Use -Force to recreate it" -ForegroundColor Yellow
            $response = Read-Host "  Start existing container? (y/n)"
            if ($response -eq "y") {
                docker start gapminer-postgres
            }
            exit 0
        }
    }
    
    Write-Host "  Creating PostgreSQL container with pgvector..." -ForegroundColor Gray
    docker run -d `
        --name gapminer-postgres `
        -e POSTGRES_DB=$DBName `
        -e POSTGRES_USER=$DBUser `
        -e POSTGRES_PASSWORD=$DBPassword `
        -p ${DBPort}:5432 `
        -v gapminer_pgdata:/var/lib/postgresql/data `
        pgvector/pgvector:pg16

    Write-Host "  Waiting for PostgreSQL to start..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
    
    $maxAttempts = 30
    $attempt = 0
    while ($attempt -lt $maxAttempts) {
        $ready = docker exec gapminer-postgres pg_isready -U $DBUser 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  PostgreSQL is ready!" -ForegroundColor Green
            break
        }
        $attempt++
        Start-Sleep -Seconds 1
    }
    
    if ($attempt -eq $maxAttempts) {
        Write-Host "  ERROR: PostgreSQL failed to start" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[2/7] Using local PostgreSQL installation" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# Create Connection String
# ============================================================================

$env:PGPASSWORD = $DBPassword
$connectionString = "postgresql://${DBUser}:${DBPassword}@${DBHost}:${DBPort}/${DBName}"

Write-Host "[3/7] Connection details:" -ForegroundColor Yellow
Write-Host "  Host: $DBHost" -ForegroundColor Gray
Write-Host "  Port: $DBPort" -ForegroundColor Gray
Write-Host "  Database: $DBName" -ForegroundColor Gray
Write-Host "  User: $DBUser" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# Validate Authentication Early
# ============================================================================

Write-Host "[4/7] Validating PostgreSQL authentication..." -ForegroundColor Yellow
$authCheckOutput = psql -h $DBHost -p $DBPort -U $DBUser -d postgres -tAc "SELECT 1;" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Unable to authenticate with PostgreSQL" -ForegroundColor Red
    Write-Host "  Details: $authCheckOutput" -ForegroundColor Red
    Write-Host "  Hint: Ensure DB_PASSWORD in .env matches your postgres user password." -ForegroundColor Yellow
    exit 1
}
Write-Host "  Authentication successful" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Backup existing database (if exists)
# ============================================================================

if (!$SkipBackup) {
    Write-Host "[5/7] Checking for existing database..." -ForegroundColor Yellow
    
    $dbExists = psql -h $DBHost -p $DBPort -U $DBUser -lqt | Select-String -Pattern $DBName -Quiet
    
    if ($dbExists) {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $backupFile = "gapminer_backup_$timestamp.sql"
        
        Write-Host "  Database exists. Creating backup..." -ForegroundColor Gray
        Write-Host "  Backup file: $backupFile" -ForegroundColor Gray
        
        pg_dump -h $DBHost -p $DBPort -U $DBUser -d $DBName -f $backupFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Backup created successfully!" -ForegroundColor Green
        } else {
            Write-Host "  WARNING: Backup failed" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  No existing database found" -ForegroundColor Gray
    }
} else {
    Write-Host "[5/7] Skipping backup (--SkipBackup flag)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# Create Database
# ============================================================================

Write-Host "[6/7] Creating database..." -ForegroundColor Yellow

# Drop if force flag is set
if ($Force) {
    Write-Host "  Dropping existing database (if any)..." -ForegroundColor Gray
    psql -h $DBHost -p $DBPort -U $DBUser -d postgres -c "DROP DATABASE IF EXISTS $DBName;" 2>$null
}

# Create database
Write-Host "  Creating new database: $DBName" -ForegroundColor Gray
psql -h $DBHost -p $DBPort -U $DBUser -d postgres -c "CREATE DATABASE $DBName;" 2>$null

if ($LASTEXITCODE -ne 0) {
    if (!$Force) {
        Write-Host "  Database already exists (use -Force to recreate)" -ForegroundColor Yellow
    } else {
        Write-Host "  ERROR: Failed to create database" -ForegroundColor Red
        exit 1
    }
}

Write-Host "  Database ready!" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Run Schema
# ============================================================================

Write-Host "[7/7] Initializing database schema..." -ForegroundColor Yellow

$schemaPath = Join-Path $PSScriptRoot "server\src\db\schema.sql"
$initPath = Join-Path $PSScriptRoot "server\src\db\init-database.sql"

if (Test-Path $initPath) {
    Write-Host "  Running init-database.sql..." -ForegroundColor Gray
    psql -h $DBHost -p $DBPort -U $DBUser -d $DBName -f $initPath
} elseif (Test-Path $schemaPath) {
    Write-Host "  Running schema.sql..." -ForegroundColor Gray
    psql -h $DBHost -p $DBPort -U $DBUser -d $DBName -f $schemaPath
} else {
    Write-Host "  ERROR: Schema files not found" -ForegroundColor Red
    Write-Host "  Please ensure you're running this from the project root" -ForegroundColor Red
    exit 1
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Schema initialized successfully!" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Schema initialization failed" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================================================
# Update Environment Variables
# ============================================================================

Write-Host "[8/8] Updating environment configuration..." -ForegroundColor Yellow

$envPath = Join-Path $PSScriptRoot ".env"
$envExample = Join-Path $PSScriptRoot ".env.example"

if (!(Test-Path $envPath)) {
    if (Test-Path $envExample) {
        Write-Host "  Creating .env from .env.example..." -ForegroundColor Gray
        Copy-Item $envExample $envPath
    } else {
        Write-Host "  Creating new .env file..." -ForegroundColor Gray
        New-Item $envPath -ItemType File | Out-Null
    }
}

# Update or add DATABASE_URL
$envContent = Get-Content $envPath -Raw
if ($envContent -match "DATABASE_URL=") {
    $envContent = $envContent -replace "DATABASE_URL=.*", "DATABASE_URL=$connectionString"
} else {
    $envContent += "`nDATABASE_URL=$connectionString`n"
}

Set-Content $envPath $envContent -NoNewline

Write-Host "  Updated .env with DATABASE_URL" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Verification
# ============================================================================

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  Verifying installation..." -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan

$tableCount = psql -h $DBHost -p $DBPort -U $DBUser -d $DBName -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
$indexCount = psql -h $DBHost -p $DBPort -U $DBUser -d $DBName -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';"

Write-Host ""
Write-Host "  Database: $DBName" -ForegroundColor Green
Write-Host "  Tables: $($tableCount.Trim())" -ForegroundColor Green
Write-Host "  Indexes: $($indexCount.Trim())" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Success Message
# ============================================================================

Write-Host "============================================================================" -ForegroundColor Green
Write-Host "  Setup Complete! " -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Connection String:" -ForegroundColor Cyan
Write-Host "  $connectionString" -ForegroundColor White
Write-Host ""
Write-Host "Quick Start Commands:" -ForegroundColor Cyan
Write-Host "  psql $connectionString" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Review .env file configuration" -ForegroundColor White
Write-Host "  2. Run: cd server && npm install" -ForegroundColor White
Write-Host "  3. Run: npm run dev" -ForegroundColor White
Write-Host ""

if ($Docker) {
    Write-Host "Docker Container Management:" -ForegroundColor Cyan
    Write-Host "  Start:  docker start gapminer-postgres" -ForegroundColor White
    Write-Host "  Stop:   docker stop gapminer-postgres" -ForegroundColor White
    Write-Host "  Remove: docker rm gapminer-postgres" -ForegroundColor White
    Write-Host "  Logs:   docker logs gapminer-postgres" -ForegroundColor White
    Write-Host ""
}

Write-Host "Default Admin Credentials:" -ForegroundColor Yellow
Write-Host "  Email: admin@gapminer.com" -ForegroundColor White
Write-Host "  Password: admin123" -ForegroundColor White
Write-Host "  ⚠️  Change password after first login!" -ForegroundColor Red
Write-Host ""
