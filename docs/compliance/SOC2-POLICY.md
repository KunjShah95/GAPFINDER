# GapMiner SOC 2 Type II Compliance Policy

**Document Version:** 1.0
**Effective Date:** July 2026
**Last Reviewed:** July 2026
**Policy Owner:** Engineering / Security

---

## 1. Purpose

This policy defines GapMiner's compliance posture against the AICPA SOC 2 Trust Services Criteria (TSC). GapMiner is an AI-powered research intelligence platform that processes academic papers, research data, and user-generated content for universities and research institutions. This document maps existing controls and identifies gaps requiring remediation.

---

## 2. Scope

This policy covers the GapMiner platform including:

- **Backend API** (`server/src/`) — Node.js + Express + TypeScript
- **Client Library** (`src/lib/`) — Frontend logic, audit trails, enterprise controls
- **Database** — PostgreSQL with pgcrypto extension
- **Third-party integrations** — AI providers, payment processors, email services

---

## 3. Trust Services Criteria Mapping

### 3.1 Security (Common Criteria — CC)

| Criteria | Status | Implementation |
|----------|--------|----------------|
| CC6.1 — Logical access controls | ✅ Implemented | JWT auth (`server/src/middleware/auth.ts:30`), API key auth (`server/src/middleware/api-auth.ts:30`), role-based access (`auth.ts:75`) |
| CC6.2 — User registration & provisioning | ✅ Implemented | User creation with email verification, password hashing with bcrypt (`config.ts:60` — 12 rounds) |
| CC6.3 — Role-based access | ✅ Implemented | Roles: user, admin, moderator (`schema.sql:20`); org roles: owner, admin, editor, viewer (`enterprise-controls.ts:55`) |
| CC6.4 — Access removal | ⚠️ Partial | Account deletion exists; **Gap: No automated offboarding for organization members** |
| CC6.6 — Restriction of access | ✅ Implemented | CORS policy (`index.ts:65`), IP whitelist support (`enterprise-controls.ts:19`), rate limiting (`index.ts:76`) |
| CC7.1 — Vulnerability management | ⚠️ Planned | **Gap: No formal vulnerability scanning schedule. Planned: Integrate Snyk/Dependabot** |
| CC7.2 — Intrusion detection | ⚠️ Partial | Sentry error tracking (`index.ts:14`); **Gap: No dedicated IDS/IPS** |
| CC8.1 — Change management | ⚠️ Planned | **Gap: No formal change management policy. Planned: Require PR reviews and staging deployment** |

### 3.2 Availability (A)

| Criteria | Status | Implementation |
|----------|--------|----------------|
| A1.1 — Capacity planning | ✅ Implemented | Tier-based quotas (`config.ts:84`), organization quotas (`enterprise-controls.ts:35`) |
| A1.2 — Environmental protections | ⚠️ Partial | Cloud-hosted (AWS/GCP); **Gap: No documented DR plan** |
| A1.3 — Recovery procedures | ⚠️ Planned | **Gap: No formal disaster recovery plan. Planned: Document RTO/RPO and backup restoration procedures** |

### 3.3 Processing Integrity (PI)

| Criteria | Status | Implementation |
|----------|--------|----------------|
| PI1.1 — Input validation | ⚠️ Partial | SQL injection prevented via parameterized queries (`db/client.ts`); **Gap: No input validation schema library (e.g., Zod)** |
| PI1.2 — Error handling | ✅ Implemented | Global error handler (`index.ts:162`), Sentry capture, graceful shutdown (`index.ts:202`) |
| PI1.3 — Processing monitoring | ✅ Implemented | LLM call logs (`schema.sql:533`), API usage logs (`schema.sql:462`), circuit breaker (`lib/circuit-breaker.ts`) |

### 3.4 Confidentiality (C)

| Criteria | Status | Implementation |
|----------|--------|----------------|
| C1.1 — Data classification | ⚠️ Planned | **Gap: No formal data classification policy. Planned: Classify data as Public, Internal, Confidential, Restricted** |
| C1.2 — Encryption at rest | ⚠️ Partial | pgcrypto enabled (`schema.sql:8`); **Gap: No application-level encryption for sensitive fields** |
| C1.3 — Encryption in transit | ✅ Implemented | HTTPS enforced, Helmet security headers (`index.ts:60`) |
| C1.4 — Data disposal | ⚠️ Planned | **Gap: No automated data retention/deletion policy** |

### 3.5 Privacy (P)

