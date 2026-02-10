#
# EUTLAS Environment Cluster Provisioning
#
# Creates a dedicated k3s cluster on Hetzner for staging or test environments.
# Each environment gets its own single-node cluster for isolation from production.
#
# Prerequisites:
#   - hcloud CLI (scoop install hcloud)
#   - kubectl (scoop install kubectl)
#   - helm (scoop install helm)
#   - SSH key at ~/.ssh/id_ed25519
#
# Usage:
#   $env:HCLOUD_TOKEN = "your-hetzner-api-token"
#   .\provision-env-cluster.ps1 -Environment staging
#   .\provision-env-cluster.ps1 -Environment test
#   .\provision-env-cluster.ps1 -Environment staging -Cleanup
#

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("staging", "test")]
    [string]$Environment,

    [string]$Location = "nbg1",
    [string]$ServerType = "cpx22",
    [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
$ServerName = "eutlas-$Environment"
$SshKeyName = "eutlas-env-key"
$SshKeyPath = "$env:USERPROFILE\.ssh\id_ed25519"
$KubeDir = "$env:USERPROFILE\.kube"
$KubeConfigPath = "$KubeDir\eutlas-$Environment-config"
$Namespace = "eutlas-$Environment"

# --- Helpers ---
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Blue }
function Write-Success { param($msg) Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Header {
    param($msg)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host ""
}

# --- Cleanup ---
function Remove-EnvironmentCluster {
    Write-Header "Removing $Environment cluster"

    $confirm = Read-Host "This will permanently delete the $Environment server and all data. Continue? (y/n)"
    if ($confirm -ne "y") { Write-Warn "Aborted."; return }

    Write-Info "Deleting server $ServerName..."
    hcloud server delete $ServerName 2>$null
    Remove-Item $KubeConfigPath -ErrorAction SilentlyContinue

    Write-Success "Cluster $ServerName removed"
    Write-Host ""
    Write-Warn "Remember to remove the KUBE_CONFIG_$(($Environment).ToUpper()) GitHub secret if no longer needed."
}

# --- Validation ---
function Test-Prerequisites {
    Write-Header "Validating Prerequisites"

    if (-not $env:HCLOUD_TOKEN) {
        Write-Host "[ERROR] HCLOUD_TOKEN is required" -ForegroundColor Red
        Write-Host '  Set it with: $env:HCLOUD_TOKEN = "your-token"'
        exit 1
    }

    foreach ($cmd in @("hcloud", "kubectl", "helm")) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Write-Host "[ERROR] $cmd is not installed. Install with: scoop install $cmd" -ForegroundColor Red
            exit 1
        }
        Write-Info "Found: $cmd"
    }

    if (-not (Test-Path $SshKeyPath)) {
        Write-Host "[ERROR] SSH key not found at $SshKeyPath" -ForegroundColor Red
        Write-Host "  Generate one with: ssh-keygen -t ed25519"
        exit 1
    }
    Write-Info "SSH key: $SshKeyPath"

    Write-Success "Prerequisites validated"
}

# --- SSH Key ---
function Ensure-SshKey {
    Write-Header "Ensuring SSH Key in Hetzner"

    $existing = hcloud ssh-key list -o noheader | Select-String $SshKeyName
    if (-not $existing) {
        hcloud ssh-key create --name $SshKeyName --public-key-from-file "$SshKeyPath.pub"
        Write-Success "SSH key '$SshKeyName' uploaded to Hetzner"
    } else {
        Write-Info "SSH key '$SshKeyName' already exists"
    }
}

