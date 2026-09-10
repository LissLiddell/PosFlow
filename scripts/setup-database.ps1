$ErrorActionPreference = "Stop"

function New-RandomHex([int]$byteCount) {
  $bytes = New-Object byte[] $byteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "PostgreSQL command-line tools were not found."
}

Write-Host "PosFlow database setup" -ForegroundColor Cyan
Write-Host "Enter the password for your local PostgreSQL 'postgres' user. It will not be saved."
$securePassword = Read-Host "PostgreSQL password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$applicationDatabasePassword = New-RandomHex 24
$jwtSecret = New-RandomHex 32
$demoUserPassword = "$(New-RandomHex 12)Aa1!"

try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  & psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE postgres REFRESH COLLATION VERSION;"
  if ($LASTEXITCODE -ne 0) { throw "Could not refresh the postgres collation version." }
  & psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE template1 REFRESH COLLATION VERSION;"
  if ($LASTEXITCODE -ne 0) { throw "Could not refresh the template1 collation version." }

  $roleExists = & psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'posflow'"
  if ($LASTEXITCODE -ne 0) { throw "Could not connect to PostgreSQL. Check the password and try again." }

  if ([string]$roleExists -ne "1") {
    & psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE posflow WITH LOGIN CREATEDB;"
    if ($LASTEXITCODE -ne 0) { throw "Could not create the PosFlow database user." }
    Write-Host "Created the PosFlow database user."
  } else {
    Write-Host "PosFlow database user already exists."
  }

  & psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE posflow WITH LOGIN PASSWORD '$applicationDatabasePassword' CREATEDB;"
  if ($LASTEXITCODE -ne 0) { throw "Could not configure the local PosFlow database user." }

  $databaseExists = & psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'posflow'"
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect local databases." }

  if ([string]$databaseExists -ne "1") {
    & psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE posflow OWNER posflow;"
    if ($LASTEXITCODE -ne 0) { throw "Could not create the PosFlow database." }
    Write-Host "Created the PosFlow database."
  } else {
    Write-Host "PosFlow database already exists."
  }

  $projectRoot = Split-Path -Parent $PSScriptRoot
  $apiEnvironment = @"
DATABASE_URL="postgresql://posflow:$applicationDatabasePassword@localhost:5432/posflow?schema=public"
JWT_SECRET="$jwtSecret"
DEMO_USER_PASSWORD="$demoUserPassword"
API_PORT=4100
WEB_ORIGIN="http://localhost:5174"
"@
  $webEnvironment = @"
VITE_API_URL="http://localhost:4100/api"
VITE_DEMO_PASSWORD="$demoUserPassword"
"@
  Set-Content -LiteralPath (Join-Path $projectRoot "apps\api\.env") -Value $apiEnvironment -Encoding utf8
  Set-Content -LiteralPath (Join-Path $projectRoot "apps\web\.env") -Value $webEnvironment -Encoding utf8
  Write-Host "Created ignored API and web .env files with generated local credentials."
  Write-Host "Database setup complete." -ForegroundColor Green
}
finally {
  $env:PGPASSWORD = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
