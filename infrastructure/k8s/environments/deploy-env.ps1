# Deploy EUTLAS to a specific environment
# Usage: .\deploy-env.ps1 -Environment test|staging|production

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test", "staging", "production")]
    [string]$Environment
)

$ErrorActionPreference = "Stop"

# Set namespace based on environment
$Namespace = switch ($Environment) {
    "production" { "eutlas" }
    default { "eutlas-$Environment" }
}

Write-Host "🚀 Deploying EUTLAS to $Environment environment (namespace: $Namespace)" -ForegroundColor Cyan

# Create namespace if it doesn't exist
kubectl get namespace $Namespace 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating namespace $Namespace..." -ForegroundColor Yellow
    kubectl create namespace $Namespace
}

# Deploy MongoDB
Write-Host "📦 Deploying MongoDB..." -ForegroundColor Yellow
@"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongodb
  namespace: $Namespace
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
        - name: mongodb
          image: mongo:7.0
          ports:
            - containerPort: 27017
          env:
            - name: MONGO_INITDB_ROOT_USERNAME
              value: "eutlas-admin"
            - name: MONGO_INITDB_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: eutlas-mongodb-credentials
                  key: password
          volumeMounts:
            - name: mongodb-data
              mountPath: /data/db
          resources:
            limits:
              cpu: "1"
              memory: 2Gi
            requests:
              cpu: "500m"
              memory: 1Gi
      volumes:
        - name: mongodb-data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: $Namespace
spec:
  selector:
    app: mongodb
  ports:
    - port: 27017
      targetPort: 27017
"@ | kubectl apply -f -

# Deploy Redis
Write-Host "📦 Deploying Redis..." -ForegroundColor Yellow
@"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-redis
  namespace: $Namespace
spec:
  replicas: 1
  selector:
    matchLabels:
      app: eutlas-redis
  template:
    metadata:
      labels:
        app: eutlas-redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          resources:
            limits:
              cpu: "250m"
              memory: 256Mi
            requests:
              cpu: "100m"
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: eutlas-redis
  namespace: $Namespace
spec:
  selector:
    app: eutlas-redis
  ports:
    - port: 6379
      targetPort: 6379
"@ | kubectl apply -f -

# Deploy Backend
$ImageTag = switch ($Environment) {
    "production" { "latest" }
    default { $Environment }
}

$Replicas = switch ($Environment) {
    "production" { 2 }
    default { 1 }
}

Write-Host "📦 Deploying Backend (tag: $ImageTag, replicas: $Replicas)..." -ForegroundColor Yellow
@"
apiVersion: v1
kind: ServiceAccount
metadata:
  name: eutlas-backend
  namespace: $Namespace
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: eutlas-backend-$Environment
subjects:
  - kind: ServiceAccount
    name: eutlas-backend
    namespace: $Namespace
roleRef:
  kind: ClusterRole
  name: eutlas-backend-role
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-backend
  namespace: $Namespace
spec:
  replicas: $Replicas
  selector:
    matchLabels:
      app: eutlas-backend
  template:
    metadata:
      labels:
        app: eutlas-backend
    spec:
      serviceAccountName: eutlas-backend
      containers:
        - name: backend
          image: ghcr.io/stschuer/eutlas-backend:$ImageTag
          imagePullPolicy: Always
          ports:
            - containerPort: 4000
          env:
            - name: NODE_ENV
              value: "$Environment"
            - name: PORT
              value: "4000"
            - name: REDIS_URL
              value: "redis://eutlas-redis:6379"
          envFrom:
            - secretRef:
                name: eutlas-secrets
          resources:
            limits:
              cpu: "500m"
              memory: 512Mi
            requests:
              cpu: "250m"
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: eutlas-backend
  namespace: $Namespace
spec:
  selector:
    app: eutlas-backend
  ports:
    - port: 4000
      targetPort: 4000
"@ | kubectl apply -f -

# Deploy Frontend
Write-Host "📦 Deploying Frontend..." -ForegroundColor Yellow
@"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eutlas-frontend
  namespace: $Namespace
spec:
  replicas: $Replicas
  selector:
    matchLabels:
      app: eutlas-frontend
  template:
    metadata:
      labels:
        app: eutlas-frontend
    spec:
      containers:
        - name: frontend
          image: ghcr.io/stschuer/eutlas-frontend:$ImageTag
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "$Environment"
          resources:
            limits:
              cpu: "250m"
              memory: 256Mi
            requests:
              cpu: "100m"
              memory: 128Mi
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: eutlas-frontend
  namespace: $Namespace
spec:
  selector:
    app: eutlas-frontend
  ports:
    - port: 3000
      targetPort: 3000
"@ | kubectl apply -f -

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Access URLs:" -ForegroundColor Cyan

$Host = switch ($Environment) {
    "production" { "eutlas.46.224.42.63.nip.io" }
    "staging" { "staging.46.224.42.63.nip.io" }
    "test" { "test.46.224.42.63.nip.io" }
}

Write-Host "   HTTPS: https://$Host" -ForegroundColor White
Write-Host ""
Write-Host "📋 Check status:" -ForegroundColor Cyan
Write-Host "   kubectl get pods -n $Namespace" -ForegroundColor White



