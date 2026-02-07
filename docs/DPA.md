# Data Processing Agreement (DPA)
# Auftragsverarbeitungsvertrag (AVV)

**Between:**
- **Data Controller:** The Customer ("Verantwortlicher")
- **Data Processor:** EUTLAS GmbH ("Auftragsverarbeiter"), registered in Germany

**Effective Date:** Upon signing / accepting Terms of Service

---

## Article 1 – Subject Matter and Duration

This DPA governs the processing of personal data by EUTLAS on behalf of the Customer in connection with the EUTLAS Managed MongoDB Service, pursuant to Article 28 GDPR (DSGVO).

The duration corresponds to the Customer's active service subscription.

## Article 2 – Nature and Purpose of Processing

| Aspect | Description |
|--------|-------------|
| **Nature** | Storage, backup, replication, and retrieval of MongoDB databases |
| **Purpose** | Providing managed database infrastructure for the Customer's applications |
| **Categories of data** | Any personal data the Customer stores in their MongoDB databases |
| **Data subjects** | Determined by the Customer (may include end-users, employees, customers) |

## Article 3 – Obligations of the Processor

EUTLAS shall:

1. Process personal data only on documented instructions from the Controller (Art. 28(3)(a) GDPR)
2. Ensure persons authorized to process data have committed to confidentiality (Art. 28(3)(b))
3. Implement appropriate technical and organizational measures (Art. 32) — see **Anlage 1: TOM**
4. Assist the Controller with data subject requests (Art. 28(3)(e))
5. Assist with DPIA obligations (Art. 28(3)(f))
6. Delete or return all personal data upon termination (Art. 28(3)(g))
7. Make available all information necessary to demonstrate compliance (Art. 28(3)(h))
8. Immediately inform the Controller if an instruction infringes GDPR

## Article 4 – Sub-processors

Current sub-processors:

| Sub-processor | Purpose | Location |
|---------------|---------|----------|
| Hetzner Online GmbH | Cloud infrastructure (compute, storage, networking) | Germany (Falkenstein, Nuremberg) |
| Stripe, Inc. | Payment processing (billing data only) | EU (Dublin) with SCCs |

Changes to sub-processors will be communicated 30 days in advance. The Controller may object within 14 days.

## Article 5 – Data Transfers

All database data is processed exclusively within the **European Union** (Germany).

- **Primary DC:** Hetzner Falkenstein (FSN1), Germany
- **Secondary DC:** Hetzner Nuremberg (NBG1), Germany
- **No data transfers to third countries** for database content
- Payment data processed by Stripe under EU-US Data Privacy Framework / SCCs

## Article 6 – Data Breach Notification

EUTLAS shall notify the Controller **without undue delay** (within 72 hours) of any personal data breach, providing:

1. Description of the breach
2. Categories and approximate number of data subjects affected
3. Likely consequences
4. Measures taken or proposed to address the breach

## Article 7 – Audit Rights

The Controller has the right to conduct audits (Art. 28(3)(h)):

- **Self-service:** Access to compliance dashboard, audit logs, and SOC-style reports
- **On-site audit:** With 30 days written notice, during business hours, max once per year
- **Third-party audit:** Accepted certifications: ISO 27001, SOC 2 Type II

## Article 8 – Termination

Upon termination:
1. EUTLAS provides data export (mongodump) for 30 days
2. After 30 days, all data is permanently deleted
3. Backups are purged per retention policy (max 365 days)
4. Confirmation of deletion provided in writing

---

# Anlage 1 – Technische und Organisatorische Maßnahmen (TOM)
# Appendix 1 – Technical and Organizational Measures

## 1. Access Control (Zutrittskontrolle)
- Hetzner data centers: ISO 27001 certified, biometric access, 24/7 security
- No physical access by EUTLAS personnel to data center hardware

## 2. System Access Control (Zugangskontrolle)
- SSH key-based access only (no password auth)
- Multi-factor authentication for all administrative access
- Kubernetes RBAC with principle of least privilege
- API key authentication with per-key scoping

## 3. Data Access Control (Zugriffskontrolle)
- Per-database user authentication (SCRAM-SHA-256)
- Role-based access control (11 MongoDB built-in roles)
- Database-level user scoping
- Audit logging of all administrative actions (2-year retention)

## 4. Transfer Control (Weitergabekontrolle)
- TLS 1.2+ for all data in transit (configurable minimum version)
- Let's Encrypt certificates with automatic renewal
- VPC/private network isolation available
- IP whitelisting with CIDR validation

## 5. Input Control (Eingabekontrolle)
- Comprehensive audit logging (26 action types, 14 resource types)
- Change diff tracking (previous state vs. new state)
- Audit log export (JSON/CSV)
- Immutable event log

## 6. Availability Control (Verfügbarkeitskontrolle)
- 3-node replica sets (MEDIUM+ plans) for high availability
- Automated backups with configurable retention (1–365 days)
- Point-in-Time Recovery (PITR) with up to 35-day retention
- Cross-region backup copies available
- Kubernetes auto-healing and pod restart policies

## 7. Separation Control (Trennungskontrolle)
- Tenant isolation via separate Kubernetes namespaces
- Dedicated MongoDB clusters per customer
- Network policies enforce inter-cluster isolation
- Separate backup storage per cluster

## 8. Encryption
- **At rest:** WiredTiger encrypted storage engine (AES-256)
- **In transit:** TLS 1.2+ with modern cipher suites
- **Backups:** AES-256 encrypted, optional BYOK (Bring Your Own Key)
- **Secrets:** Kubernetes Secrets with at-rest encryption

## 9. Incident Response
- 24/7 automated monitoring with alerting
- Incident response team with defined escalation procedures
- Post-incident reports within 5 business days
- Annual penetration testing