# --- Server Creation ---
function New-Server {
    Write-Header "Creating Server: $ServerName ($ServerType in $Location)"

    $existing = hcloud server list -o noheader | Select-String $ServerName
    if ($existing) {
        Write-Info "Server $ServerName already exists"
        $script:ServerIP = (hcloud server ip $ServerName).Trim()
        Write-Info "IP: $script:ServerIP"
        return
    }

    Write-Info "Creating $ServerType server..."
    hcloud server create `
        --name $ServerName `
        --type $ServerType `
        --image ubuntu-22.04 `
        --location $Location `
        --ssh-key $SshKeyName `
        --label "env=$Environment,app=eutlas"

    $script:ServerIP = (hcloud server ip $ServerName).Trim()
    Write-Info "Server IP: $script:ServerIP"

    Write-Info "Waiting 45s for server to boot..."
    Start-Sleep -Seconds 45

    Write-Success "Server created"
}

# --- K3s Installation ---
function Install-K3s {
    Write-Header "Installing K3s"

    Write-Info "Installing k3s on $ServerName..."
    ssh.exe -T -o StrictHostKeyChecking=no -o ConnectTimeout=30 -o BatchMode=yes `
        -i $SshKeyPath root@$script:ServerIP `
        "curl -sfL https://get.k3s.io | sh -s - server --disable traefik --write-kubeconfig-mode 644 --node-external-ip $($script:ServerIP)"

    Write-Info "Waiting 15s for k3s to start..."
    Start-Sleep -Seconds 15

    # Verify
    ssh.exe -T -o StrictHostKeyChecking=no -o BatchMode=yes `
        -i $SshKeyPath root@$script:ServerIP `
        "kubectl get nodes"

    Write-Success "K3s installed and running"
}

