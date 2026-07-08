# GapMiner Access Control Policy

**Document Version:** 1.0
**Effective Date:** July 2026
**Owner:** Engineering / Security

---

## 1. Purpose

This policy defines GapMiner's access control model, including role definitions, permission matrices, API key lifecycle, session management, and password requirements.

---

## 2. Authentication Methods

### 2.1 JWT Authentication

| Property | Value | Reference |
|----------|-------|-----------|
| Token type | Bearer JWT | `middleware/auth.ts:33` |
| Access token expiry | 24 hours | `config.ts:58` |
| Refresh token expiry | 30 days | `config.ts:59` |
| Signing algorithm | HS256 (symmetric) | `auth.ts:179` |
| Secret storage | Environment variable | `config.ts:57` |
| Minimum secret length | 32 characters | `config.ts:108` |

### 2.2 API Key Authentication

| Property | Value | Reference |
|----------|-------|-----------|
| Key format | `gm_` + 32 random bytes | `api-keys.ts:70` |
| Storage method | SHA-256 hash only | `api-keys.ts:79` |
| Lookup method | Prefix-based (first 11 chars) | `api-auth.ts:44` |
| Default rate limit | 60 requests/minute | `api-keys.ts:116` |
| Expiry | Configurable, optional | `api-keys.ts:105` |

### 2.3 Password Policy

| Requirement | Value | Reference |
|-------------|-------|-----------|
| Hashing algorithm | bcrypt | `config.ts:60` |
| Salt rounds | 12 | `config.ts:60` |
| Minimum length | ⚠️ Planned: 8 characters | — |
| Complexity | ⚠️ Planned: mixed case + numbers | — |
| History check | ⚠️ Planned: last 5 passwords | — |

---

## 3. Role Definitions

### 3.1 System Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `user` | Standard user | CRUD on own data, read shared |
| `admin` | System administrator | Full system access, user management |
| `moderator` | Content moderator | Read all, moderate content |

**Reference:** `server/src/db/schema.sql:20` — `users.role` column

### 3.2 Organization Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `owner` | Organization creator | Full org control, billing, delete |
| `admin` | Organization admin | Member management, settings |
| `editor` | Content editor | Create/edit papers, gaps, collections |
| `viewer` | Read-only member | Read-only access to org data |

**Reference:** `src/lib/enterprise-controls.ts:55` — `OrganizationMember.role`

### 3.3 Team Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `admin` | Team administrator | Full team control |
| `editor` | Team editor | Create/edit team content |
| `viewer` | Team viewer | Read-only access |

**Reference:** `server/src/db/schema.sql:238` — `team_members.role`

---

## 4. Permission Matrix

### 4.1 Resource Permissions by System Role

| Resource | User | Admin | Moderator |
|----------|------|-------|-----------|
| Own papers | CRUD | CRUD | R |
| All papers | R | CRUD | CRUD |
| Own gaps | CRUD | CRUD | R |
| All gaps | R | CRUD | CRUD |
| Own collections | CRUD | CRUD | R |
| All collections | R | CRUD | CRUD |
| Comments | CRUD (own) | CRUD | CRUD |
| Users | R (self) | CRUD | R |
| Organizations | CRUD (owned) | CRUD | R |
| API keys | CRUD (own) | CRUD | R |
| Audit logs | R (org) | CRUD | R |
| Settings | R (self) | CRUD | R |

### 4.2 API Key Permissions

| Permission | Description | Reference |
|------------|-------------|-----------|
| `papers:read` | Read papers | `api-keys.ts:44` |
| `papers:write` | Create/update papers | `api-keys.ts:45` |
| `gaps:read` | Read gaps | `api-keys.ts:46` |
| `gaps:write` | Create/update gaps | `api-keys.ts:47` |
| `collections:read` | Read collections | `api-keys.ts:48` |
| `collections:write` | Create/update collections | `api-keys.ts:49` |
| `batch:execute` | Execute batch jobs | `api-keys.ts:50` |
| `analytics:read` | Read analytics | `api-keys.ts:51` |

