#
# EUTLAS Quick Start - IP-Based Deployment (Windows PowerShell)
# No domain required - access directly via IP address
#
# Prerequisites:
#   - Hetzner Cloud API Token
#   - hcloud CLI (scoop install hcloud)
#   - kubectl (scoop install kubectl)
#   - helm (scoop install helm)
#
# Usage:
#   $env:HCLOUD_TOKEN = "your-hetzner-api-token"
#   $env:RESEND_API_KEY = "re_..."  # Optional
#   .\quick-start-ip.ps1
#

param(
    [string]$Location = "fsn1",
    [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
$Namespace = "eutlas"

# Colors
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Blue }
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Header { 
    param($msg) 
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
}

# Validate prerequisites
function Test-Prerequisites {
    Write-Header "Validating Prerequisites"
    
    if (-not $env:HCLOUD_TOKEN) {
        Write-Host "[ERROR] HCLOUD_TOKEN is required" -ForegroundColor Red
        Write-Host 'Set it with: $env:HCLOUD_TOKEN = "your-token"'
        exit 1
    }
    
    $commands = @("hcloud", "kubectl", "helm")
    foreach ($cmd in $commands) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Write-Host "[ERROR] $cmd is not installed" -ForegroundColor Red
            Write-Host "Install with: scoop install $cmd"
            exit 1
        }
        Write-Info "Found: $cmd"
    }
    
    if (-not $env:RESEND_API_KEY) {
        Write-Warn "RESEND_API_KEY not set - email features will be disabled"
        $env:RESEND_API_KEY = "not-configured"
    }
    
    Write-Success "Prerequisites validated"
}

# Setup SSH key
function New-SshKey {
    Write-Header "Setting Up SSH Key"
    
    $keyExists = hcloud ssh-key list -o noheader | Select-String "eutlas-key"
    
    if (-not $keyExists) {
        $sshKeyPath = "$env:USERPROFILE\.ssh\eutlas_rsa"
        if (-not (Test-Path $sshKeyPath)) {
            ssh-keygen -t rsa -b 4096 -f $sshKeyPath -N '""' -C "eutlas"
        }
        hcloud ssh-key create --name eutlas-key --public-key-from-file "$sshKeyPath.pub"
        Write-Success "SSH key created"
    } else {
        Write-Info "SSH key already exists"
    }
}

# Create cluster
function New-Cluster {
    Write-Header "Creating Kubernetes Cluster"
    
    $existing = hcloud server list -o noheader | Select-String "eutlas-master"
    
    if ($existing) {
        Write-Info "Cluster already exists"
        $script:MasterIP = hcloud server ip eutlas-master
    } else {
        Write-Info "Creating master node..."
        hcloud server create `
            --name eutlas-master `
            --type cpx31 `
            --image ubuntu-22.04 `
            --location $Location `
            --ssh-key eutlas-key
        
        $script:MasterIP = hcloud server ip eutlas-master
        Write-Info "Master IP: $script:MasterIP"
        
        Write-Info "Waiting for server to boot (45 seconds)..."
        Start-Sleep -Seconds 45
        
        # Install K3s
        Write-Info "Installing K3s..."
        $sshKey = "$env:USERPROFILE\.ssh\eutlas_rsa"
        
        $installCmd = @"
curl -sfL https://get.k3s.io | sh -s - server --disable traefik --write-kubeconfig-mode 644
"@
        ssh -o StrictHostKeyChecking=no -i $sshKey root@$script:MasterIP $installCmd
        
        Write-Success "K3s installed"
        
        # Create worker
        Write-Info "Creating worker node..."
        hcloud server create `
            --name eutlas-worker-1 `
            --type cpx41 `
            --image ubuntu-22.04 `
            --location $Location `
            --ssh-key eutlas-key
        
        $workerIP = hcloud server ip eutlas-worker-1
        Start-Sleep -Seconds 30
        
        $token = ssh -o StrictHostKeyChecking=no -i $sshKey root@$script:MasterIP "cat /var/lib/rancher/k3s/server/node-token"
        
        $joinCmd = "curl -sfL https://get.k3s.io | K3S_URL=https://$($script:MasterIP):6443 K3S_TOKEN=$token sh -"
        ssh -o StrictHostKeyChecking=no -i $sshKey root@$workerIP $joinCmd
        
        Write-Success "Worker node added"
    }
    
    # Get kubeconfig
    Write-Info "Fetching kubeconfig..."
    $kubeDir = "$env:USERPROFILE\.kube"
    if (-not (Test-Path $kubeDir)) { New-Item -ItemType Directory -Path $kubeDir -Force | Out-Null }
    
    $sshKey = "$env:USERPROFILE\.ssh\eutlas_rsa"
    scp -o StrictHostKeyChecking=no -i $sshKey "root@$($script:MasterIP):/etc/rancher/k3s/k3s.yaml" "$kubeDir\eutlas-config"
    
    $content = Get-Content "$kubeDir\eutlas-config" -Raw
    $content = $content -replace "127.0.0.1", $script:MasterIP
    Set-Content "$kubeDir\eutlas-config" $content
    
    $env:KUBECONFIG = "$kubeDir\eutlas-config"
    
    Start-Sleep -Seconds 10
    kubectl get nodes
    Write-Success "Kubernetes cluster ready"
}

