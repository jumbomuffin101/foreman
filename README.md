# Foreman

Foreman is a distributed job queue system that combines a BullMQ + Redis execution pipeline with a Node.js/Express API, Prisma/PostgreSQL persistence, and a Next.js real-time dashboard for queue monitoring, throughput, retries, and dead-letter tracking.

## Architecture

```text
Client
  |
  v
Express API (/api/jobs)
  |
  v
BullMQ Queue (foreman-jobs) ---> BullMQ DLQ (foreman-dlq)
  |                                 ^
  v                                 |
Worker (concurrency=5, retries) ----
  |
  v
PostgreSQL (Job state + audit fields)
```

## Setup

1. Copy environment values:

```bash
cp .env.example .env
```

2. Start local infrastructure:

```bash
npm run docker:up
```

3. Run Prisma migration and generate client:

```bash
npm run db:migrate
npm run db:generate
```

4. Start API and worker in separate terminals:

```bash
npm run dev:api
npm run dev:worker
```

## API Endpoints

### Health

```bash
curl http://localhost:3001/health
```

### Submit a job

```bash
curl -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"email.send","payload":{"to":"user@example.com","template":"welcome"}}'
```

### Submit a job that intentionally fails (retry + DLQ testing)

```bash
curl -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"report.generate","payload":{"forceFail":true}}'
```

### Fetch one job by Prisma ID

```bash
curl http://localhost:3001/api/jobs/<job-id>
```

### List all jobs

```bash
curl http://localhost:3001/api/jobs
```

### List jobs filtered by status

```bash
curl "http://localhost:3001/api/jobs?status=completed"
```

## Dashboard Setup

The dashboard is a standalone Next.js app under `src/dashboard`.

1. Install dashboard dependencies:

```bash
cd src/dashboard
npm install
```

2. Ensure dashboard can reach the API (`NEXT_PUBLIC_API_URL` in root `.env.example` defaults to `http://localhost:3001`).

3. Run dashboard:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000).

## How It Works (ACWR + DLQ)

Foreman uses an ACWR-style lifecycle: **Accepted** (job created in PostgreSQL + queued in BullMQ), **Claimed** (worker marks job `active` and increments attempts), **Worked** (simulated processing), and **Resolved** (job becomes `completed` with result or `failed` with error). BullMQ retry policy is configured with exponential backoff (`attempts=3`, `delay=1000ms`). When a job fails and `attemptsMade >= attempts`, the worker treats retries as exhausted, writes the failure into `foreman-dlq`, and marks the primary PostgreSQL record as `dead`.