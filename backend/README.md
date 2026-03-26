# DesignOS Backend — v1.1.0

> **Autonomous Cinematic Generation Engine** — Full-stack backend for prompt-driven, AI-native cinematic video generation targeting Commercial Real Estate, Maritime, and Luxury Branding.

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│  React SPA + Three.js (Frontend)                              │
└──────────────────────────────┬────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼────────────────────────────────┐
│  Express API Gateway  (Node.js · port 4000)                   │
│  Helmet · CORS · Rate limiting · JWT · AES-256-GCM            │
│  Routes: /auth  /projects  /generate  /upload  /admin         │
└──────────────────────────────┬────────────────────────────────┘
                               │ Internal HTTP (X-Internal-Secret)
┌──────────────────────────────▼────────────────────────────────┐
│  FastAPI AI Orchestrator  (Python · port 8001)                 │
│  Keyframe gen · Prompt enrichment · QA checks · Scene analysis│
└──────┬──────────────┬────────────────────────────────┬────────┘
       │              │                                │
┌──────▼──────┐  ┌────▼────┐                    ┌─────▼──────┐
│ Kafka Queue │  │  Redis  │                    │ Firestore  │
│ GPU Jobs    │  │ Cache   │                    │ Metadata   │
└──────┬──────┘  └─────────┘                    └────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│  Multi-Agent Workflow (LangGraph-inspired)                   │
│  Director → Cinematographer → Visual Stylist                 │
│  → Creative Expansion (Genspark AI)                          │
│  → Keyframes (Flux.1 / SDXL) → Kling 3.0                    │
│  → Post-Production → Auto-QA → Delivery                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Node.js 20+, Python 3.12+, Docker + Docker Compose

### Development (local, no Docker)

```bash
# 1. Install Node.js dependencies
cd backend
npm install

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env — fill in at minimum: JWT_SECRET, ENCRYPTION_KEY, HMAC_SECRET,
# ORCHESTRATOR_INTERNAL_SECRET

# 4. Start Redis (Docker)
docker run -d -p 6379:6379 redis:7-alpine

# 5. Start Kafka (optional — falls back to in-memory queue)
docker-compose up -d zookeeper kafka

# 6. Start AI Orchestrator
python ai-orchestrator/main.py

# 7. Start Express Gateway
node gateway/server.js
# or for hot-reload:
npm run dev
```

### Production (Docker Compose)

```bash
cp .env.example .env          # Fill in all values
docker-compose up -d          # Starts gateway + orchestrator + redis + kafka
docker-compose logs -f        # Tail logs

# Include Kafka UI for operations:
docker-compose --profile tools up -d
```

---

## API Reference

Base URL: `http://localhost:4000/api/v1`

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register new user |
| `POST` | `/auth/login` | Login (returns access + refresh tokens) |
| `POST` | `/auth/refresh` | Rotate refresh token |
| `POST` | `/auth/logout` | Revoke tokens |
| `GET`  | `/auth/me` | Get current user profile |
| `POST` | `/auth/password/change` | Change password |
| `POST` | `/auth/password/reset-request` | Request password reset email |

**Example login:**
```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass1!"}'
```

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`    | `/projects` | List user projects |
| `POST`   | `/projects` | Create project |
| `GET`    | `/projects/:id` | Get project detail |
| `PATCH`  | `/projects/:id` | Update project |
| `DELETE` | `/projects/:id` | Delete project |
| `GET`    | `/projects/:id/jobs` | List project jobs |
| `GET`    | `/projects/:id/jobs/:jobId` | Get job status |
| `POST`   | `/projects/:id/jobs/:jobId/review` | HITL review action |
| `GET`    | `/projects/:id/jobs/:jobId/stream` | SSE real-time status |

### Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/generate` | Create generation job |
| `POST` | `/generate/variations` | Create style variations |
| `GET`  | `/generate/modes` | Available modes for tier |
| `GET`  | `/generate/presets` | Style preset library |
| `POST` | `/generate/:jobId/cancel` | Cancel job |
| `POST` | `/generate/:jobId/retry` | Retry failed job |

**Example generation:**
```bash
curl -X POST http://localhost:4000/api/v1/generate \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "uuid",
    "prompt": "Luxury penthouse overlooking Hong Kong harbour at golden hour, glass facade reflecting sunset, orbital camera motion",
    "mode": "cinema",
    "aspect_ratio": "16:9",
    "duration_seconds": 10,
    "style_presets": ["cre-luxury"]
  }'
```

### Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST`   | `/upload/reference` | Upload reference images (multipart) |
| `GET`    | `/upload/:fileId` | Get signed URL |
| `DELETE` | `/upload/:fileId` | Delete upload |

### Admin (role: admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/admin/users` | List users |
| `GET`  | `/admin/users/:id` | Get user |
| `PATCH`| `/admin/users/:id` | Update user role/status |
| `GET`  | `/admin/jobs` | Queue status + jobs |
| `GET`  | `/admin/metrics/summary` | System metrics |
| `POST` | `/admin/credits/adjust` | Adjust user credits |
| `POST` | `/admin/queue/flush-dlq` | Flush dead-letter queue |

---

## Render Modes

| Mode | Engine | Quality | Cost | Use Case |
|------|--------|---------|------|----------|
| `draft` | SDXL Turbo | 1080p | 0.1 credits | Fast preview / ideation |
| `cinema` | Flux.1 → Kling 3.0 | 8K | 1.0 credit | Final cinematic delivery |
| `exploration` | SDXL + Genspark AI | 1080p | 0.5 credits | Style variations / creative branching |

---

## Multi-Agent Pipeline

```
Input (prompt + optional images)
        │
        ▼
┌─────────────────────────────┐
│  1. Director Agent          │  Claude 3.5 Sonnet
│  Parse → structured scene   │  → scene_geometry.json
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  2. Cinematographer Agent   │  Camera paths, shot list
│  Motion profiles per mode   │  → camera_path.json
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  3. Visual Stylist Agent    │  HDRI, LUT, LoRA selection
│  Material + lighting params │  → diffusion_params.json
└─────────────────────────────┘
        │
        ▼ (Cinema: enrich | Exploration: branch)
┌─────────────────────────────┐
│  4. Creative Expansion      │  Genspark AI
│  Variations / enrichment    │  → N parallel branches
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  5. Keyframe Generation     │  Flux.1 Pro / SDXL Turbo
└─────────────────────────────┘
        │ (Cinema mode only)
        ▼
┌─────────────────────────────┐
│  6. Video Generation        │  Kling 3.0
│  Cinematic clips + motion   │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  7. Post-Production Agent   │  LUT · DOF · Audio · Brand
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│  8. Auto-QA                 │  CLIP · Optical Flow · Style
│  4-layer quality gate       │  → Pass or HITL flag
└─────────────────────────────┘
        │
        ▼
   Final Delivery (S3 + CloudFront)
```

---

## Security Architecture

| Layer | Implementation |
|-------|---------------|
| **Transport** | TLS 1.3, HSTS (1yr + preload), HTTPS-only |
| **Headers** | Helmet (CSP, X-Frame, noSniff, referrer) |
| **Authentication** | JWT HS256 (15min), refresh rotation (7d), httpOnly cookies |
| **Token revocation** | Redis blacklist (JTI-based, 7d TTL) |
| **Passwords** | bcrypt PBKDF2 (12 rounds), account lockout after 5 fails |
| **Encryption at rest** | AES-256-GCM field-level (prompts, style notes), PBKDF2 key derivation, key versioning |
| **S3 data** | SSE-S3 (default) or SSE-KMS with customer-managed CMK |
| **Request signing** | HMAC-SHA256 for Kling 3.0 + Genspark API calls |
| **CORS** | Strict origin whitelist, 24h preflight cache |
| **Rate limiting** | Global: 100/15min; Auth: 10/15min; Generate: 20/15min |
| **Input validation** | express-validator + Pydantic, field-level sanitisation |
| **Injection prevention** | XSS clean, HPP, mongo sanitise |
| **Internal service auth** | X-Internal-Secret header (gateway ↔ orchestrator) |
| **Dependency isolation** | Non-root Docker users (UID 1001), read-only secrets mount |

---

## Environment Variables

See [`.env.example`](.env.example) for the full reference.

**Minimum required for local dev:**
```env
JWT_SECRET=<32+ char random>
ENCRYPTION_KEY=<32+ char random>
HMAC_SECRET=<32+ char random>
ORCHESTRATOR_INTERNAL_SECRET=<32+ char random>
```

**AI API keys (add progressively):**
```env
ANTHROPIC_API_KEY=sk-ant-...     # Director Agent (Claude 3.5 Sonnet)
KLING_API_KEY=...                # Video generation
GENSPARK_API_KEY=...             # Creative expansion
REPLICATE_API_TOKEN=r8_...       # SDXL / Flux keyframes
GOOGLE_API_KEY=...               # Gemini scene analysis
```

---