### 4.3 Permission Groups

| Group | Permissions | Reference |
|-------|-------------|-----------|
| `read` | papers:read, gaps:read, collections:read, analytics:read | `api-keys.ts:248` |
| `write` | papers:write, gaps:write, collections:write | `api-keys.ts:249` |
| `full` | All permissions | `api-keys.ts:250` |

---

## 5. API Key Lifecycle

### 5.1 Creation

| Step | Implementation | Reference |
|------|----------------|-----------|
| Generate key | 32-byte crypto random | `api-keys.ts:70` |
| Hash key | SHA-256 for storage | `api-keys.ts:79` |
| Store prefix | First 11 chars for lookup | `api-keys.ts:103` |
| Set permissions | Caller-specified | `api-keys.ts:93` |
| Set rate limit | Default 60/min | `api-keys.ts:116` |
| Set expiry | Optional, in days | `api-keys.ts:105` |
| Log creation | Audit trail | `audit-trail.ts:21` |

### 5.2 Validation

| Step | Implementation | Reference |
|------|----------------|-----------|
| Check prefix | Quick lookup | `api-auth.ts:44` |
| Verify hash | SHA-256 comparison | `api-auth.ts:68` |
| Check expiry | Timestamp comparison | `api-auth.ts:62` |
| Check active | `is_active` flag | `api-auth.ts:50` |
| Check quota | Monthly usage vs limit | `api-auth.ts:75` |
| Check rate | Requests per minute | `api-auth.ts:81` |
| Update last used | Timestamp | `api-keys.ts:192` |

### 5.3 Revocation

| Method | Implementation | Reference |
|--------|----------------|-----------|
| Soft revoke | Set `is_active = false` | `api-keys.ts:160` |
| Hard delete | Remove from database | `api-keys.ts:155` |
| Auto-revoke | On expiry | `api-auth.ts:63` |
| Audit log | Log revocation | `audit-trail.ts:21` |

---

## 6. Session Management

### 6.1 Token Structure

| Token | Payload | Expiry | Reference |
|-------|---------|--------|-----------|
| Access token | userId, email, role, tier | 24 hours | `auth.ts:179` |
| Refresh token | userId, type: 'refresh' | 30 days | `auth.ts:183` |

### 6.2 Session Storage

| Storage | Implementation | Reference |
|---------|----------------|-----------|
| Sessions table | Refresh token hash, IP, UA | `schema.sql:555` |
| Token expiry | `expires_at` column | `schema.sql:561` |
| Session cleanup | ⚠️ Planned: Periodic purge | — |

### 6.3 Session Termination

| Trigger | Implementation |
|---------|----------------|
| Token expiry | 401 response, re-auth required |
| Logout | Client-side token removal |
| Password change | ⚠️ Planned: Invalidate all sessions |
| Admin action | ⚠️ Planned: Force logout |
| Anomaly detected | ⚠️ Planned: Auto-terminate |

---

## 7. Enterprise Access Controls

### 7.1 SSO Configuration

| Provider | Status | Reference |
|----------|--------|-----------|
| SAML | Supported | `enterprise-controls.ts:291` |
| OAuth | Supported | `enterprise-controls.ts:291` |
| OIDC | Supported | `enterprise-controls.ts:291` |
| Okta | Registered | `sso.ts:16` |
| Azure AD | Registered | `sso.ts:16` |
| Google Workspace | Registered | `sso.ts:16` |

### 7.2 IP Whitelist

| Property | Value | Reference |
|----------|-------|-----------|
| Per-org whitelist | Supported | `enterprise-controls.ts:19` |
| Format | IPv4/IPv6 CIDR | `enterprise-controls.ts:19` |
| Empty = allow all | Yes | `enterprise-controls.ts:129` |

### 7.3 Session Timeout