# --- Kubeconfig ---
function Get-Kubeconfig {
    Write-Header "Fetching Kubeconfig"

    if (-not (Test-Path $KubeDir)) { New-Item -ItemType Directory -Path $KubeDir -Force | Out-Null }

    scp.exe -o StrictHostKeyChecking=no -o BatchMode=yes `
        -i $SshKeyPath "root@$($script:ServerIP):/etc/rancher/k3s/k3s.yaml" $KubeConfigPath

    $content = Get-Content $KubeConfigPath -Raw
    $content = $content -replace "127.0.0.1", $script:ServerIP
    Set-Content $KubeConfigPath $content

    $env:KUBECONFIG = $KubeConfigPath
    Write-Info "Kubeconfig saved to: $KubeConfigPath"

    # Verify connectivity
    kubectl get nodes
    Write-Success "Kubeconfig ready"
}

# --- Infrastructure ---
function Install-Infrastructure {
    Write-Header "Installing Infrastructure Components"

    $env:KUBECONFIG = $KubeConfigPath

    # NGINX Ingress Controller (NodePort)
    Write-Info "Installing NGINX Ingress Controller..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>$null
    helm repo update ingress-nginx 2>$null
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx `
        --namespace ingress-nginx --create-namespace `
        --set controller.service.type=NodePort `
        --set controller.service.nodePorts.http=30080 `
        --set controller.service.nodePorts.https=30443 `
        --set controller.resources.requests.cpu=50m `
        --set controller.resources.requests.memory=64Mi `
        --set controller.resources.limits.cpu=200m `
        --set controller.resources.limits.memory=128Mi

    # MongoDB Community Operator
    Write-Info "Installing MongoDB Community Operator..."
    kubectl apply -f "https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml"
    helm repo add mongodb https://mongodb.github.io/helm-charts 2>$null
    helm repo update mongodb 2>$null
    helm upgrade --install mongodb-operator mongodb/community-operator `
        --namespace mongodb-operator --create-namespace `
        --set operator.resources.requests.cpu=50m `
        --set operator.resources.requests.memory=64Mi `
        --set operator.resources.limits.cpu=200m `
        --set operator.resources.limits.memory=256Mi `
        --set operator.watchNamespace="*"

    Write-Info "Waiting 30s for operators to start..."
    Start-Sleep -Seconds 30

    Write-Success "Infrastructure installed"
}

# --- Deploy EUTLAS ---
function Deploy-Eutlas {
    Write-Header "Deploying EUTLAS ($Environment)"

    $env:KUBECONFIG = $KubeConfigPath

    # The Kustomize overlays handle everything: namespace, secrets, RBAC, MongoDB,
    # Redis, Backend, Frontend, Ingress - all environment-specific.
    $kustomizePath = Join-Path $PSScriptRoot "..\k8s\environments\$Environment"

    if (-not (Test-Path $kustomizePath)) {
        Write-Host "[ERROR] Kustomize overlay not found at: $kustomizePath" -ForegroundColor Red
        exit 1
    }

    Write-Info "Applying Kustomize overlay from: $kustomizePath"
    kubectl apply -k $kustomizePath

    Write-Info "Waiting for deployments to roll out..."
    kubectl rollout status deployment/eutlas-backend -n $Namespace --timeout=180s 2>$null
    kubectl rollout status deployment/eutlas-frontend -n $Namespace --timeout=180s 2>$null

    Write-Success "EUTLAS deployed"
}

# --- Summary ---
function Show-Summary {
    $env:KUBECONFIG = $KubeConfigPath

    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host "  EUTLAS $($Environment.ToUpper()) CLUSTER READY" -ForegroundColor Green
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host ""
    Write-Host "  Server:      $ServerName ($ServerType)" -ForegroundColor White
    Write-Host "  IP:          $($script:ServerIP)" -ForegroundColor White
    Write-Host "  Location:    $Location" -ForegroundColor White
    Write-Host "  Kubeconfig:  $KubeConfigPath" -ForegroundColor White
    Write-Host ""
    Write-Host "  Access EUTLAS:" -ForegroundColor Cyan
    Write-Host "    http://$($script:ServerIP):30080" -ForegroundColor Green
    Write-Host ""
    Write-Host "  API Health:" -ForegroundColor Cyan
    Write-Host "    curl http://$($script:ServerIP):30080/api/v1/health" -ForegroundColor White
    Write-Host ""
    Write-Host "  Kubectl:" -ForegroundColor Cyan
    Write-Host "    `$env:KUBECONFIG = `"$KubeConfigPath`"" -ForegroundColor White
    Write-Host "    kubectl get pods -n $Namespace" -ForegroundColor White
    Write-Host ""
    Write-Host "  CI/CD Setup:" -ForegroundColor Cyan
    Write-Host "    Add the kubeconfig as a GitHub secret for the '$Environment' environment:" -ForegroundColor White
    Write-Host "    Secret name: KUBE_CONFIG" -ForegroundColor White
    Write-Host "    Value: (base64 of $KubeConfigPath)" -ForegroundColor White
    Write-Host ""

    # Generate base64 kubeconfig for CI/CD
    $kubeconfigContent = Get-Content $KubeConfigPath -Raw
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($kubeconfigContent))
    Write-Host "  Base64 kubeconfig (for GitHub secret):" -ForegroundColor Yellow
    Write-Host "    $($b64.Substring(0, 60))..." -ForegroundColor DarkGray
    Write-Host ""
    Set-Content "$KubeConfigPath.b64" $b64
    Write-Host "    Full base64 saved to: $KubeConfigPath.b64" -ForegroundColor White
    Write-Host ""

    Write-Host ("=" * 60) -ForegroundColor Green

    # Show pods
    Write-Host ""
    kubectl get pods -n $Namespace
}

# --- Main ---
function Main {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  EUTLAS Environment Cluster Provisioning" -ForegroundColor Cyan
    Write-Host "  Environment: $($Environment.ToUpper())" -ForegroundColor Cyan
    Write-Host "  Server: $ServerType @ $Location (~4 EUR/month)" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host ""

    if ($Cleanup) {
        Remove-EnvironmentCluster
    } else {
        Test-Prerequisites
        Ensure-SshKey
        New-Server
        Install-K3s
        Get-Kubeconfig
        Install-Infrastructure
        Deploy-Eutlas
        Show-Summary
    }
}

Main
