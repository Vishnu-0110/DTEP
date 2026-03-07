# Digital Task Evaluation Portal

This project is a split deployment:

- `frontend`: Vite + React static app in the repository root
- `backend`: Express + MongoDB API in [`backend/`](./backend)

The frontend uses `HashRouter`, so it can be hosted on static platforms without extra SPA rewrite rules. The backend requires MongoDB, a JWT secret, and optional Gemini access for AI grading.

## Prerequisites

- Node.js 18.18+ or 20+
- npm 9+
- MongoDB Atlas connection string

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   npm --prefix backend install
   ```
2. Create environment files:
   - Copy [`.env.example`](./.env.example) to `.env.local`
   - Copy [`backend/.env.example`](./backend/.env.example) to `backend/.env`
   - For local dev, you can keep `VITE_API_URL` empty and let Vite proxy `/api` to the backend
3. Set the required backend values:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `ALLOWED_ORIGINS`
   - `GEMINI_API_KEY` if you want AI grading enabled
4. Start the backend:
   ```bash
   npm run backend:dev
   ```
5. Start the frontend:
   ```bash
   npm run dev
   ```

## Deployment Checklist

- Frontend build succeeds with `npm run build`
- Backend env passes `npm run backend:doctor`
- `ALLOWED_ORIGINS` contains the real frontend URL in production
- `UPLOAD_DIR` points to persistent storage if you need submitted files after restarts
- `GEMINI_API_KEY` is set if AI evaluation must work in production
- MongoDB Atlas network access allows the deployment environment

## Environment Variables

### Frontend

- `VITE_API_URL`: optional backend origin. Leave empty when `/api` is reverse-proxied on the same domain.
- `VITE_API_PORT`: localhost fallback port for local development. Default is `5000`.
- `VITE_DEV_PROXY_TARGET`: optional Vite-only backend target for local `/api` proxying

### Backend

- `NODE_ENV`: `development` or `production`
- `PORT`: backend port, default `5000`
- `JWT_SECRET`: required
- `MONGODB_URI`: required
- `MONGODB_DB_NAME`: optional
- `ALLOWED_ORIGINS`: comma-separated frontend origins
- `UPLOAD_DIR`: optional upload path, default `backend/uploads`
- `GEMINI_API_KEY`: optional but required for AI-assisted grading

## Verification Commands

```bash
npm run verify:deploy
node --check backend/server.js
```

## Health Endpoints

- `GET /healthz`: liveness details
- `GET /readyz`: readiness details, returns `503` until MongoDB and uploads storage are ready

## Docker

Two container definitions are included:

- [`Dockerfile`](./Dockerfile): builds and serves the frontend with Nginx
- [`backend/Dockerfile`](./backend/Dockerfile): runs the Express API

The frontend Nginx config proxies `/api/*` to a service named `backend`, which fits Docker Compose or a reverse-proxy setup.

You can also use [`docker-compose.yml`](./docker-compose.yml) for a two-container deployment with a persistent uploads volume.

## Known Deployment Risk

Submitted files are stored on the server filesystem. If you deploy the backend on ephemeral storage, existing uploads will disappear after restarts or redeploys. Use a persistent disk or move uploads to object storage before production scale.
