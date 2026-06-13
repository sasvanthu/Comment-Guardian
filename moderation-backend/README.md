# Moderation Backend

Node.js + Express backend for the Social Media Comment Moderation Tool.
Integrates Twitter/X v2, Facebook Graph, Instagram Graph, and OpenAI/DeepSeek
for toxic comment detection.

## Setup

```bash
cd moderation-backend
cp .env.example .env   # then fill in your keys
npm install
npm run dev
```

Server runs on `http://localhost:5000`.

## Auth

If `API_AUTH_TOKEN` is set in `.env`, every `/api/*` request must include:

```
Authorization: Bearer <API_AUTH_TOKEN>
```

Leave it empty in development to disable auth.

## Endpoints

### Twitter
- `GET    /api/twitter/comments` — fetch replies/mentions (optional `?conversationId=`)
- `DELETE /api/twitter/comments/:id`
- `POST   /api/twitter/comments/bulk-delete` — body: `{ "ids": ["..."] }`

### Facebook
- `GET    /api/facebook/comments`
- `DELETE /api/facebook/comments/:id`
- `POST   /api/facebook/comments/bulk-delete`

### Instagram
- `GET    /api/instagram/comments`
- `DELETE /api/instagram/comments/:id`
- `POST   /api/instagram/comments/bulk-delete`

### AI
- `POST /api/ai/analyze` — body: `{ "text": "..." }`
- `POST /api/ai/analyze-bulk` — body: `{ "comments": [{ "id", "text" }, ...] }`
- `POST /api/ai/auto-moderate` — body: `{ "platform": "twitter|facebook|instagram", "threshold": 70 }`

### Dashboard
- `GET  /api/dashboard/all-comments`
- `GET  /api/dashboard/stats`
- `POST /api/dashboard/auto-clean` — body: `{ "threshold": 70 }`

## Unified comment shape

```json
{
  "id": "string",
  "platform": "twitter | facebook | instagram",
  "author": "string",
  "text": "string",
  "timestamp": "ISO-8601",
  "postId": "string | null",
  "sentiment": "positive | negative | neutral"
}
```

## AI analysis response

```json
{
  "sentiment": "positive | negative | neutral",
  "toxic": true,
  "score": 0,
  "reason": "string",
  "category": "spam | hate | abuse | offensive | clean"
}
```
