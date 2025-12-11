#
# EUTLAS Hetzner Infrastructure Deployment Script (Windows PowerShell)
# This script sets up the complete EUTLAS infrastructure on Hetzner Cloud
#
# Prerequisites:
#   - Hetzner Cloud API Token
#   - hcloud CLI installed (scoop install hcloud)
#   - kubectl installed
#   - helm installed
#
# Usage:
#   $env:HCLOUD_TOKEN = "your-hetzner-api-token"
#   .\deploy.ps1
#

param(
    [string]$RancherLocation = "fsn1",
    [string]$Domain = "eutlas.eu"
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Blue }
function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Check prerequisites
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    if (-not $env:HCLOUD_TOKEN) {
        Write-Error "HCLOUD_TOKEN environment variable is not set"
        Write-Host 'Please set it: $env:HCLOUD_TOKEN = "your-token"'
        exit 1
    }
    
    $commands = @("hcloud", "kubectl", "helm")
    foreach ($cmd in $commands) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Write-Error "$cmd is required but not installed"
            exit 1
        }
    }
    
    Write-Success "All prerequisites met"
}

# Create Rancher management server
function New-RancherServer {
    Write-Info "Creating Rancher management server..."
    
    $existingServer = hcloud server list -o noheader | Select-String "rancher-mgmt"
    
    if (-not $existingServer) {
        # Check for SSH key
        $sshKey = hcloud ssh-key list -o noheader | Select-String "eutlas-deploy"
        if (-not $sshKey) {
            Write-Warning "No SSH key found. Creating one..."
            if (-not (Test-Path "$env:USERPROFILE\.ssh\eutlas_rsa")) {
                ssh-keygen -t rsa -b 4096 -f "$env:USERPROFILE\.ssh\eutlas_rsa" -N '""' -C "eutlas-deploy"
            }
            hcloud ssh-key create --name eutlas-deploy --public-key-from-file "$env:USERPROFILE\.ssh\eutlas_rsa.pub"
        }
        
        hcloud server create `
            --name rancher-mgmt `
            --type cpx31 `
            --image ubuntu-22.04 `
            --location $RancherLocation `
            --ssh-key eutlas-deploy
        
        $rancherIP = hcloud server ip rancher-mgmt
        Write-Success "Rancher server created at $rancherIP"
        
        Write-Info "Waiting for server to be ready..."
        Start-Sleep -Seconds 30
        
        Write-Host ""
        Write-Host "=============================================="
        Write-Host "MANUAL STEPS REQUIRED:"
        Write-Host "=============================================="
        Write-Host "1. SSH into the server:"
        Write-Host "   ssh -i $env:USERPROFILE\.ssh\eutlas_rsa root@$rancherIP"
        Write-Host ""
        Write-Host "2. Run these commands:"
        Write-Host "   curl -fsSL https://get.docker.com | sh"
        Write-Host "   docker run -d --name rancher --restart=unless-stopped \"
        Write-Host "     -p 80:80 -p 443:443 --privileged \"
        Write-Host "     -v /opt/rancher:/var/lib/rancher \"
        Write-Host "     rancher/rancher:latest"
        Write-Host ""
        Write-Host "3. Point DNS: rancher.$Domain -> $rancherIP"
        Write-Host "4. Access: https://$rancherIP"
        Write-Host "5. Get password: docker logs rancher 2>&1 | grep 'Bootstrap Password'"
        Write-Host "=============================================="
    } else {
        $rancherIP = hcloud server ip rancher-mgmt
        Write-Info "Rancher server already exists at $rancherIP"
    }
}

# Main deployment
function Main {
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "    EUTLAS Infrastructure Deployment"
    Write-Host "=============================================="
    Write-Host ""
    
    Test-Prerequisites
    New-RancherServer
    
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "Next Steps:"
    Write-Host "=============================================="
    Write-Host "1. Complete Rancher setup (see above)"
    Write-Host "2. Create clusters in Rancher UI:"
    Write-Host "   - eutlas-production (FSN1)"
    Write-Host "   - eutlas-staging (NBG1)"
    Write-Host "3. Download kubeconfig from Rancher"
    Write-Host "4. Run: .\install-eutlas.ps1"
    Write-Host "=============================================="
}

Main


