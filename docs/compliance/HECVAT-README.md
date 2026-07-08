# GapMiner HECVAT 4.0 Readiness Guide

**Document Version:** 1.0
**Effective Date:** July 2026
**Purpose:** Guide for completing the Higher Education Community Vendor Assessment Toolkit (HECVAT 4.0)

---

## 1. Overview

The HECVAT is a standardized security assessment used by higher education institutions to evaluate third-party vendors. This guide provides pre-populated answers for GapMiner based on our current implementation.

---

## 2. Section-by-Section Guide

### 2.1 Company Information

| Field | Answer |
|-------|--------|
| Company Name | GapMiner Inc. |
| Product/Service | GapMiner — AI-Powered Research Intelligence Platform |
| Version | 1.0 |
| Deployment Model | SaaS (Cloud-hosted) |
| Hosting Provider | AWS / Google Cloud |
| Data Center Locations | US, EU (configurable per customer) |

### 2.2 Product Description

**Pre-populated answer:**

> GapMiner is a SaaS research intelligence platform that helps universities and research institutions discover research gaps, analyze academic papers, and identify funding opportunities. The platform uses AI/LLM technology to process academic papers and extract actionable research insights. Data is processed in the cloud and stored in PostgreSQL databases with encryption at rest.

---

### 2.3 Data Protection & Privacy

| Question | Answer | Evidence |
|----------|--------|----------|
| Is data encrypted at rest? | Yes | `schema.sql:8` — pgcrypto extension enabled |
| Is data encrypted in transit? | Yes | `index.ts:60` — Helmet with TLS enforcement |
| Where is data stored? | AWS/GCP cloud | `server/src/config.ts` — `DATABASE_URL` |
| Is data shared with third parties? | Yes, sub-processors | See DPA Section 5 |
| Can data be exported? | Yes | `routes/export.ts` — JSON/CSV/PDF export |
| Can data be deleted? | Yes | Account deletion cascades |
| Data retention period | Configurable | See DPA Section 6 |

---

### 2.4 Access Controls

| Question | Answer | Evidence |
|----------|--------|----------|
| Authentication method | JWT + API keys | `middleware/auth.ts`, `middleware/api-auth.ts` |
| Password policy | bcrypt, 12 rounds | `config.ts:60` |
| Multi-factor authentication | Supported (Enterprise) | `enterprise-controls.ts:18` |
| Role-based access | Yes | `auth.ts:75` — user, admin, moderator |
| Single sign-on | Yes (SAML/OAuth/OIDC) | `enterprise-controls.ts:291` |
| Session timeout | Configurable | `enterprise-controls.ts:18` |
| API key management | Full lifecycle | `api-keys.ts` |

---

### 2.5 Network Security

| Question | Answer | Evidence |
|----------|--------|----------|
| Firewall | Cloud-native | AWS/GCP security groups |
| Intrusion detection | ⚠️ Planned | Sentry error tracking exists |
| DDoS protection | Cloud-native | AWS/GCP DDoS mitigation |
| Rate limiting | Yes | `index.ts:76` — 100 req/15min |
| CORS policy | Origin-restricted | `index.ts:65` |
| Security headers | Helmet.js | `index.ts:60` |

---

### 2.6 Vulnerability Management

| Question | Answer | Status |
|----------|--------|--------|
| Vulnerability scanning | ⚠️ Planned | Snyk integration planned Q3 2026 |
| Penetration testing | ⚠️ Planned | Annual pen test planned Q4 2026 |
| Patch management | ⚠️ Planned | Dependency update process planned |
| Bug bounty program | ⚠️ Planned | 2027 target |

---

### 2.7 Incident Response

| Question | Answer | Evidence |
|----------|--------|----------|
| Incident response plan | ⚠️ Planned | Draft documented in SECURITY-CONTROLS.md |
| Breach notification | 72 hours | DPA Section 9 |
| Incident logging | Yes | `audit-trail.ts` — 26+ action types |
| Evidence preservation | Yes | Logs retained per policy |

---

### 2.8 Business Continuity

