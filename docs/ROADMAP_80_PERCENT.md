# EUTLAS Roadmap - 80% MongoDB Atlas Feature Parity

## 🎉 ALL PHASES COMPLETE! ~80% Feature Parity Achieved! 🎉

---

## ✅ Phase 0: Foundation (COMPLETED)
Was wir bereits haben:
- [x] User Authentication (Signup, Login, JWT)
- [x] Organizations CRUD
- [x] Projects CRUD
- [x] Cluster Lifecycle (Create, Resize, Delete)
- [x] Async Job System
- [x] Credentials Management (encrypted)
- [x] Event System (Audit Log)
- [x] Basic Dashboard UI

---

## ✅ Phase 1: Core Database Features (COMPLETED)
**Priorität: KRITISCH** - Ohne diese ist die Plattform nicht nutzbar

### 1.1 Database Users Management
```
Backend:
- POST   /clusters/:clusterId/users          - Create DB user
- GET    /clusters/:clusterId/users          - List DB users
- PATCH  /clusters/:clusterId/users/:userId  - Update user
- DELETE /clusters/:clusterId/users/:userId  - Delete user

Schema:
- username, passwordHash, roles[], databases[], createdAt

Features:
- Vordefinierte Rollen (readWrite, readOnly, dbAdmin, etc.)
- Scoped zu spezifischen Databases
- Integration mit MongoDB Operator
```

### 1.2 Network Access / IP Whitelist
```
Backend:
- POST   /clusters/:clusterId/network/whitelist
- GET    /clusters/:clusterId/network/whitelist
- DELETE /clusters/:clusterId/network/whitelist/:entryId

Schema:
- cidrBlock, comment, temporary, expiresAt

Features:
- CIDR Notation Support
- "Allow from anywhere" Option (0.0.0.0/0)
- Temporary Access mit Ablaufzeit
- Integration mit K8s NetworkPolicies
```

### 1.3 Connection String Builder
```
Frontend:
- Sprach-spezifische Connection Strings (Node.js, Python, Go, etc.)
- Copy-to-Clipboard
- SRV vs Standard Format
- SSL/TLS Optionen anzeigen
```

### 1.4 Cluster Pause/Resume
```
Backend:
- POST /clusters/:clusterId/pause
- POST /clusters/:clusterId/resume

Features:
- Cluster stoppen um Kosten zu sparen
- Automatischer Resume nach X Tagen Warning
- Daten bleiben erhalten
```

---

## ✅ Phase 2: Backup & Monitoring (COMPLETED)
**Priorität: HOCH** - Essentiell für Production Workloads

### 2.1 Backup Management
```
Backend:
- GET    /clusters/:clusterId/backups           - List backups
- POST   /clusters/:clusterId/backups           - Create manual backup
- POST   /clusters/:clusterId/backups/:id/restore - Restore backup
- DELETE /clusters/:clusterId/backups/:id       - Delete backup

Schema:
- type (scheduled/manual), status, sizeBytes, storagePath
- retentionDays, pointInTimeEnabled

Features:
- Automatische tägliche Backups
- Manuelle Snapshots
- Point-in-Time Recovery (für höhere Pläne)
- Retention Policy (7/14/30 Tage)
- Restore zu neuem Cluster
```

### 2.2 Metrics & Monitoring
```
Backend:
- GET /clusters/:clusterId/metrics?period=1h|24h|7d|30d

Metriken:
- CPU Usage (%)
- Memory Usage (%)
- Storage Used/Available
- Connections (current/available)
- Operations/sec (insert, query, update, delete)
- Network I/O
- Replication Lag

Implementation:
- Prometheus + MongoDB Exporter im K8s
- Metrics in TimeSeries DB speichern
- Aggregation für verschiedene Zeiträume
```

### 2.3 Metrics Dashboard UI
```
Frontend:
- Echtzeit-Graphen (recharts/chart.js)
- Zeitraum-Selector
- Auto-Refresh (10s/30s/1m)
- Threshold-Indikatoren (Warning/Critical)
```

---

## ✅ Phase 3: Team & Access Management (COMPLETED)
**Priorität: MITTEL** - Wichtig für Teams

### 3.1 Team Invitations
```
Backend:
- POST   /orgs/:orgId/invitations        - Invite user
- GET    /orgs/:orgId/invitations        - List pending
- DELETE /orgs/:orgId/invitations/:id    - Revoke
- POST   /invitations/:token/accept      - Accept invite

Features:
- Email-Einladungen
- Rollen bei Einladung festlegen
- Einladungs-Ablauf (7 Tage)
```

### 3.2 Role-Based Access Control (RBAC)
```
Rollen-Hierarchie:
- Organization Owner  → Voller Zugriff
- Organization Admin  → Alles außer Billing & Owner-Transfer
- Project Owner       → Voller Projekt-Zugriff
- Project Admin       → Cluster-Management
- Project Member      → Read + Connect
- Project ReadOnly    → Nur Lesen

Features:
- Rollen pro Org UND pro Project
- Vererbung von Org → Project
```

### 3.3 API Keys
```
Backend:
- POST   /orgs/:orgId/apikeys
- GET    /orgs/:orgId/apikeys
- DELETE /orgs/:orgId/apikeys/:keyId

Features:
- Public/Private Key Pair
- Scoped Permissions
- IP Whitelist für API Keys
- Ablaufdatum optional
```

---

