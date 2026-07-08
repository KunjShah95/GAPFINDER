# GapMiner API Documentation

## Overview

GapMiner provides a comprehensive REST API for accessing research data, managing collections, and integrating with external tools.

## Base URL

```
Production: https://api.gapminer.com/v1
Development: http://localhost:3001/api
```

## Authentication

### API Keys

All API requests require an API key passed in the `Authorization` header:

```bash
Authorization: Bearer gm_your_api_key
```

Generate API keys in Settings → API Keys

### OAuth 2.0

For user-level access, use OAuth 2.0 flow:

```
GET /api/auth/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&response_type=code
```

## API Endpoints

### Papers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /papers | List papers with filters |
| GET | /papers/:id | Get paper details |
| POST | /papers | Add new paper |
| GET | /papers/:id/gaps | Get gaps from paper |
| DELETE | /papers/:id | Delete paper |

### Research Gaps

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /gaps | List all gaps |
| GET | /gaps/:id | Get gap details |
| POST | /gaps/:id/vote | Vote on gap importance |
| PUT | /gaps/:id/status | Update gap status |
| GET | /gaps/trending | Get trending gaps |

### Collections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /collections | List user collections |
| POST | /collections | Create collection |
| PUT | /collections/:id | Update collection |
| DELETE | /collections/:id | Delete collection |
| POST | /collections/:id/papers | Add paper to collection |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /search | Search papers & gaps |
| GET | /search/suggest | Autocomplete suggestions |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /analytics/overview | Dashboard metrics |
| GET | /analytics/activity | Activity timeline |
| GET | /analytics/usage | Usage statistics |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /webhooks | List webhooks |
| POST | /webhooks | Create webhook |
| PUT | /webhooks/:id | Update webhook |
| DELETE | /webhooks/:id | Delete webhook |

## Webhook Events

Subscribe to these events:

- `paper.created` - New paper added
- `paper.deleted` - Paper removed
- `gap.created` - New gap discovered
- `gap.resolved` - Gap marked as resolved
- `gap.voted` - User voted on gap
- `collection.created` - New collection
- `collection.updated` - Collection modified
- `alert.triggered` - Alert condition met

## Rate Limits

| Plan | Requests/min | Daily Limit |
|------|--------------|-------------|
| Free | 60 | 1,000 |
| Pro | 300 | 10,000 |
| Team | 1,000 | 100,000 |
| Enterprise | Unlimited | Unlimited |

## SDKs

### JavaScript/TypeScript

```bash
npm install @gapminer/sdk
```

```typescript
import { GapMiner } from '@gapminer/sdk'

const client = new GapMiner({ apiKey: 'gm_xxx' })
const papers = await client.papers.list({ limit: 10 })
```

### Python

```bash
pip install gapminer
```

```python
from gapminer import Client

client = Client(api_key="gm_xxx")
papers = client.papers.list(limit=10)
```

### cURL Examples

```bash
# List papers
curl -X GET https://api.gapminer.com/v1/papers \
  -H "Authorization: Bearer gm_xxx"

# Create webhook
curl -X POST https://api.gapminer.com/v1/webhooks \
  -H "Authorization: Bearer gm_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Slack Notifications",
    "url": "https://hooks.slack.com/xxx",
    "events": ["gap.created", "paper.created"]
  }'
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid API key |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Error - Server issue |

## Support

- Email: api-support@gapminer.com
- Discord: https://discord.gg/gapminer
- Documentation: https://docs.gapminer.com