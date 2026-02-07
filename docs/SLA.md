# EUTLAS Service Level Agreement (SLA)

**Effective Date:** February 2026  
**Version:** 1.0

## 1. Service Availability Commitment

| Plan Tier | Monthly Uptime SLA | Max Permitted Downtime/Month |
|-----------|-------------------|------------------------------|
| DEV / SMALL | 99.5% | ~3h 39min |
| MEDIUM / LARGE / XLARGE | 99.9% | ~43min |
| XXL / XXXL (Enterprise) | 99.95% | ~21min |
| DEDICATED_L / DEDICATED_XL | 99.99% | ~4min |

### Uptime Calculation

Monthly Uptime % = ((Total Minutes − Downtime Minutes) / Total Minutes) × 100

**Excluded from downtime calculations:**
- Scheduled maintenance windows (communicated ≥72h in advance)
- Customer-initiated operations (resize, pause, restore)
- Force majeure events
- Customer network issues

## 2. Service Credits

If EUTLAS fails to meet the SLA, affected customers receive service credits:

| Uptime Achieved | Service Credit (% of monthly fee) |
|-----------------|-----------------------------------|
| < SLA but ≥ 99.0% | 10% |
| < 99.0% but ≥ 95.0% | 25% |
| < 95.0% | 50% |

Credits must be requested within 30 days. Maximum credit per month: 50% of monthly fee.

## 3. Response Times

| Severity | Description | Response Time (Business Hours) | Response Time (Dedicated Support) |
|----------|-------------|-------------------------------|----------------------------------|
| Critical (P1) | Cluster unavailable, data loss risk | 4 hours | 30 minutes (24/7) |
| High (P2) | Significant performance degradation | 8 hours | 2 hours (24/7) |
| Medium (P3) | Non-critical feature issue | 24 hours | 8 hours |
| Low (P4) | General inquiry, feature request | 72 hours | 24 hours |

## 4. Backup & Recovery Guarantees

- **Automated backups:** Retained per policy (7–365 days)
- **Point-in-Time Recovery:** Available on MEDIUM+ plans with ≤1 minute granularity
- **Recovery Time Objective (RTO):** ≤4 hours for full cluster restore
- **Recovery Point Objective (RPO):** ≤10 seconds with PITR enabled, ≤24 hours with daily backups

## 5. Data Durability

- **Storage:** 3× replication on MEDIUM+ plans (replica set)
- **Backups:** Encrypted and stored on independent storage volumes
- **Durability target:** 99.999999999% (11 nines) for backup data

## 6. Monitoring & Status

- **Status page:** https://status.eutlas.eu
- **Monitoring:** 30-second metric collection intervals
- **Alerting:** Real-time alerts via email, webhook, Slack, PagerDuty

## 7. Maintenance Windows

- Scheduled maintenance: Weekly, during low-traffic hours (configurable per cluster)
- Emergency maintenance: Communicated immediately via status page and email
- MongoDB version updates: Rolling upgrades with zero downtime on replica set plans

## 8. Contact

- **Support:** support@eutlas.eu
- **Emergency:** +49 (0) xxx-xxxxxxx (Dedicated Support customers)
- **Status:** https://status.eutlas.eu
