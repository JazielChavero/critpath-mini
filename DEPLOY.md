# Deploying CritPath Mini

The product is one Docker image (dashboard + Node API + Python AI service) plus
PostgreSQL. Two ways to run it:

| | Free demo | AWS |
|---|---|---|
| Compute | Render free web service (Docker) | One EC2 instance, Docker Compose |
| Database | Neon free tier (no card) | PostgreSQL container with a volume |
| HTTPS | Render's | Caddy, automatic certificate |
| Cost | $0 | Free-tier eligible instance; set a budget alert first |
| Caveat | Sleeps after 15 min idle, ~1 min to wake | You maintain the server |

What was tested: the app in production mode with production-only dependencies,
started by `deploy/start.sh` exactly as the container does (health check, login,
upload of a 6,977-activity schedule, metrics, AI summary), and the compose file
validated with `docker compose config`. The image itself was not built in the
development environment (no access to Docker Hub there); the first build on
Render or EC2 is the real test, and its log shows any problem.

---

## Free demo: Render + Neon

1. **Database (Neon).** Create a free project at neon.com. Copy the connection
   string (it looks like `postgresql://user:pass@ep-....neon.tech/neondb?sslmode=require&channel_binding=require`)
   and remove `&channel_binding=require` from the end.
2. **Code on GitHub.** Push this repository (sample `.xer` files and `.env` are git-ignored).
3. **Render.** New → Blueprint → pick the repository. Render reads `render.yaml`
   and asks for `DATABASE_URL` (paste the Neon string) and, optionally,
   `ANTHROPIC_API_KEY`. `JWT_SECRET` is generated for you.
4. **First user.** From your machine, against the Neon database:
   ```bash
   cd api
   DATABASE_URL="<neon string>" npm run create-user -- you@example.com
   ```
   (PowerShell: `$env:DATABASE_URL="<neon string>"; npm run create-user -- you@example.com`)
5. Open `https://<service>.onrender.com`, log in, upload a schedule.

The tables are created automatically on the first start.

---

## AWS: EC2 + Docker Compose

1. **Budget alert first.** Billing → Budgets → create a monthly cost budget
   (e.g. $5) with an email alert, so nothing runs up unnoticed.
2. **Instance.** Launch an Ubuntu LTS instance of a free-tier-eligible type.
   Security group: allow 22 (your IP only), 80 and 443 (anywhere).
3. **Install Docker** on the instance (Docker's official convenience script or
   the distribution packages) and clone the repository.
4. **Configure.** `cp deploy/.env.compose.example .env` and fill it in.
   Without a domain, use the free sslip.io name of the public IP:
   `DOMAIN=3-14-15-92.sslip.io` for `3.14.15.92`. Caddy gets the certificate.
5. **Start.** `docker compose up -d --build`
6. **First user.** `docker compose exec app sh -c "cd api && node_modules/.bin/tsx src/cli/createUser.ts you@example.com"`
7. Open `https://<DOMAIN>`.

Updates: `git pull && docker compose up -d --build`.
Backups: `docker compose exec db pg_dump -U postgres critpath > backup.sql`.

For a production setup beyond a single instance: RDS for PostgreSQL, the image in
ECR, App Runner or ECS behind an ALB, and secrets in Secrets Manager. The image and
the environment variables stay the same.

---

## Environment variables

| Variable | Where | |
|---|---|---|
| `DATABASE_URL` | app | PostgreSQL connection string |
| `JWT_SECRET` | app | ≥ 32 random characters; signs login tokens |
| `TRUST_PROXY` | app | `1` behind Render, Caddy or a load balancer (correct client IP for rate limits) |
| `ANTHROPIC_API_KEY` | app | Optional. Without it the summary uses the template |
| `AI_MODEL` | app | Default `claude-haiku-5-5` |
| `PORT` | app | Default `10000` in the image |