| Property | Value | Reference |
|----------|-------|-----------|
| Default timeout | 3600 seconds (1 hour) | `enterprise-controls.ts:128` |
| Configurable | Yes, per organization | `enterprise-controls.ts:18` |
| Min/Max | ⚠️ Planned: 5min / 24hr | — |

### 7.4 MFA

| Property | Value | Reference |
|----------|-------|-----------|
| Supported | Yes | `enterprise-controls.ts:18` |
| Required | Per-org setting | `enterprise-controls.ts:18` |
| Methods | ⚠️ Planned: TOTP, SMS | — |

---

## 8. Quota Enforcement

### 8.1 User Tier Limits

| Tier | Papers/Month | Gaps/Paper | API Calls/Day | Reference |
|------|--------------|------------|---------------|-----------|
| Free | 10 | 20 | 50 | `config.ts:85` |
| Pro | 100 | 50 | 500 | `config.ts:86` |
| Team | 500 | 100 | 2,000 | `config.ts:87` |
| Enterprise | Unlimited | Unlimited | Unlimited | `config.ts:88` |

### 8.2 Organization Quotas

| Resource | Default Limit | Reference |
|----------|---------------|-----------|
| Members | 10 | `enterprise-controls.ts:118` |
| Storage | 10 GB | `enterprise-controls.ts:119` |
| API calls | 100,000/month | `enterprise-controls.ts:120` |
| Collections | 100 | `enterprise-controls.ts:121` |
| Exports | 1,000 | `enterprise-controls.ts:122` |

---

## 9. Audit Requirements

### 9.1 Events to Log

| Event | Action Type | Reference |
|-------|-------------|-----------|
| Login success | `login_success` | `audit-trail.ts:49` |
| Login failure | `login_failed` | `audit-trail.ts:50` |
| Logout | `logout` | `audit-trail.ts:51` |
| API key created | `api_key_created` | `audit-trail.ts:42` |
| API key revoked | `api_key_revoked` | `audit-trail.ts:43` |
| Role changed | `role_changed` | `audit-trail.ts:24` |
| Member invited | `member_invited` | `audit-trail.ts:21` |
| Member removed | `member_removed` | `audit-trail.ts:23` |
| Settings changed | `settings_changed` | `audit-trail.ts:44` |
| SSO configured | `sso_configured` | `audit-trail.ts:45` |
| DLP filter applied | `dlp_filter_applied` | `audit-trail.ts:47` |
| Export requested | `export_requested` | `audit-trail.ts:48` |

### 9.2 Audit Log Fields

| Field | Description | Reference |
|-------|-------------|-----------|
| organizationId | Organization scope | `audit-trail.ts:55` |
| userId | Who performed action | `audit-trail.ts:58` |
| action | What was done | `audit-trail.ts:60` |
| targetType | Resource type affected | `audit-trail.ts:61` |
| targetId | Specific resource | `audit-trail.ts:62` |
| metadata | Additional context | `audit-trail.ts:64` |
| ipAddress | Source IP | `audit-trail.ts:65` |
| userAgent | Client info | `audit-trail.ts:66` |
| timestamp | When it happened | `audit-strail.ts:67` |

---

## 10. Planned Enhancements

| Enhancement | Priority | Target Date |
|-------------|----------|-------------|
| Minimum password length enforcement | High | Q3 2026 |
| Password complexity requirements | High | Q3 2026 |
| Password history check | Medium | Q4 2026 |
| Session invalidation on password change | High | Q3 2026 |
| MFA methods (TOTP, SMS) | Medium | Q4 2026 |
| Automated session cleanup | Medium | Q4 2026 |
| Real-time session monitoring | Low | 2027 |

---

## 11. References

- `server/src/middleware/auth.ts` — JWT authentication
- `server/src/middleware/api-auth.ts` — API key authentication
- `server/src/config.ts` — Configuration and limits
- `src/lib/api-keys.ts` — API key management
- `src/lib/enterprise-controls.ts` — Enterprise access controls
- `src/lib/audit-trail.ts` — Audit logging
- `server/src/db/schema.sql` — Database schema
