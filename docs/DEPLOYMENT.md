# Deployment Strategy

This document covers deployment for development, staging, and production environments.

---

## Environment Overview

| Environment | Backend | Frontend | Database | VLM |
|---|---|---|---|---|
| **Development** | Uvicorn (local) | Next.js dev server | Local/Mock MongoDB | Ollama (optional) |
| **Staging** | Uvicorn + Nginx | Next.js build | MongoDB Atlas | Ollama / vLLM |
| **Production** | Uvicorn + Nginx + Gunicorn | Next.js build + CDN | MongoDB Atlas (M10+) | vLLM (GPU server) |

---

## Development Deployment

Already covered in [INITIAL_SETUP.md](./INITIAL_SETUP.md) and [QUICK_START.md](./QUICK_START.md).

Quick summary:
```bash
# Terminal 1 — Backend
cd authentiq-app/backend && venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd authentiq-app/frontend
npm run dev

# Terminal 3 — Celery Worker (optional)
cd authentiq-app/backend && venv\Scripts\activate
celery -A app.core.celery_app worker --loglevel=info
```

---

## Production Deployment

### 1. Environment Variables for Production

Create a production `.env` with secure values:

```env
# ── CRITICAL SECURITY SETTINGS ─────────────────────────────────────
SECRET_KEY=<openssl-rand-hex-32>          # NEVER use the default
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/authentiq_db
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
FRONTEND_BASE_URL=https://yourdomain.com

# ── VLM ────────────────────────────────────────────────────────────
AUTHENTIQ_VLM_ENABLED=true
AUTHENTIQ_VLM_API_URL=http://gpu-server:8000/v1/chat/completions
AUTHENTIQ_VLM_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
AUTHENTIQ_VLM_FAIL_MODE=closed
AUTHENTIQ_VLM_MAX_IMAGES=12

# ── Redis ──────────────────────────────────────────────────────────
REDIS_URL=redis://redis-host:6379/0

# ── Email ──────────────────────────────────────────────────────────
SMTP_ENABLED=true
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<sendgrid-api-key>
```

### 2. Backend — Gunicorn + Uvicorn Workers

```bash
# Install Gunicorn
pip install gunicorn

# Production startup
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --keep-alive 5 \
  --log-level info
```

> **Worker Count:** Use `2 * CPU_cores + 1` workers. For AI-heavy workloads, keep it lower (2–4) since CLIP/YOLO are memory-intensive.

### 3. Frontend — Production Build

```bash
cd authentiq-app/frontend

# Set production environment
echo "NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com" > .env.production

# Build
npm run build

# Start (or use a process manager like PM2)
npm start
```

### 4. Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/authentiq

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Static files from backend
    location /static/ {
        proxy_pass http://localhost:8000/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Upload size limit (for product image uploads)
    client_max_body_size 50M;
}
```

### 5. Process Management (PM2)

Use PM2 to manage all services:

```bash
npm install -g pm2

# Create ecosystem.config.js
```

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'authentiq-backend',
      cwd: './authentiq-app/backend',
      script: 'gunicorn',
      args: 'app.main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 120',
      interpreter: './venv/bin/python',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'authentiq-frontend',
      cwd: './authentiq-app/frontend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'authentiq-celery',
      cwd: './authentiq-app/backend',
      script: './venv/bin/celery',
      args: '-A app.core.celery_app worker --loglevel=info --concurrency=2',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # Auto-start on system boot
```

### 6. Docker Deployment

Below is a minimal Docker setup. Create `docker-compose.yml` in the project root:

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    ports:
      - "27017:27017"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped

  backend:
    build: ./authentiq-app/backend
    ports:
      - "8000:8000"
    env_file:
      - ./authentiq-app/backend/.env
    volumes:
      - ./authentiq-app/backend/static:/app/static
    depends_on:
      - mongodb
      - redis
    restart: unless-stopped

  celery:
    build: ./authentiq-app/backend
    command: celery -A app.core.celery_app worker --loglevel=info
    env_file:
      - ./authentiq-app/backend/.env
    depends_on:
      - redis
      - mongodb
    restart: unless-stopped

  frontend:
    build: ./authentiq-app/frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_BASE_URL=http://backend:8000
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  mongo_data:
```

**Dockerfile for backend** (`authentiq-app/backend/Dockerfile`):

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Dockerfile for frontend** (`authentiq-app/frontend/Dockerfile`):

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
RUN npm ci --only=production
EXPOSE 3000
CMD ["npm", "start"]
```

---

## VLM Deployment (GPU Server)

### Recommended Hardware

| Model Size | GPU VRAM | Expected Latency |
|---|---|---|
| Qwen2.5-VL-7B | 16 GB | 3–8 seconds/scan |
| Qwen2.5-VL-32B | 48 GB | 8–20 seconds/scan |
| Qwen2.5-VL-72B | 80+ GB (multi-GPU) | 15–40 seconds/scan |

### vLLM Production Setup

```bash
# Recommended: run on a separate GPU instance
pip install "vllm>=0.6.3"

vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
  --port 8001 \
  --limit-mm-per-prompt image=12 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --tensor-parallel-size 1   # Increase for multi-GPU
```

Point backend at it:
```env
AUTHENTIQ_VLM_API_URL=http://<gpu-server-ip>:8001/v1/chat/completions
```

---

## Database — MongoDB Atlas Production

### Recommended Configuration

- **Tier:** M10 minimum (M30+ for production scale)
- **Backup:** Enable continuous backups
- **Indexes:** All indexes are created automatically at startup by `app/core/db.py`
- **Network:** Whitelist only your backend server IPs

### Connection String Format

```env
DATABASE_URL=mongodb+srv://authentiq_user:password@cluster0.xxxxx.mongodb.net/authentiq_db?retryWrites=true&w=majority
```

---

## SSL/TLS — Let's Encrypt (Certbot)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (runs automatically via cron)
sudo certbot renew --dry-run
```

---

## Security Checklist for Production

- [ ] Set a strong `SECRET_KEY` (never use the default)
- [ ] Set `AUTHENTIQ_VLM_DEV_MOCK=false` (must be false in production)
- [ ] Set `AUTHENTIQ_VLM_FAIL_MODE=closed`
- [ ] Configure `ALLOWED_ORIGINS` to only your production domains
- [ ] Enable HTTPS with a valid certificate
- [ ] Set up MongoDB authentication and network restrictions
- [ ] Enable Redis password (`requirepass` in redis.conf)
- [ ] Run `bandit -r app/` and fix all HIGH severity findings
- [ ] Run `safety check -r requirements.txt` for dependency vulnerabilities
- [ ] Set `ACCESS_TOKEN_EXPIRE_MINUTES=60` (default is already 1 hour)
- [ ] Configure `client_max_body_size 50M` in Nginx for image uploads
- [ ] Enable MongoDB Atlas backups
- [ ] Set up application-level logging to a centralized log service

---

## Monitoring

### Health Check Endpoint

```bash
GET /health
# {"status":"healthy","ai":{"loaded":true},"yolo":{"loaded":true}}
```

Recommended to monitor with:
- UptimeRobot / BetterUptime (external HTTP monitor)
- Prometheus + Grafana (metrics)
- Sentry (error tracking — add `sentry-sdk[fastapi]` to requirements)

### Log Locations

| Log Type | Location |
|---|---|
| Backend app logs | stdout (captured by PM2 / Docker) |
| Verification debug | `%TEMP%\authentiq_verification.log` (dev) |
| Celery task logs | stdout of Celery worker process |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx error | `/var/log/nginx/error.log` |
