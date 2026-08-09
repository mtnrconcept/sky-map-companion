[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("version", "configure", "doctor", "start", "stop", "restart", "status", "logs", "ingest-m31", "repair-m31", "rebuild-m31", "archive-status")]
    [string]$Action = "status",

    [ValidateRange(1, 10000)]
    [int]$MaxFiles = 24,

    [ValidateRange(0.01, 1024)]
    [double]$MaxGiB = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ScriptVersion = "2026-08-09.9"

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$WorkerDirectory = Join-Path $RepositoryRoot "workers\science"
$ComposeFile = Join-Path $WorkerDirectory "compose.windows.yml"
$EnvironmentFile = Join-Path $WorkerDirectory ".env.worker.local"

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker Desktop est introuvable. Installez-le et activez le moteur WSL 2."
    }

    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Desktop est installe mais son moteur n'est pas demarre."
    }

    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Le module Docker Compose v2 est indisponible. Mettez Docker Desktop a jour."
    }
}

function Assert-EnvironmentFile {
    if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
        throw "Configuration absente. Lancez d'abord: .\scripts\windows-science-worker.ps1 configure"
    }
}

function Assert-WorkerSources {
    $RequiredPaths = @(
        (Join-Path $WorkerDirectory "Dockerfile"),
        (Join-Path $WorkerDirectory "pyproject.toml"),
        (Join-Path $WorkerDirectory "README.md"),
        (Join-Path $WorkerDirectory "src")
    )

    foreach ($RequiredPath in $RequiredPaths) {
        if (-not (Test-Path -LiteralPath $RequiredPath)) {
            throw "Fichier du worker introuvable : $RequiredPath. Verifiez que la branche feat/complete-science-platform est a jour."
        }
    }
}

function Read-RequiredValue {
    param([Parameter(Mandatory = $true)][string]$Prompt)

    $Value = Read-Host $Prompt
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Une valeur est obligatoire pour : $Prompt"
    }
    return (Remove-SurroundingQuotes -Value $Value)
}

function Read-SecretValue {
    param([Parameter(Mandatory = $true)][string]$Prompt)

    $SecureValue = Read-Host $Prompt -AsSecureString
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        $Value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
        if ([string]::IsNullOrWhiteSpace($Value)) {
            throw "Une valeur secrete est obligatoire pour : $Prompt"
        }
        return (Remove-SurroundingQuotes -Value $Value)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
    }
}

function Remove-SurroundingQuotes {
    param([Parameter(Mandatory = $true)][string]$Value)

    $Normalized = $Value.Trim()
    if ($Normalized.Length -ge 2) {
        $First = $Normalized.Substring(0, 1)
        $Last = $Normalized.Substring($Normalized.Length - 1, 1)
        if (($First -eq '"' -and $Last -eq '"') -or ($First -eq "'" -and $Last -eq "'")) {
            $Normalized = $Normalized.Substring(1, $Normalized.Length - 2).Trim()
        }
    }
    return $Normalized
}

function Normalize-DatabaseUrl {
    param([Parameter(Mandatory = $true)][string]$Value)

    $DatabaseUrl = Remove-SurroundingQuotes -Value $Value
    if ($DatabaseUrl -match '(?i)\[(YOUR-)?PASSWORD\]' -or $DatabaseUrl -match '(?i)PASSWORD_URL_ENCODED') {
        throw "DATABASE_URL contient encore le placeholder du mot de passe. Remplacez-le par le mot de passe PostgreSQL encode dans l'URL."
    }
    if ($DatabaseUrl -notmatch '(?i)^postgres(ql)?://') {
        throw "DATABASE_URL doit commencer par postgres:// ou postgresql://. Dans Supabase, ouvrez Connect > Session pooler puis copiez la connection string."
    }
    if ($DatabaseUrl -match '#') {
        throw "DATABASE_URL contient un # non encode dans le mot de passe. Remplacez-le par %23."
    }
    if ($DatabaseUrl -match '[\r\n\s]' -or $DatabaseUrl -match '\$') {
        throw "DATABASE_URL contient un espace ou un caractere non encode. Encodez les caracteres speciaux du mot de passe dans l'URL."
    }

    $ParsedUrl = $null
    if (-not [Uri]::TryCreate($DatabaseUrl, [UriKind]::Absolute, [ref]$ParsedUrl) -or [string]::IsNullOrWhiteSpace($ParsedUrl.Host)) {
        throw "DATABASE_URL n'est pas une URL PostgreSQL valide. Copiez la connection string du pooler Supabase en mode Session."
    }
    if ($ParsedUrl.Port -eq 6543) {
        throw "DATABASE_URL utilise le port 6543 du mode Transaction. Dans Supabase, choisissez Session pooler sur le port 5432."
    }
    if ($ParsedUrl.Port -ne 5432) {
        throw "DATABASE_URL doit utiliser le port 5432 du pooler Supabase en mode Session."
    }
    if ($ParsedUrl.Host -notmatch '(?i)(^|\.)pooler\.supabase\.com$') {
        throw "DATABASE_URL ne pointe pas vers le pooler Supabase. Dans le projet, ouvrez Connect > Session pooler et copiez l'URL sur le port 5432."
    }
    if ($ParsedUrl.UserInfo -notmatch '(?i)^postgres\.[a-z0-9]+:.+$') {
        throw "DATABASE_URL doit contenir l'utilisateur postgres.PROJECT_REF et le mot de passe PostgreSQL."
    }

    if ($DatabaseUrl -match '(?i)([?&])sslmode=') {
        $DatabaseUrl = [regex]::Replace(
            $DatabaseUrl,
            '(?i)([?&])sslmode=[^&#]*',
            '${1}sslmode=require'
        )
    }
    else {
        $Separator = if ($DatabaseUrl.Contains('?')) { '&' } else { '?' }
        $DatabaseUrl = "$DatabaseUrl${Separator}sslmode=require"
    }

    return $DatabaseUrl
}

