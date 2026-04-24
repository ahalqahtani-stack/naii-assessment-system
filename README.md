# NAII Assessment System
نظام إدارة المؤشر الوطني للذكاء الاصطناعي
المركز الوطني للتعلم الإلكتروني (NeLC)

## Requirements
- Docker & Docker Compose

## Quick Start
cp .env.example .env
docker compose up -d

## Architecture
- server.js — Express API (26 endpoints)
- public/index.html — SPA Frontend
- public/data/ — JSON reference data (questions, structure, departments)
- db/migrations.sql — PostgreSQL schema (9 tables)
- nginx/default.conf — Reverse proxy + gzip
- uploads/ — Uploaded evidence files
- Dockerfile + docker-compose.yml — Docker deployment

## API Endpoints
- POST /api/auth/login — Login
- GET/PUT /api/assessment — Assessment data
- GET/PUT /api/domains — Domain assignments
- GET/PUT /api/plan — Plan data
- GET /api/evidence — Evidence list
- POST /api/evidence/upload — Upload file
- PUT /api/evidence/:id/approve — Approve evidence
- PUT /api/evidence/:id/reject — Reject evidence
- GET/POST/PUT/DELETE /api/users — User management
- GET/PUT /api/notifications — Notifications
- GET /api/export — Export all data
- GET /api/health — Health check

## Tech Stack
- Frontend: Vanilla JS SPA (RTL Arabic)
- Backend: Node.js 20 + Express
- Database: PostgreSQL 15
- Proxy: Nginx
- Deploy: Docker Compose

## Developed by
إدارة البنية المؤسسية — المركز الوطني للتعلم الإلكتروني
