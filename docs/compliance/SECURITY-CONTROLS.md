# GapMiner Security Controls

**Document Version:** 1.0
**Effective Date:** July 2026
**Owner:** Engineering / Security

---

## 1. Access Controls

### 1.1 Authentication

| Control | Implementation | Location |
|---------|----------------|----------|
| JWT authentication | Bearer token with 24h expiry | `server/src/middleware/auth.ts:30` |
| Refresh tokens | 30-day rotating refresh tokens | `auth.ts:183` |
| Password hashing | bcrypt with 12 rounds | `server/src/config.ts:60` |
| API key authentication | SHA-256 hashed, prefixed `gm_` | `middleware/api-auth.ts:30` |
| Rate limiting (auth) | 20 attempts per 15 minutes | `server/src/index.ts:86` |

### 1.2 Authorization

| Control | Implementation | Location |
|---------|----------------|----------|
| Role-based access | user, admin, moderator | `auth.ts:75` |
| Tier-based feature gating | free, pro, team, enterprise | `auth.ts:94` |
| Organization roles | owner, admin, editor, viewer | `enterprise-controls.ts:55` |
| API key permissions | Granular resource-level | `api-keys.ts:43` |
| Usage quotas | Per-tier monthly limits | `auth.ts:117` |

### 1.3 API Key Lifecycle

| Stage | Implementation | Location |
|-------|----------------|----------|
| Generation | 32-byte random, `gm_` prefix | `api-keys.ts:70` |
| Storage | SHA-256 hash only, never plaintext | `api-keys.ts:79` |
| Validation | Prefix lookup + hash verification | `api-auth.ts:43` |
| Rotation | Configurable (default 90 days) | `enterprise-controls.ts:20` |
| Revocation | Soft delete (`is_active = false`) | `api-keys.ts:159` |
| Expiry | Auto-revoke on expiration | `api-auth.ts:62` |

---

## 2. Encryption

### 2.1 In Transit

| Control | Implementation |
|---------|----------------|
| TLS version | TLS 1.2+ enforced |
| Certificate | Managed by cloud provider / reverse proxy |
| HSTS | Enabled via Helmet (`index.ts:60`) |
| Secure cookies | `credentials: true` in CORS (`index.ts:66`) |

### 2.2 At Rest

| Control | Implementation |
|---------|----------------|
| Database encryption | PostgreSQL pgcrypto extension (`schema.sql:8`) |
| Password storage | bcrypt hash (irreversible) |
| API key storage | SHA-256 hash (irreversible) |
| JWT secrets | Environment variable, 32+ chars minimum |
| Cloud storage | Provider-managed encryption (AES-256) |

---

## 3. Network Security

### 3.1 Perimeter Controls

| Control | Implementation | Location |
|---------|----------------|----------|
| Security headers | Helmet.js with defaults | `index.ts:60` |
| CORS policy | Origin-restricted, credential-enabled | `index.ts:65` |
| Request body limit | 5MB maximum | `index.ts:73` |
| Cross-origin policy | `cross-origin` resource policy | `index.ts:61` |

### 3.2 Rate Limiting

| Scope | Window | Limit | Location |
|-------|--------|-------|----------|
| Global API | 15 min | 100 requests | `index.ts:76` |
| Auth endpoints | 15 min | 20 attempts | `index.ts:86` |
| API keys | 1 min | Per-key limit | `api-auth.ts:124` |

### 3.3 DDoS Protection

| Control | Status |
|---------|--------|
| Cloud-native DDoS mitigation | ✅ Via AWS/GCP |
| Rate limiting | ✅ Application-level |
| Connection limits | ⚠️ Planned: Configure at load balancer |

---

## 4. Monitoring & Logging

### 4.1 Application Monitoring

| Control | Implementation | Location |
|---------|----------------|----------|
| Error tracking | Sentry (production only) | `index.ts:14` |
| Performance tracing | Sentry traces (10% sample) | `index.ts:21` |
| Health endpoint | `/api/health` with DB status | `index.ts:137` |
| Request logging | Dev-only console logging | `index.ts:96` |

### 4.2 Audit Logging

| Control | Implementation | Location |
|---------|----------------|----------|
| Audit trail | 26+ action types | `src/lib/audit-trail.ts:21` |
| Audit fields | User, timestamp, IP, UA, target, metadata | `audit-trail.ts:53` |
| Audit storage | Firestore `auditLogs` collection | `audit-trail.ts:70` |
| Audit queries | By org, user, action, date range | `audit-trail.ts:108` |

### 4.3 API Usage Tracking

| Control | Implementation | Location |
|---------|----------------|----------|
| Usage logging | Per-request endpoint, method, status | `api-auth.ts:141` |
| Token tracking | LLM input/output tokens | `schema.sql:533` |
| Cost tracking | Per-call cost calculation | `monitoring.ts:245` |
| Usage quotas | Monthly per-user limits | `auth.ts:117` |

