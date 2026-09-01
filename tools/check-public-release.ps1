[CmdletBinding()]
param(
    # The default is the repository that contains this script.  Passing an
    # explicit path is useful when the script is copied into a release folder.
    [string]$RepoRoot,
    # In strict mode, optional review paths (for example the bundled Python
    # runtime) are reported as failures as well as blocked user-data paths.
    [switch]$Strict
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    throw "Repository directory does not exist: $RepoRoot"
}

Set-Location -LiteralPath (Resolve-Path -LiteralPath $RepoRoot)

function Invoke-GitLines {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $lines = @(& git @Arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
    return @($lines | ForEach-Object { [string]$_ } | Where-Object { $_ -ne '' })
}

function Normalize-GitPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return ($Path -replace '\\', '/').TrimStart('./')
}

function Is-BlockedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $p = Normalize-GitPath $Path
    # .env.example is intentionally the one publishable environment file.
    if ($p -eq '.env.example') { return $false }

    $patterns = @(
        '(?i)(^|/)(?:API/)?\.env(?:\..*)?$',
        '(?i)(^|/)(?:data|assets|output|artifacts)(/|$)',
        '(?i)(^|/)history\.json$',
        '(?i)(^|/)user_attachment(?:[./]|$)',
        '(?i)^static/runninghub/(?:api_providers\.json|thumbnails/)',
        '(?i)(^|/).*\.(?:log|session|sqlite|sqlite3|db)$',
        '(?i)(^|/)(?:cookies|storage-state|session)[^/]*\.json$',
        '(^|/)赞赏\.png$'
    )
    foreach ($pattern in $patterns) {
        if ($p -match $pattern) { return $true }
    }
    return $false
}

function Is-ReviewPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $p = Normalize-GitPath $Path
    # The implementation plan is intentionally published documentation; the
    # neighbouring CODEX/GROK task scratch files remain ignored.
    if ($p -eq 'CODEX-XYQ-PLAN.md') { return $false }
    $patterns = @(
        '(?i)(^|/)(?:python|Infinite-Canvas-main|ref-xyq)(/|$)',
        '(?i)(^|/).*\.(?:broken-before[^/]*)$',
        '(?i)(^|/).*\.mojibake-backup$',
        '(?i)(^|/).*\.stable-before[^/]*$',
        '(?i)(^|/)(?:GROK-|CODEX-).*\.md$',
        '(?i)^(?:seedance25|santi-).*\.json$'
    )
    foreach ($pattern in $patterns) {
        if ($p -match $pattern) { return $true }
    }
    return $false
}

$tracked = @(Invoke-GitLines @('ls-files'))
$stagedAdded = @(Invoke-GitLines @('diff', '--cached', '--name-only', '--diff-filter=ACMR'))
$untracked = @(Invoke-GitLines @('ls-files', '--others', '--exclude-standard'))

$blockedTracked = @($tracked | Where-Object { Is-BlockedPath $_ })
$blockedStaged = @($stagedAdded | Where-Object { Is-BlockedPath $_ })
$blockedUntracked = @($untracked | Where-Object { Is-BlockedPath $_ })
$reviewTracked = @($tracked | Where-Object { Is-ReviewPath $_ })
$reviewStaged = @($stagedAdded | Where-Object { Is-ReviewPath $_ })

# Scan the exact index that would be committed. `git grep --cached` never
# opens ignored working-tree files such as API/.env or data/, and `-l`
# returns file names only so a credential value is never echoed.
$secretPatterns = @(
    'Rh-Comfy-Auth[=:][A-Za-z0-9+/=_-]{20,}',
    'Rh-Identify[=:][A-Za-z0-9_-]{16,}',
    'gh[pousr]_[A-Za-z0-9]{20,}',
    'sk-[A-Za-z0-9_-]{20,}',
    'AIza[0-9A-Za-z_-]{20,}',
    'AKIA[0-9A-Z]{16}',
    '-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----'
)
$secretHitFiles = @()
foreach ($pattern in $secretPatterns) {
    $hits = @(& git grep --cached -I -l -E -- $pattern -- 2>$null)
    $grepExit = $LASTEXITCODE
    if ($grepExit -notin 0, 1) {
        throw "git grep --cached failed with exit code $grepExit"
    }
    $secretHitFiles += $hits
}
$secretHitFiles = @($secretHitFiles | Where-Object { $_ } | Sort-Object -Unique)

Write-Host "Canvas Lab public-release audit"
Write-Host "Repository: $(Get-Location)"
Write-Host ""

if ($blockedTracked.Count -gt 0 -or $blockedStaged.Count -gt 0 -or $blockedUntracked.Count -gt 0) {
    Write-Host '[FAIL] Blocked local/secrets paths were found:' -ForegroundColor Red
    foreach ($entry in ($blockedTracked + $blockedStaged + $blockedUntracked | Sort-Object -Unique)) {
        Write-Host "  $entry" -ForegroundColor Red
    }
    Write-Host ''
    Write-Host 'Remove these paths from the index (without deleting the local file), then rerun this audit:'
    Write-Host '  git rm --cached -- <path>'
    exit 1
}

if ($secretHitFiles.Count -gt 0) {
    Write-Host '[FAIL] High-confidence credential markers were found in the commit index:' -ForegroundColor Red
    foreach ($entry in $secretHitFiles) {
        Write-Host "  $entry" -ForegroundColor Red
    }
    Write-Host ''
    Write-Host 'Only file names are shown. Remove or rotate the credential, stage the sanitized file, and rerun this audit.'
    exit 1
}

if ($reviewTracked.Count -gt 0 -or $reviewStaged.Count -gt 0) {
    Write-Host '[REVIEW] Optional or historical paths are present:' -ForegroundColor Yellow
    $reviewEntries = @($reviewTracked + $reviewStaged | Sort-Object -Unique)
    $reviewDirs = @($reviewEntries | Where-Object { $_ -match '^(?i)(?:python|Infinite-Canvas-main|ref-xyq)/' })
    if ($reviewDirs.Count -gt 0) {
        Write-Host '  (bundled/local runtime directories:)' -ForegroundColor Yellow
        foreach ($dir in ($reviewDirs | ForEach-Object { (Normalize-GitPath $_).Split('/')[0] } | Sort-Object -Unique)) {
            Write-Host "  $dir/" -ForegroundColor Yellow
        }
    }
    foreach ($entry in ($reviewEntries | Where-Object { $_ -notmatch '^(?i)(?:python|Infinite-Canvas-main|ref-xyq)/' })) {
        Write-Host "  $entry" -ForegroundColor Yellow
    }
    Write-Host 'These are not user data, but a small public release usually omits them.'
    if ($Strict) {
        exit 2
    }
}

$localOnly = @('API/.env', 'data', 'assets', 'output', 'artifacts', 'history.json', 'user_attachment')
$presentLocal = @($localOnly | Where-Object { Test-Path -LiteralPath $_ })
if ($presentLocal.Count -gt 0) {
    Write-Host ''
    Write-Host '[OK] Local-only paths remain on disk and are not part of the public index:' -ForegroundColor Green
    foreach ($entry in $presentLocal) { Write-Host "  $entry" -ForegroundColor Green }
}

Write-Host ''
Write-Host "[OK] No blocked local data, environment files, credentials, or session files are in the tracked/staged set." -ForegroundColor Green
Write-Host 'The audit only checks names and Git metadata; it does not open or upload local data.' -ForegroundColor DarkGray
exit 0
