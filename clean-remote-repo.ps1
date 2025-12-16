# EUTLAS Remote Repository Cleanup Script
# This script uses GitHub API to clean up the remote repository
# Requires: GitHub Personal Access Token (set GITHUB_TOKEN environment variable or pass as parameter)

param(
    [string]$Token = $env:GITHUB_TOKEN,
    [string]$Owner = "stschuer",
    [string]$Repo = "EUTLAS"
)

$ErrorActionPreference = "Stop"

# Validate token
if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "ERROR: GitHub token is required!" -ForegroundColor Red
    Write-Host "Set GITHUB_TOKEN environment variable or pass -Token parameter" -ForegroundColor Yellow
    Write-Host "Example: `$env:GITHUB_TOKEN='your-token'; .\clean-remote-repo.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Cleaning remote repository: $Owner/$Repo" -ForegroundColor Cyan
Write-Host "Note: This script will help identify files to clean." -ForegroundColor Yellow
Write-Host "    You'll need to commit and push changes manually." -ForegroundColor Yellow
Write-Host ""

# Base64 encode token for Basic Auth
$bytes = [System.Text.Encoding]::ASCII.GetBytes("${Owner}:${Token}")
$base64 = [System.Convert]::ToBase64String($bytes)
$headers = @{
    "Authorization" = "Basic $base64"
    "Accept" = "application/vnd.github.v3+json"
    "User-Agent" = "EUTLAS-Cleanup-Script"
}

try {
    # Get repository tree
    Write-Host "Fetching repository information..." -ForegroundColor Yellow
    $repoUrl = "https://api.github.com/repos/${Owner}/${Repo}"
    $repoInfo = Invoke-RestMethod -Uri $repoUrl -Headers $headers -Method Get
    
    Write-Host "   Repository: $($repoInfo.full_name)" -ForegroundColor Green
    Write-Host "   Default branch: $($repoInfo.default_branch)" -ForegroundColor Green
    Write-Host ""
    
    # Get default branch
    $branchUrl = "https://api.github.com/repos/${Owner}/${Repo}/git/ref/heads/$($repoInfo.default_branch)"
    $branchRef = Invoke-RestMethod -Uri $branchUrl -Headers $headers -Method Get
    
    # Get tree
    $treeUrl = "https://api.github.com/repos/${Owner}/${Repo}/git/trees/$($branchRef.object.sha)?recursive=1"
    $tree = Invoke-RestMethod -Uri $treeUrl -Headers $headers -Method Get
    
    # Files that should typically be cleaned
    $patternsToClean = @(
        "node_modules",
        ".next",
        "dist",
        "build",
        "coverage",
        "*.log",
        ".DS_Store",
        "Thumbs.db",
        ".env$",
        "*.tmp",
        ".turbo",
        ".pnpm-store"
    )
    
    Write-Host "Analyzing repository files..." -ForegroundColor Yellow
    $filesToClean = @()
    
    foreach ($item in $tree.tree) {
        if ($item.type -eq "blob") {
            $path = $item.path
            $shouldClean = $false
            
            foreach ($pattern in $patternsToClean) {
                if ($pattern -match "^\*\.(.+)$") {
                    $ext = $matches[1]
                    if ($path -like "*.$ext") {
                        $shouldClean = $true
                        break
                    }
                } elseif ($path -like "*$pattern*") {
                    $shouldClean = $true
                    break
                }
            }
            
            if ($shouldClean) {
                $filesToClean += @{
                    Path = $path
                    Size = $item.size
                    Sha = $item.sha
                }
            }
        }
    }
    
    if ($filesToClean.Count -gt 0) {
        Write-Host "`nFound $($filesToClean.Count) files/directories that should be cleaned:" -ForegroundColor Yellow
        $totalSize = 0
        foreach ($file in $filesToClean) {
            $sizeMB = [math]::Round($file.Size / 1MB, 2)
            $totalSize += $file.Size
            Write-Host "   - $($file.Path) ($sizeMB MB)" -ForegroundColor Cyan
        }
        Write-Host "`n   Total size: $([math]::Round($totalSize / 1MB, 2)) MB" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Green
        Write-Host "   1. Clone the repository locally" -ForegroundColor White
        Write-Host "   2. Run: .\clean-repo.ps1" -ForegroundColor White
        Write-Host "   3. Review changes: git status" -ForegroundColor White
        Write-Host "   4. Commit: git add . && git commit -m 'chore: clean repository'" -ForegroundColor White
        Write-Host "   5. Push: git push origin main" -ForegroundColor White
    } else {
        Write-Host "Repository looks clean! No obvious files to remove." -ForegroundColor Green
    }
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`nAnalysis complete!" -ForegroundColor Green