### 4.4 LLM Observability

| Control | Implementation | Location |
|---------|----------------|----------|
| Model tracking | Per-call model name | `monitoring.ts:253` |
| Latency tracking | Response time in ms | `monitoring.ts:257` |
| Error capture | Failed calls logged | `monitoring.ts:261` |
| Cost attribution | Per-user cost tracking | `schema.sql:542` |

---

## 5. Incident Response

### 5.1 Detection

| Source | Implementation |
|--------|----------------|
| Sentry alerts | Error rate spikes, new error types |
| Audit log anomalies | Unusual access patterns |
| Rate limit triggers | Brute-force detection |
| Health check failures | Service degradation |

### 5.2 Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Data breach, service outage | Immediate |
| High | Security vulnerability, data loss | 4 hours |
| Medium | Functional defect, performance issue | 24 hours |
| Low | Minor issue, enhancement request | 72 hours |

### 5.3 Response Procedure

1. **Detect** — Automated monitoring identifies anomaly
2. **Triage** — On-call engineer assesses severity
3. **Contain** — Isolate affected systems, revoke compromised credentials
4. **Eradicate** — Fix root cause, patch vulnerabilities
5. **Recover** — Restore service, verify integrity
6. **Notify** — Inform affected parties per DPA requirements
7. **Review** — Post-incident review, update controls

### 5.4 Evidence Preservation

| Evidence Type | Retention |
|---------------|-----------|
| Audit logs | 365 days |
| Error logs | 90 days |
| API usage logs | 90 days |
| Sentry events | 90 days |
| Database backups | 30 days |

---

## 6. Vulnerability Management

### 6.1 Current State

| Control | Status |
|---------|--------|
| Dependency scanning | ⚠️ Planned: Integrate Snyk/Dependabot |
| Static analysis | ⚠️ Planned: Add ESLint security rules |
| Penetration testing | ⚠️ Planned: Annual third-party test |
| Code review | ⚠️ Planned: Require PR reviews for all changes |

### 6.2 Planned Controls

| Control | Target Date | Owner |
|---------|-------------|-------|
| Snyk integration | Q3 2026 | Engineering |
| ESLint security rules | Q3 2026 | Engineering |
| Dependabot alerts | Q3 2026 | Engineering |
| Annual pen test | Q4 2026 | Security |
| Bug bounty program | 2027 | Security |

---

## 7. Data Protection

### 7.1 Data Classification

| Level | Examples | Controls |
|-------|----------|----------|
| **Public** | Published papers, public gaps | No restrictions |
| **Internal** | User profiles, team settings | Authentication required |
| **Confidential** | Account data, email, content | Encryption, access logging |
| **Restricted** | Payment data, passwords | Minimal storage, encryption |

### 7.2 DLP Controls

| Control | Implementation | Location |
|---------|----------------|----------|
| PII detection | SSN, credit card, email patterns | `enterprise-controls.ts:265` |
| Content filtering | Configurable regex/keyword filters | `enterprise-controls.ts:43` |
| Filter actions | Block, warn, or redact | `enterprise-controls.ts:52` |
| Org-level configuration | Per-organization DLP settings | `enterprise-controls.ts:14` |

### 7.3 Backup & Recovery

| Control | Status |
|---------|--------|
| Database backups | ⚠️ Planned: Daily automated backups |
| Backup encryption | ⚠️ Planned: Encrypted at rest |
| Recovery testing | ⚠️ Planned: Quarterly restore tests |
| RTO/RPO targets | ⚠️ Planned: Define and document |

---

## 8. Change Management

### 8.1 Current State

| Control | Status |
|---------|--------|
| Version control | ✅ Git repository |
| Code review | ⚠️ Planned: Require PR reviews |
| Staging environment | ⚠️ Planned: Pre-production testing |
| Deployment process | ⚠️ Planned: Documented CI/CD pipeline |

### 8.2 Planned Controls

| Control | Target Date |
|---------|-------------|
| PR review requirement | Q3 2026 |
| Staging environment parity | Q4 2026 |
| Rollback procedures | Q4 2026 |
| Change approval workflow | 2027 |

---

## 9. Physical & Environmental

| Control | Implementation |
|---------|----------------|
| Hosting | AWS / Google Cloud (SOC 2 certified) |
| Data center | Provider-managed physical security |
| Redundancy | Multi-AZ deployment |
| Access | Provider-managed, customer audit logs |

---

## 10. Compliance Monitoring

| Activity | Frequency | Owner |
|----------|-----------|-------|
| Control review | Quarterly | Security |
| Gap remediation tracking | Monthly | Engineering |
| Policy update | Annually | Legal |
| SOC 2 audit | Annually | External auditor |
| Penetration test | Annually | Third-party |