| Criteria | Status | Implementation |
|----------|--------|----------------|
| P1.1 — Notice & consent | ⚠️ Planned | **Gap: No privacy policy or cookie consent mechanism** |
| P1.2 — Data collection limitation | ⚠️ Partial | DLP filters exist (`enterprise-controls.ts:43`); **Gap: No collection minimization enforcement** |
| P1.3 — Data use & retention | ⚠️ Planned | **Gap: No formal retention schedule. Planned: Define retention periods per data type** |
| P1.4 — Data quality | ✅ Implemented | Audit trail tracks all mutations (`audit-trail.ts:72`) |
| P1.5 — Data portability | ⚠️ Partial | Export functionality exists (`routes/export.ts`); **Gap: No GDPR-style data export** |
| P1.6 — Data deletion | ⚠️ Planned | **Gap: No automated deletion pipeline** |

---

## 4. Control Implementation Details

### 4.1 Authentication

| Control | Implementation | File Reference |
|---------|---------------|----------------|
| JWT tokens | Access + refresh token pair | `auth.ts:178` |
| Token expiry | 24h access, 30d refresh | `config.ts:58-59` |
| Password hashing | bcrypt, 12 rounds | `config.ts:60` |
| Rate limiting | 20 attempts/15min on auth | `index.ts:86` |
| API key auth | SHA-256 hashed keys | `api-auth.ts:119` |

### 4.2 Authorization

| Control | Implementation | File Reference |
|---------|---------------|----------------|
| Role-based access | user, admin, moderator | `auth.ts:75` |
| Tier-based gating | free, pro, team, enterprise | `auth.ts:94` |
| Org-level roles | owner, admin, editor, viewer | `enterprise-controls.ts:55` |
| API permissions | Granular per-resource | `api-keys.ts:43` |

### 4.3 Audit Trail

- **26+ action types** tracked (`audit-trail.ts:21-51`)
- Records: user identity, timestamp, IP, user agent, target, metadata
- Stored in Firestore `auditLogs` collection
- Queryable by organization, user, action, date range

### 4.4 Enterprise Controls

| Control | Status | File Reference |
|---------|--------|----------------|
| SSO (SAML/OAuth/OIDC) | Configured | `enterprise-controls.ts:291` |
| MFA requirement | Supported | `enterprise-controls.ts:18` |
| IP whitelist | Supported | `enterprise-controls.ts:19` |
| DLP filters | Implemented | `enterprise-controls.ts:43` |
| Session timeout | Configurable | `enterprise-controls.ts:18` |
| API key rotation | Configurable (default 90d) | `enterprise-controls.ts:20` |

### 4.5 Network Security

| Control | Implementation | File Reference |
|---------|---------------|----------------|
| Security headers | Helmet.js | `index.ts:60` |
| CORS | Origin-restricted | `index.ts:65` |
| Rate limiting | Per-IP and per-key | `index.ts:76` |
| Body size limit | 5MB max | `index.ts:73` |

### 4.6 Monitoring & Incident Response

| Control | Implementation | File Reference |
|---------|---------------|----------------|
| Error tracking | Sentry | `index.ts:14` |
| API usage logging | Per-request logging | `api-auth.ts:141` |
| LLM observability | Token/cost tracking | `schema.sql:533` |
| Health checks | `/api/health` endpoint | `index.ts:137` |

---

## 5. Gap Analysis & Remediation Plan

| Gap | Priority | Target Date | Owner |
|-----|----------|-------------|-------|
| No formal DR plan | Critical | Q3 2026 | Engineering |
| No vulnerability scanning | Critical | Q3 2026 | Security |
| No data classification policy | High | Q3 2026 | Security |
| No privacy policy | High | Q3 2026 | Legal |
| No input validation library | Medium | Q4 2026 | Engineering |
| No automated offboarding | Medium | Q4 2026 | Engineering |
| No retention/deletion policy | High | Q3 2026 | Legal |
| No formal change management | Medium | Q4 2026 | Engineering |

---

## 6. Review & Maintenance

- **Quarterly review** of all controls and gap remediation status
- **Annual** SOC 2 Type II audit engagement
- **Immediate** review upon significant architecture changes
- Policy updates require sign-off from Engineering Lead and Security Officer

---

## 7. References

- AICPA Trust Services Criteria (2017)
- SOC 2 Reporting Guide
- GapMiner Codebase: `server/src/`, `src/lib/`
- Database Schema: `server/src/db/schema.sql`
