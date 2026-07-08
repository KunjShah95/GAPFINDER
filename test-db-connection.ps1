# ============================================================================
# PostgreSQL Connection Test Script
# Tests your PostgreSQL connection and helps find the right password
# ============================================================================

param(
    [string]$DBHost = "localhost",
    [int]$DBPort = 5432,
    [string]$DBUser = "postgres"
)

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  PostgreSQL Connection Test" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if psql is available
if (!(Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: psql command not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "PostgreSQL is not installed or not in your PATH." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To fix this:" -ForegroundColor Yellow
    Write-Host "1. Install PostgreSQL from: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host "2. Or add PostgreSQL to your PATH (usually: C:\Program Files\PostgreSQL\16\bin)" -ForegroundColor Yellow
    Write-Host "3. Or use Docker: npm run db:setup:win -Docker" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "PostgreSQL client found: " -NoNewline -ForegroundColor Green
$psqlVersion = psql --version
Write-Host $psqlVersion -ForegroundColor Gray
Write-Host ""

# ============================================================================
# Test Connection
# ============================================================================

Write-Host "Testing connection to PostgreSQL..." -ForegroundColor Yellow
Write-Host "  Host: $DBHost" -ForegroundColor Gray
Write-Host "  Port: $DBPort" -ForegroundColor Gray
Write-Host "  User: $DBUser" -ForegroundColor Gray
Write-Host ""

# Try to connect without password (trust authentication)
Write-Host "Attempting connection..." -ForegroundColor Gray
$env:PGPASSWORD = ""
$result = psql -h $DBHost -p $DBPort -U $DBUser -d postgres -c "SELECT version();" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS! Connection established (no password required)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your PostgreSQL is configured for trust authentication." -ForegroundColor Green
    Write-Host "Update your .env file:" -ForegroundColor Yellow
    Write-Host "  DB_PASSWORD=" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

# If failed, prompt for password
Write-Host ""
Write-Host "Password required. Please enter your PostgreSQL password:" -ForegroundColor Yellow
Write-Host "(This is the password you set during PostgreSQL installation)" -ForegroundColor Gray
Write-Host ""

$securePassword = Read-Host "Password" -AsSecureString
$password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

$env:PGPASSWORD = $password
$result = psql -h $DBHost -p $DBPort -U $DBUser -d postgres -c "SELECT version();" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS! Connection established" -ForegroundColor Green
    Write-Host ""
    Write-Host "Update your .env file with:" -ForegroundColor Yellow
    Write-Host "  DB_PASSWORD=$password" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or run the setup script with:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File setup-database.ps1 -DBPassword `"$password`"" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "ERROR: Connection failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "  1. Wrong password" -ForegroundColor Gray
    Write-Host "  2. PostgreSQL service not running" -ForegroundColor Gray
    Write-Host "  3. PostgreSQL not listening on $DBHost`:$DBPort" -ForegroundColor Gray
    Write-Host "  4. User '$DBUser' doesn't exist" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To check PostgreSQL status:" -ForegroundColor Yellow
    Write-Host "  Get-Service postgresql*" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To start PostgreSQL:" -ForegroundColor Yellow
    Write-Host "  Start-Service postgresql-x64-16" -ForegroundColor Cyan
    Write-Host "  (Replace 16 with your PostgreSQL version)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To reset your password:" -ForegroundColor Yellow
    Write-Host "  1. Edit pg_hba.conf (usually in C:\Program Files\PostgreSQL\16\data\)" -ForegroundColor Gray
    Write-Host "  2. Change 'md5' to 'trust' for local connections" -ForegroundColor Gray
    Write-Host "  3. Restart PostgreSQL service" -ForegroundColor Gray
    Write-Host "  4. Run: psql -U postgres -c `"ALTER USER postgres PASSWORD 'newpassword';`"" -ForegroundColor Gray
    Write-Host "  5. Change back to 'md5' in pg_hba.conf" -ForegroundColor Gray
    Write-Host "  6. Restart PostgreSQL again" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