## Performance Recommendations

### GPU Queue
- Deploy Kafka with 3 partitions: Cinema (P0), Pro (P1), Draft (P2)
- NVIDIA GPU Operator on Kubernetes (GKE/EKS) for auto-scaling
- Cinema jobs timeout at 5 minutes with 3 retry attempts

### Caching Strategy
- Job status: 5s TTL (near-real-time)
- Project listings: 60s TTL
- Style presets: 1hr TTL
- User profiles: 5min TTL

### CDN
- CloudFront distribution for S3 assets
- Signed URLs with 1hr expiry for private outputs
- Public CDN for style preset thumbnails

### Database Indexes (Firestore)
```
users:          email (unique), role
projects:       userId + createdAt (composite)
jobs:           projectId + createdAt, userId + status
refresh_tokens: userId (for batch revocation)
```

### Cold Storage
- S3 lifecycle policy: transition to Glacier after 90 days
- Archive manually via `storageService.archiveToGlacier(key)`

---

## File Structure

```
backend/
├── gateway/
│   ├── server.js              # Express app + bootstrap
│   └── routes/
│       ├── auth.routes.js     # /auth endpoints
│       ├── projects.routes.js # /projects + SSE stream
│       ├── generate.routes.js # /generate endpoints
│       ├── upload.routes.js   # /upload endpoints
│       └── admin.routes.js    # /admin endpoints
├── services/
│   ├── auth/
│   │   └── auth.service.js    # JWT, bcrypt, refresh rotation
│   ├── projects/
│   │   └── projects.service.js # CRUD + job lifecycle
│   ├── queue/
│   │   └── queue.service.js   # Kafka producer + DLQ + retry
│   ├── render-router/
│   │   └── render-router.service.js # Mode routing + job spec
│   ├── qa/
│   │   └── qa.service.js      # 4-layer Auto-QA
│   └── storage/
│       └── storage.service.js # S3 + CloudFront + local fallback
├── ai-orchestrator/
│   ├── main.py                # FastAPI service (8001)
│   ├── agents/
│   │   ├── director.agent.js          # Claude 3.5 → scene JSON
│   │   ├── cinematographer.agent.js   # Camera paths
│   │   ├── visual-stylist.agent.js    # HDRI + LUT + LoRA
│   │   ├── creative-expansion.agent.js # Genspark AI
│   │   └── post-production.agent.js   # LUT + audio + brand
│   ├── clients/
│   │   ├── kling.client.js    # Kling 3.0 API (circuit breaker)
│   │   └── genspark.client.js # Genspark AI API
│   └── workflows/
│       └── generation.workflow.js # LangGraph-style stateful pipeline
├── shared/
│   ├── crypto/
│   │   └── encryption.js      # AES-256-GCM + HMAC
│   ├── middleware/
│   │   ├── security.js        # Helmet, CORS, rate limit stack
│   │   └── auth.middleware.js # JWT verify + RBAC + credits
│   ├── utils/
│   │   └── logger.js          # Winston structured logger
│   └── validators/
│       └── schemas.js         # express-validator schemas
├── config/
│   └── constants.js           # Platform constants
├── Dockerfile.gateway
├── Dockerfile.orchestrator
├── docker-compose.yml
├── requirements.txt
├── package.json
└── .env.example
```

---

## Additional Considerations

### Resilience
- **Circuit breakers** on all external AI API clients (Kling, Genspark)
- **Exponential backoff** with jitter on retries
- **In-memory fallback queue** when Kafka is unavailable
- **Graceful shutdown** on SIGTERM with 30s drain window

### Observability
- **Prometheus metrics** on `/metrics` (gateway + orchestrator)
- **Structured JSON logs** (Winston + structlog) with request correlation IDs
- **Health endpoints** at `/health` with service status aggregation
- **Kafka UI** on port 8080 for queue operations visibility

### Scalability
- **Horizontal scaling**: Gateway and Orchestrator are stateless — deploy N replicas
- **Kubernetes HPA**: scale on GPU queue depth metric
- **Partitioned Kafka**: separate queues for Cinema/Pro/Draft workloads

### Future Enhancements
1. Temporal.io integration for durable workflow state persistence
2. Pinecone vector search for style similarity retrieval
3. Real-time CLIP model inference service for accurate QA scores
4. WebSocket upgrade for sub-second job status updates
5. Multi-region CloudFront distribution for global delivery latency
6. Stripe integration for credit purchase + usage billing

---

*DesignOS v1.1.0 — 2026 Bluebird. Powered By DesignOS.*
