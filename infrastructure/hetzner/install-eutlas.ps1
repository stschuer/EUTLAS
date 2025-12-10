#
# EUTLAS Application Installation Script (Windows PowerShell)
# Run this after Rancher clusters are created
#
# Usage:
#   .\install-eutlas.ps1 -Environment production
#

param(
    [ValidateSet("production", "staging", "both")]
    [string]$Environment = "production",
    [string]$Domain = "eutlas.eu",
    [string]$Namespace = "eutlas"
)

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Blue }
function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }

# Check kubectl context
function Test-Context {
    $context = kubectl config current-context
    Write-Info "Current kubectl context: $context"
    
    $response = Read-Host "Is this the correct cluster? (y/n)"
    if ($response -ne "y") {
        Write-Host "Please switch to the correct context:"
        Write-Host "  kubectl config use-context <context-name>"
        exit 1
    }
}

# Install cert-manager
function Install-CertManager {
    Write-Info "Installing cert-manager..."
    
    $existing = kubectl get namespace cert-manager 2>$null
    if ($existing) {
        Write-Info "cert-manager already installed"
        return
    }
    
    kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml"
    
    Write-Info "Waiting for cert-manager..."
    Start-Sleep -Seconds 30
    
    # Create ClusterIssuer
    $issuerYaml = @"
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@$Domain
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
"@
    $issuerYaml | kubectl apply -f -
    
    Write-Success "cert-manager installed"
}

# Install NGINX Ingress
function Install-IngressController {
    Write-Info "Installing NGINX Ingress Controller..."
    
    $existing = kubectl get namespace ingress-nginx 2>$null
    if ($existing) {
        Write-Info "Ingress controller already installed"
        return
    }
    
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    
    helm install ingress-nginx ingress-nginx/ingress-nginx `
        --namespace ingress-nginx `
        --create-namespace `
        --set controller.service.type=LoadBalancer
    
    Write-Info "Waiting for Load Balancer IP..."
    Start-Sleep -Seconds 30
    
    $lbIP = kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
    Write-Success "Ingress installed. Load Balancer IP: $lbIP"
    Write-Host "Point DNS to: $lbIP"
}

# Install MongoDB Operator
function Install-MongoDBOperator {
    Write-Info "Installing MongoDB Community Operator..."
    
    $existing = kubectl get crd mongodbcommunity.mongodbcommunity.mongodb.com 2>$null
    if ($existing) {
        Write-Info "MongoDB Operator already installed"
        return
    }
    
    kubectl apply -f "https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml"
    
    helm repo add mongodb https://mongodb.github.io/helm-charts
    helm repo update
    
    helm install mongodb-operator mongodb/community-operator `
        --namespace mongodb-operator `
        --create-namespace
    
    Write-Success "MongoDB Operator installed"
}

# Create namespace and secrets
function New-EutlasSecrets {
    Write-Info "Creating EUTLAS namespace and secrets..."
    
    kubectl create namespace $Namespace --dry-run=client -o yaml | kubectl apply -f -
    
    $existing = kubectl get secret eutlas-secrets -n $Namespace 2>$null
    if ($existing) {
        Write-Info "Secrets already exist"
        return
    }
    
    # Generate JWT secret
    $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    
    $mongoUri = Read-Host "Enter MongoDB connection string (or press Enter for managed)"
    if (-not $mongoUri) {
        $mongoUri = "mongodb://eutlas-mongodb-svc:27017/eutlas"
    }
    
    $resendKey = Read-Host "Enter Resend API Key"
    $emailDomain = Read-Host "Enter your email domain (e.g., eutlas.eu)"
    
    kubectl create secret generic eutlas-secrets `
        --namespace $Namespace `
        --from-literal=MONGODB_URI="$mongoUri" `
        --from-literal=JWT_SECRET="$jwtSecret" `
        --from-literal=RESEND_API_KEY="$resendKey" `
        --from-literal=EMAIL_FROM="noreply@$emailDomain" `
        --from-literal=NODE_ENV="production"
    
    Write-Success "Secrets created"
}

# Deploy EUTLAS
function Deploy-Eutlas {
    param(
        [string]$Env = "production",
        [string]$Host = "app.$Domain",
        [int]$Replicas = 2
    )
    
    Write-Info "Deploying EUTLAS ($Env)..."
    
    # Backend
    $backendYaml = @"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-backend
  namespace: $Namespace
spec:
  replicas: $Replicas
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
          ports:
            - containerPort: 4000
          envFrom:
            - secretRef:
                name: eutlas-secrets
          env:
            - name: PORT
              value: "4000"
            - name: FRONTEND_URL
              value: "https://$Host"
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
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
    
    # Frontend
    $frontendYaml = @"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-frontend
  namespace: $Namespace
spec:
  replicas: $Replicas
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
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_API_URL
              value: "https://$Host/api/v1"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
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
    
    # Ingress
    $ingressYaml = @"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eutlas
  namespace: $Namespace
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - $Host
      secretName: eutlas-tls
  rules:
    - host: $Host
      http:
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
    
    Write-Success "EUTLAS deployed!"
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "Deployment Complete!"
    Write-Host "=============================================="
    Write-Host "URL: https://$Host"
    Write-Host ""
    Write-Host "Check status:"
    Write-Host "  kubectl get pods -n $Namespace"
    Write-Host "  kubectl get ingress -n $Namespace"
    Write-Host "=============================================="
}

# Main
function Main {
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "    EUTLAS Application Installation"
    Write-Host "=============================================="
    Write-Host ""
    
    Test-Context
    
    Install-CertManager
    Install-IngressController
    Install-MongoDBOperator
    New-EutlasSecrets
    
    switch ($Environment) {
        "production" {
            Deploy-Eutlas -Env "production" -Host "app.$Domain" -Replicas 3
        }
        "staging" {
            Deploy-Eutlas -Env "staging" -Host "staging.$Domain" -Replicas 1
        }
        "both" {
            Deploy-Eutlas -Env "production" -Host "app.$Domain" -Replicas 3
            Deploy-Eutlas -Env "staging" -Host "staging.$Domain" -Replicas 1
        }
    }
    
    Write-Success "Installation complete!"
}

Main