| Question | Answer | Status |
|----------|--------|--------|
| Disaster recovery plan | ⚠️ Planned | Target Q3 2026 |
| RTO/RPO targets | ⚠️ Planned | To be defined |
| Backup frequency | ⚠️ Planned | Daily automated backups planned |
| Backup testing | ⚠️ Planned | Quarterly restore tests planned |
| Multi-region failover | ⚠️ Planned | 2027 target |

---

### 2.9 Compliance & Certifications

| Certification | Status |
|---------------|--------|
| SOC 2 Type I | ⚠️ In Progress — Target Q4 2026 |
| SOC 2 Type II | ⚠️ Planned — Target Q2 2027 |
| ISO 27001 | ⚠️ Planned — 2027 |
| GDPR compliance | ⚠️ Partial — DPA exists, privacy policy planned |
| FERPA compliance | ⚠️ Planned — Higher ed requirements review |
| HIPAA | N/A — Not applicable |

---

### 2.10 AI/ML Specific Questions

| Question | Answer | Evidence |
|----------|--------|----------|
| Is AI used to process data? | Yes | LLM providers process paper content |
| What AI models are used? | Gemini, OpenAI, Anthropic, others | `config.ts:66-72` |
| Is AI output reviewed? | Human-in-the-loop | User reviews gap extractions |
| Is AI training data stored? | No | No model training on customer data |
| AI data retention | Per provider terms | See DPA Section 5.3 |
| Data sent to AI providers | Anonymized paper content | User ID stripped before LLM calls |

---

## 3. Gaps Requiring Remediation

### 3.1 Critical Gaps (Must Address)

| Gap | Impact | Remediation | Target |
|-----|--------|-------------|--------|
| No formal DR plan | High | Document RTO/RPO, implement backups | Q3 2026 |
| No vulnerability scanning | High | Integrate Snyk/Dependabot | Q3 2026 |
| No privacy policy | High | Draft and publish privacy policy | Q3 2026 |
| No pen test | Medium | Schedule annual pen test | Q4 2026 |

### 3.2 Medium Gaps (Should Address)

| Gap | Impact | Remediation | Target |
|-----|--------|-------------|--------|
| No input validation library | Medium | Add Zod schema validation | Q4 2026 |
| No formal change management | Medium | Document CI/CD process | Q4 2026 |
| No automated offboarding | Medium | Implement org member removal | Q4 2026 |
| No data retention automation | Medium | Build retention/deletion pipeline | Q4 2026 |

### 3.3 Low Gaps (Nice to Have)

| Gap | Impact | Remediation | Target |
|-----|--------|-------------|--------|
| No bug bounty | Low | Launch program | 2027 |
| No ISO 27001 | Low | Begin certification | 2027 |
| No multi-region failover | Low | Implement DR | 2027 |

---

## 4. Evidence Package

When completing the HECVAT, provide the following evidence:

| Evidence | File | Description |
|----------|------|-------------|
| Access control implementation | `server/src/middleware/auth.ts` | JWT, RBAC, rate limiting |
| API key security | `server/src/middleware/api-auth.ts` | Hash-based validation |
| Audit trail | `src/lib/audit-trail.ts` | 26+ tracked actions |
| Enterprise controls | `src/lib/enterprise-controls.ts` | SSO, MFA, DLP, IP whitelist |
| Database security | `server/src/db/schema.sql` | pgcrypto, parameterized queries |
| Network security | `server/src/index.ts` | Helmet, CORS, rate limiting |
| Monitoring | `src/lib/monitoring.ts` | Error tracking, API usage |
| This guide | `docs/compliance/HECVAT-README.md` | Pre-populated answers |

---

## 5. Tips for Completion

1. **Be honest about gaps** — Document planned controls with timelines
2. **Provide evidence** — Link to actual code files, not just statements
3. **Focus on what exists** — Emphasize implemented controls
4. **Show roadmap** — Demonstrate commitment to remediation
5. **Update regularly** — Revisit HECVAT answers quarterly

---

## 6. Contact

For HECVAT completion assistance:

- **Security:** [security@gapminer.com]
- **Engineering:** [engineering@gapminer.com]
- **Sales:** [sales@gapminer.com]