## ✅ Phase 4: Alerts & Notifications (COMPLETED)
**Priorität: MITTEL**

### 4.1 Alert Rules
```
Backend:
- CRUD für Alert Rules
- Supported Metrics:
  - CPU > X%
  - Memory > X%
  - Storage > X%
  - Connections > X
  - Replication Lag > Xs
  - Cluster State Change

Schema:
- metric, operator, threshold, duration
- notificationChannels[], enabled
```

### 4.2 Notification Channels
```
Channels:
- Email (SMTP)
- Slack Webhook
- PagerDuty
- Microsoft Teams
- Generic Webhook

Backend:
- POST /orgs/:orgId/notifications/channels
- Test-Notification senden
```

### 4.3 Alert History
```
- Wann wurde Alert ausgelöst
- Wann resolved
- Wer hat acknowledged
```

---

## ✅ Phase 5: Data Explorer (COMPLETED)
**Priorität: NICE-TO-HAVE** - Aber großer UX-Gewinn

### 5.1 Collections Browser
```
Backend Proxy:
- GET  /clusters/:clusterId/databases
- GET  /clusters/:clusterId/databases/:db/collections
- GET  /clusters/:clusterId/databases/:db/collections/:coll/documents
- POST /clusters/:clusterId/databases/:db/collections/:coll/query

Features:
- Databases auflisten
- Collections auflisten
- Documents browsen (mit Pagination)
- Simple Query Builder
```

### 5.2 Document Editor
```
Frontend:
- JSON Tree View
- Inline Editing
- Insert/Update/Delete Documents
- Index Management View
```

---

## 📊 Feature Coverage Summary

| Category | Atlas Features | EUTLAS (Current) | Nach Roadmap |
|----------|---------------|------------------|--------------|
| Auth & Users | 100% | 70% | 95% |
| Clusters | 100% | 60% | 90% |
| Database Users | 100% | 0% | 90% |
| Network | 100% | 0% | 80% |
| Backups | 100% | 10% | 85% |
| Monitoring | 100% | 0% | 75% |
| Team Management | 100% | 30% | 85% |
| Alerts | 100% | 0% | 80% |
| Data Explorer | 100% | 0% | 70% |
| **TOTAL** | **100%** | **~25%** | **~80%** |

---

## 🛠️ Technische Voraussetzungen

### Backend Erweiterungen
```
Neue Dependencies:
- @kubernetes/client-node  ✅ (bereits da)
- prom-client             → Prometheus Metrics
- nodemailer              ✅ (bereits da)
- ioredis                 → Caching & Rate Limiting

Neue Services:
- MetricsService          → Prometheus Integration
- AlertService            → Alert Evaluation
- NotificationService     → Multi-Channel Notifications
- BackupService           → Backup Orchestration
```

### Infrastructure
```
Kubernetes:
- MongoDB Community Operator ✅
- Prometheus Operator
- Grafana (optional, für internes Monitoring)
- Velero (Backup zu S3/MinIO)

Storage:
- MinIO oder S3-Compatible für Backups
- PersistentVolumes für MongoDB Data
```

### Frontend Erweiterungen
```
Neue Libraries:
- recharts oder @nivo/core  → Charts
- @tanstack/react-table     → Data Tables
- monaco-editor             → JSON Editor (Data Explorer)
- react-json-view           → Document Viewer
```

---

## 📅 Zeitplan (Realistisch)

| Phase | Dauer | Aufwand |
|-------|-------|---------|
| Phase 1: Core DB Features | 2-3 Wochen | Hoch |
| Phase 2: Backup & Monitoring | 2-3 Wochen | Hoch |
| Phase 3: Team Management | 1-2 Wochen | Mittel |
| Phase 4: Alerts | 1 Woche | Mittel |
| Phase 5: Data Explorer | 2 Wochen | Mittel |
| **TOTAL** | **8-11 Wochen** | |

---

## 🚀 Empfohlene Reihenfolge

### Sprint 1-2: "Production Ready"
1. Database Users Management
2. Network Access / IP Whitelist
3. Cluster Pause/Resume
4. Connection String Builder UI

### Sprint 3-4: "Enterprise Basics"
5. Backup System (Scheduled + Manual)
6. Restore Functionality
7. Basic Metrics Collection

### Sprint 5-6: "Team Scale"
8. Metrics Dashboard
9. Team Invitations
10. RBAC Verbesserungen

### Sprint 7-8: "Operational Excellence"
11. Alert Rules
12. Notification Channels
13. Alert History

### Sprint 9-10: "Developer Experience"
14. Data Explorer
15. Document Editor
16. Query Builder

---

## 💡 Quick Wins (Sofort umsetzbar)

Diese Features sind einfach zu implementieren und bringen sofort Mehrwert:

1. **Connection String Builder** (Frontend only)
2. **Cluster Pause/Resume** (Backend + Frontend)
3. **Team Invitations** (Backend + Email)
4. **Manual Backup Trigger** (Backend + Job)

---

## 🎯 MVP für 80%

Für **echte 80% Feature Parity** sind diese MUST-HAVE:

1. ✅ Cluster CRUD
2. ⬜ Database Users
3. ⬜ IP Whitelist
4. ⬜ Backups (zumindest manual)
5. ⬜ Basic Metrics (CPU, Memory, Storage)
6. ⬜ Team Invitations
7. ✅ Event/Audit Log

Mit diesen Features wäre EUTLAS für **Production Workloads nutzbar**.

