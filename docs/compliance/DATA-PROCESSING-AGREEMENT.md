# GapMiner Data Processing Agreement (DPA)

**Document Version:** 1.0
**Effective Date:** July 2026
**Parties:** GapMiner Inc. ("Processor") | Customer Organization ("Controller")

---

## 1. Overview

This Data Processing Agreement ("DPA") governs the processing of personal data by GapMiner on behalf of Customer organizations using the GapMiner research intelligence platform.

---

## 2. Roles & Responsibilities

### 2.1 Data Controller

**Customer Organization** determines the purposes and means of processing personal data through GapMiner, including:

- Research paper data and metadata
- User account information for team members
- Organization-level settings and configurations
- AI-generated analysis outputs

### 2.2 Data Processor

**GapMiner Inc.** processes personal data only on documented instructions from Controller, including:

- Processing research papers and extracting research gaps
- Providing AI-powered analysis and recommendations
- Enabling team collaboration and sharing
- Generating reports and exports

---

## 3. Data Processed

### 3.1 Categories of Data Subjects

| Category | Examples | Storage |
|----------|----------|---------|
| Researchers | Name, email, institution, bio | PostgreSQL `users`, `user_profiles` |
| Organization members | Role, join date, activity | Firestore `organizationMembers` |
| API consumers | API key usage, endpoints | PostgreSQL `api_keys`, `api_usage_logs` |

### 3.2 Types of Personal Data

| Data Type | Description | Classification |
|-----------|-------------|----------------|
| **Account data** | Email, name, password hash | Confidential |
| **Profile data** | Bio, institution, social links | Internal |
| **Usage data** | Papers analyzed, gaps found, API calls | Internal |
| **Payment data** | Stripe/Razorpay subscription IDs | Restricted |
| **Content data** | Papers, gaps, annotations, comments | Confidential |
| **AI outputs** | Generated analyses, recommendations | Confidential |

### 3.3 Research Data (Non-Personal)

| Data Type | Source | Processing |
|-----------|--------|------------|
| Academic papers | arXiv, Semantic Scholar, manual upload | Storage, indexing, full-text search |
| Research gaps | AI extraction from papers | Storage, classification, ranking |
| Citations | Cross-referenced from papers | Knowledge graph construction |
| Datasets | User-submitted references | Metadata storage, quality scoring |

---

## 4. Processing Purposes

GapMiner processes data for the following purposes:

1. **Service delivery** — Provide research intelligence platform functionality
2. **AI analysis** — Process papers through LLM providers to extract research gaps
3. **Collaboration** — Enable team sharing, commenting, and annotation
4. **Billing** — Manage subscriptions and usage tracking
5. **Security** — Authentication, authorization, audit logging
6. **Support** — Error tracking, performance monitoring, user feedback

---

## 5. Sub-Processors

### 5.1 Infrastructure

| Sub-Processor | Purpose | Location | DPA |
|---------------|---------|----------|-----|
| AWS / Google Cloud | Hosting, compute, storage | US / EU | ✅ Yes |
| PostgreSQL (managed) | Primary database | Same region as compute | ✅ Yes |
| Redis (managed) | Caching, job queues | Same region as compute | ✅ Yes |

### 5.2 Third-Party Services

| Sub-Processor | Purpose | Data Shared | DPA |
|---------------|---------|-------------|-----|
| Stripe | Payment processing | Subscription ID, email | ✅ Yes |
| Razorpay | Payment processing (INR) | Subscription ID, email | ✅ Yes |
| SendGrid | Transactional email | Email address, name | ✅ Yes |
| Sentry | Error tracking | Error messages, stack traces | ✅ Yes |

### 5.3 AI Providers

| Sub-Processor | Purpose | Data Shared | DPA |
|---------------|---------|-------------|-----|
| Google (Gemini) | AI analysis | Paper content (anonymized) | ✅ Yes |
| OpenAI | AI analysis | Paper content (anonymized) | ✅ Yes |
| Anthropic | AI analysis | Paper content (anonymized) | ✅ Yes |
| OpenRouter | AI routing | Paper content (anonymized) | ✅ Yes |

**Note:** Paper content sent to AI providers is stripped of user-identifiable information where technically feasible. All AI providers have executed DPAs or are covered under their standard data processing terms.

---

## 6. Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|------------------|-----------------|
| User accounts | Account lifetime + 30 days | Automated purge |
| Audit logs | 365 days (configurable) | Automated purge |
| API usage logs | 90 days | Automated purge |
| Chat sessions | 90 days | Automated purge |
| Export files | 7 days or on download | Automated expiry |
| Research papers | Account lifetime | Cascade delete on account removal |
| Payment records | 7 years (legal requirement) | Manual review |

---

## 7. Data Security

### 7.1 Technical Measures

| Measure | Implementation |
|---------|----------------|
| Encryption in transit | TLS 1.2+ via HTTPS |
| Encryption at rest | PostgreSQL pgcrypto, cloud provider encryption |
| Access controls | JWT + API key authentication |
| Network security | CORS, rate limiting, Helmet headers |
| Audit logging | 26+ action types tracked |

### 7.2 Organizational Measures

- Employee access to production data requires MFA
- Access to customer data is logged and audited
- Security training conducted annually
- Incident response plan documented

---

## 8. Data Subject Rights

GapMiner supports the following data subject rights:

| Right | Implementation | Endpoint |
|-------|----------------|----------|
| **Access** | Export user data | `GET /api/export` |
| **Rectification** | Edit profile | `PUT /api/user/profile` |
| **Erasure** | Account deletion | `DELETE /api/user/account` |
| **Portability** | JSON/CSV export | `GET /api/export` |
| **Restriction** | Account suspension | Admin dashboard |
| **Objection** | Opt-out of marketing | Notification preferences |

---

## 9. Data Breach Notification

### 9.1 Notification Timeline

| Event | Timeline |
|-------|----------|
| Processor detects breach | Notify Controller within **72 hours** |
| Processor notifies authority | As required by applicable law |
| Processor provides details | Within **5 business days** of initial notification |

### 9.2 Notification Contents

- Nature of the breach
- Categories and approximate number of data subjects
- Likely consequences
- Measures taken or proposed to address the breach
- Contact point for further information

---

## 10. International Data Transfers

GapMiner processes data in the following regions:

| Region | Purpose | Safeguards |
|--------|---------|------------|
| US (AWS/GCP) | Primary hosting | Standard Contractual Clauses |
| EU (AWS/GCP) | EU customer hosting | GDPR compliance |
| Global (AI providers) | LLM processing | DPA with each provider |

---

## 11. Termination

Upon termination of the Agreement:

1. Processor shall return all personal data to Controller within **30 days**
2. Processor shall securely delete all copies within **60 days**
3. Processor may retain data required by law for the mandatory retention period
4. Processor shall certify deletion in writing upon request

---

## 12. Contact

For data protection inquiries:

- **Data Protection Officer:** [dpo@gapminer.com]
- **Security Team:** [security@gapminer.com]
- **Legal:** [legal@gapminer.com]