function Protect-EnvironmentFile {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $Acl = Get-Acl -LiteralPath $EnvironmentFile
    $Acl.SetAccessRuleProtection($true, $false)
    $Rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $Identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $Acl.SetAccessRule($Rule)
    Set-Acl -LiteralPath $EnvironmentFile -AclObject $Acl
}

function Configure-Worker {
    if (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf) {
        $Confirmation = Read-Host "La configuration existe deja. Tapez REMPLACER pour l'ecraser"
        if ($Confirmation -cne "REMPLACER") {
            Write-Host "Configuration conservee."
            return
        }
    }

    $DatabaseUrl = Normalize-DatabaseUrl -Value (Read-SecretValue -Prompt "DATABASE_URL du pooler Supabase (mode Session, port 5432)")

    $SupabaseUrl = Read-RequiredValue -Prompt "SUPABASE_URL (https://...supabase.co)"
    if ($SupabaseUrl -notmatch '(?i)^https://[a-z0-9-]+\.supabase\.co/?$') {
        throw "SUPABASE_URL n'a pas le format attendu."
    }
    $SupabaseUrl = $SupabaseUrl.TrimEnd("/")

    $SecretKey = Read-SecretValue -Prompt "SUPABASE_SECRET_KEY (cle serveur)"
    if ($SecretKey -match '^(sb_publishable_|sb_anon_)') {
        throw "SUPABASE_SECRET_KEY doit etre une cle serveur, pas une cle publishable ou anon."
    }
    $DefaultWorkerId = (($env:COMPUTERNAME.ToLowerInvariant() -replace '[^a-z0-9-]', '-') + "-science-01")
    $WorkerId = Read-Host "WORKER_ID stable [$DefaultWorkerId]"
    if ([string]::IsNullOrWhiteSpace($WorkerId)) {
        $WorkerId = $DefaultWorkerId
    }
    if ($WorkerId -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$') {
        throw "WORKER_ID doit contenir 3 a 64 lettres, chiffres, points, tirets ou underscores."
    }

    $System = Get-CimInstance Win32_ComputerSystem
    $LogicalProcessors = [int]$System.NumberOfLogicalProcessors
    $TotalMemoryGiB = [math]::Floor([double]$System.TotalPhysicalMemory / 1GB)
    $CpuLimit = [math]::Max(1, [math]::Min(8, [math]::Floor($LogicalProcessors / 2)))
    $MemoryLimitGiB = [math]::Max(4, [math]::Min(16, [math]::Floor($TotalMemoryGiB / 2)))

    $Lines = @(
        "DATABASE_URL=$DatabaseUrl",
        "SUPABASE_URL=$SupabaseUrl",
        "SUPABASE_SECRET_KEY=$SecretKey",
        "WORKER_ID=$WorkerId",
        "PIPELINE_VERSION=science-v1",
        "LEASE_SECONDS=300",
        "POLL_SECONDS=2",
        "MAX_DERIVATIVE_BYTES=524288000",
        "MAX_MASTER_PIXELS=40000000",
        "MAX_SCALE_DEGRADATION=2.5",
        "WORKER_MEMORY_LIMIT=${MemoryLimitGiB}g",
        "WORKER_CPU_LIMIT=$($CpuLimit).0"
    )
    [IO.File]::WriteAllLines($EnvironmentFile, $Lines, [Text.UTF8Encoding]::new($false))
    Protect-EnvironmentFile
    Write-Host "Configuration creee et protegee : $EnvironmentFile"
    Write-Host "SSL obligatoire ajoute automatiquement a DATABASE_URL."
    Write-Host "Limites proposees : $CpuLimit CPU et $MemoryLimitGiB Gio de RAM."
}