# Install infrastructure
function Install-Infrastructure {
    Write-Header "Installing Infrastructure"
    
    $env:KUBECONFIG = "$env:USERPROFILE\.kube\eutlas-config"
    
    # Ingress
    Write-Info "Installing ingress controller..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>$null
    helm repo update
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx `
        --namespace ingress-nginx --create-namespace `
        --set controller.service.type=NodePort `
        --set controller.service.nodePorts.http=30080 `
        --set controller.service.nodePorts.https=30443
    
    # MongoDB Operator
    Write-Info "Installing MongoDB operator..."
    kubectl apply -f "https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml"
    helm repo add mongodb https://mongodb.github.io/helm-charts 2>$null
    helm upgrade --install mongodb-operator mongodb/community-operator `
        --namespace mongodb-operator --create-namespace
    
    Write-Success "Infrastructure installed"
}

# Deploy EUTLAS
function Deploy-Eutlas {
    Write-Header "Deploying EUTLAS"
    
    $env:KUBECONFIG = "$env:USERPROFILE\.kube\eutlas-config"
    $appUrl = "http://$($script:MasterIP):30080"
    
    kubectl create namespace $Namespace --dry-run=client -o yaml | kubectl apply -f -
    
    # Generate secrets
    $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    $mongoPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object {[char]$_})
    
    Write-Info "Creating secrets..."
    kubectl create secret generic eutlas-secrets -n $Namespace `
        --from-literal=JWT_SECRET="$jwtSecret" `
        --from-literal=RESEND_API_KEY="$($env:RESEND_API_KEY)" `
        --from-literal=EMAIL_FROM="noreply@eutlas.local" `
        --from-literal=NODE_ENV="production" `
        --from-literal=FRONTEND_URL="$appUrl" `
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic eutlas-mongodb-password -n $Namespace `
        --from-literal=password="$mongoPassword" `
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy MongoDB
    Write-Info "Deploying MongoDB (2-3 minutes)..."
    $mongoYaml = @"
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: eutlas-mongodb
  namespace: $Namespace
spec:
  members: 1
  type: ReplicaSet
  version: "7.0.0"
  security:
    authentication:
      modes: ["SCRAM"]
  users:
    - name: eutlas-admin
      db: admin
      passwordSecretRef:
        name: eutlas-mongodb-password
      roles:
        - name: clusterAdmin
          db: admin
        - name: readWriteAnyDatabase
          db: admin
      scramCredentialsSecretName: eutlas-mongodb-scram
  statefulSet:
    spec:
      volumeClaimTemplates:
        - metadata:
            name: data-volume
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 10Gi
        - metadata:
            name: logs-volume
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 1Gi
"@
    $mongoYaml | kubectl apply -f -
    
    Write-Info "Waiting for MongoDB..."
    Start-Sleep -Seconds 120
    
    # Update MongoDB URI
    $mongoUri = "mongodb://eutlas-admin:$mongoPassword@eutlas-mongodb-0.eutlas-mongodb-svc.$Namespace.svc.cluster.local:27017/eutlas?authSource=admin&replicaSet=eutlas-mongodb"
    $encodedUri = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($mongoUri))
    kubectl patch secret eutlas-secrets -n $Namespace --type='json' -p="[{`"op`":`"add`",`"path`":`"/data/MONGODB_URI`",`"value`":`"$encodedUri`"}]"
    
    # Deploy Redis
    Write-Info "Deploying Redis..."
    helm repo add bitnami https://charts.bitnami.com/bitnami 2>$null
    helm upgrade --install eutlas-redis bitnami/redis `
        --namespace $Namespace `
        --set architecture=standalone `
        --set auth.enabled=false `
        --set master.persistence.size=1Gi
    
    # Deploy Backend
    Write-Info "Deploying backend..."
    $backendYaml = @"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-backend
  namespace: $Namespace
spec:
  replicas: 1
  selector:
    matchLabels:
      app: eutlas
      component: backend
  template:
    metadata:
      labels:
        app: eutlas
        component: backend
    spec:
      containers:
        - name: backend
          image: ghcr.io/stschuer/eutlas-backend:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 4000
          envFrom:
            - secretRef:
                name: eutlas-secrets
          env:
            - name: PORT
              value: "4000"
            - name: REDIS_URL
              value: "redis://eutlas-redis-master:6379"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: eutlas-backend
  namespace: $Namespace
spec:
  selector:
    app: eutlas
    component: backend
  ports:
    - port: 4000
"@
    $backendYaml | kubectl apply -f -
    
    # Deploy Frontend
    Write-Info "Deploying frontend..."
    $frontendYaml = @"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-frontend
  namespace: $Namespace
spec:
  replicas: 1
  selector:
    matchLabels:
      app: eutlas
      component: frontend
  template:
    metadata:
      labels:
        app: eutlas
        component: frontend
    spec:
      containers:
        - name: frontend
          image: ghcr.io/stschuer/eutlas-frontend:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_API_URL
              value: "$appUrl/api/v1"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: eutlas-frontend
  namespace: $Namespace
spec:
  selector:
    app: eutlas
    component: frontend
  ports:
    - port: 3000
"@
    $frontendYaml | kubectl apply -f -
    
    # Create Ingress
    Write-Info "Creating ingress..."
    $ingressYaml = @"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eutlas
  namespace: $Namespace
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: eutlas-backend
                port:
                  number: 4000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: eutlas-frontend
                port:
                  number: 3000
"@
    $ingressYaml | kubectl apply -f -
    
    Write-Success "EUTLAS deployed"
}

# Wait for pods
function Wait-ForReady {
    Write-Header "Waiting for Services"
    
    $env:KUBECONFIG = "$env:USERPROFILE\.kube\eutlas-config"
    
    Write-Info "Waiting for pods (2-3 minutes)..."
    Start-Sleep -Seconds 60
    
    kubectl get pods -n $Namespace
}

# Show summary
function Show-Summary {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "        EUTLAS DEPLOYMENT SUCCESSFUL" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Access EUTLAS:" -ForegroundColor Cyan
    Write-Host "  --> http://$($script:MasterIP):30080" -ForegroundColor Green
    Write-Host ""
    Write-Host "  API Health Check:" -ForegroundColor Cyan
    Write-Host "      Invoke-RestMethod http://$($script:MasterIP):30080/api/v1/health"
    Write-Host ""
    Write-Host "  Kubeconfig:" -ForegroundColor Cyan
    Write-Host "      `$env:KUBECONFIG = `"$env:USERPROFILE\.kube\eutlas-config`""
    Write-Host ""
    Write-Host "  View Pods:" -ForegroundColor Cyan
    Write-Host "      kubectl get pods -n eutlas"
    Write-Host ""
    Write-Host "  Note: First load may take 30-60 seconds." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
}

# Cleanup
function Remove-Cluster {
    $confirm = Read-Host "Delete all EUTLAS resources? (y/n)"
    if ($confirm -eq "y") {
        Write-Info "Cleaning up..."
        hcloud server delete eutlas-master --force 2>$null
        hcloud server delete eutlas-worker-1 --force 2>$null
        hcloud ssh-key delete eutlas-key 2>$null
        Remove-Item "$env:USERPROFILE\.kube\eutlas-config" -ErrorAction SilentlyContinue
        Write-Success "Cleanup complete"
    }
}

# Main
function Main {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "    EUTLAS Quick Start (IP-Based, No Domain)" -ForegroundColor Cyan
    Write-Host "    MongoDB Atlas Clone for EU Infrastructure" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    
    if ($Cleanup) {
        Remove-Cluster
    } else {
        Test-Prerequisites
        New-SshKey
        New-Cluster
        Install-Infrastructure
        Deploy-Eutlas
        Wait-ForReady
        Show-Summary
    }
}

Main