function Invoke-Compose {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    Push-Location -LiteralPath $WorkerDirectory
    try {
        & docker compose --project-directory $WorkerDirectory --env-file $EnvironmentFile -f $ComposeFile @Arguments
        $ComposeExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($ComposeExitCode -ne 0) {
        throw "Docker Compose a echoue (code $ComposeExitCode)."
    }
}

function Test-WorkerConfiguration {
    Assert-Docker
    Assert-EnvironmentFile
    Assert-WorkerSources
    Invoke-Compose @("config", "--quiet")

    $Drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($RepositoryRoot).TrimEnd("\").TrimEnd(":"))
    $FreeGiB = [math]::Round($Drive.Free / 1GB, 1)
    if ($FreeGiB -lt 30) {
        Write-Warning "Il ne reste que $FreeGiB Gio sur le disque du depot. Prevoyez au moins 30 Gio libres."
    }
    else {
        Write-Host "Espace libre: $FreeGiB Gio."
    }
    Write-Host "Docker, Compose et la configuration du worker sont valides."
}

switch ($Action) {
    "version" {
        Write-Host "Sky Map Windows science worker bootstrap $ScriptVersion"
    }
    "configure" {
        Assert-Docker
        Configure-Worker
        Test-WorkerConfiguration
    }
    "doctor" {
        Test-WorkerConfiguration
    }
    "start" {
        Test-WorkerConfiguration
        Invoke-Compose @("up", "--detach", "--build", "--remove-orphans")
        Invoke-Compose @("ps")
    }
    "stop" {
        Assert-Docker
        Assert-EnvironmentFile
        Invoke-Compose @("stop", "--timeout", "600")
    }
    "restart" {
        Test-WorkerConfiguration
        Invoke-Compose @("up", "--detach", "--build", "--force-recreate", "--remove-orphans")
        Invoke-Compose @("ps")
    }
    "status" {
        Assert-Docker
        Assert-EnvironmentFile
        Invoke-Compose @("ps")
    }
    "logs" {
        Assert-Docker
        Assert-EnvironmentFile
        Invoke-Compose @("logs", "--follow", "--tail", "200", "science-worker")
    }
    "ingest-m31" {
        Test-WorkerConfiguration
        $MaxBytes = [int64]($MaxGiB * 1GB)
        Write-Host "Demarrage du lot public M31 : maximum $MaxFiles FITS et $MaxGiB Gio."
        Write-Host "La commande reste ouverte jusqu'a la qualification et a la construction de la mosaique."
        Invoke-Compose @("up", "--detach", "--build", "--remove-orphans", "science-worker")
        Invoke-Compose @(
            "run", "--rm", "--no-deps", "--entrypoint", "sky-archive-ingest", "science-worker",
            "ingest", "--object-id", "M31", "--filter", "r", "--max-files", "$MaxFiles",
            "--max-bytes", "$MaxBytes", "--watch", "--build-mosaic"
        )
    }
    "repair-m31" {
        Test-WorkerConfiguration
        Write-Host "Reconstruction du worker corrige et reprise idempotente du dernier lot M31."
        Invoke-Compose @("up", "--detach", "--build", "--force-recreate", "--remove-orphans", "science-worker")
        Invoke-Compose @(
            "run", "--rm", "--no-deps", "--entrypoint", "sky-archive-ingest", "science-worker",
            "retry", "--object-id", "M31", "--filter", "r", "--watch", "--build-mosaic"
        )
        Invoke-Compose @("ps")
    }
    "rebuild-m31" {
        Test-WorkerConfiguration
        Write-Host "Reconstruction v9 des seuls produits derives M31 depuis les 13 FITS deja qualifies."
        Write-Host "Aucun telechargement d'archive et aucune requalification ne seront lances."
        Invoke-Compose @("up", "--detach", "--build", "--force-recreate", "--remove-orphans", "science-worker")
        Invoke-Compose @(
            "run", "--rm", "--no-deps", "--entrypoint", "sky-archive-ingest", "science-worker",
            "rebuild", "--object-id", "M31", "--expected-sources", "13"
        )
        Invoke-Compose @("ps")
    }
    "archive-status" {
        Test-WorkerConfiguration
        Invoke-Compose @(
            "run", "--rm", "--no-deps", "--entrypoint", "sky-archive-ingest", "science-worker",
            "status", "--object-id", "M31", "--limit", "10"
        )
    }
}
