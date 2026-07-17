# Precedent

Precedent gives a GitHub repository memory. When a pull request merges, it captures the substance of resolved code-review discussions. When a later pull request touches a similar pattern, the bot cites the relevant precedent before the same feedback has to be repeated.

## How it works

1. **Capture:** on a merged pull request, Precedent stores each resolved, substantive review thread with its diff context, discussion, and final merged context.
2. **Surface:** on pull-request open or update, Precedent searches prior decisions. A strong, unambiguous match produces one sourced GitHub comment; otherwise it stays silent.
3. **Query:** the CLI retrieves confident, sourced answers to questions about repository conventions.

Capture happens only after merge. Unresolved threads are skipped, repositories are isolated, and surfaced matches are presented as prior experience—not as a verdict that the current code is wrong.

## Supermemory Local

[Supermemory Local](https://supermemory.ai) is the only memory and retrieval layer. Precedent adds no external LLM judge, custom embedding model, or separate vector database.

| Call | Use |
|---|---|
| `add()` | Store a resolved review thread at merge time |
| `search.documents()` | Find relevant decisions for a new or updated PR |
| `profile()` | Answer an explicit CLI query |

Every operation is scoped with `${org}_${repo}`, so knowledge cannot cross repository boundaries.

## Requirements

- A current Node.js LTS release
- A GitHub App installed on the repository
- A self-hosted Supermemory Local instance

## Setup

### 1. Install

```bash
npm install
cp .env.example .env
```

`npm install` also installs the React landing-page dependencies in `frontend/`.

### 2. Configure the GitHub App

Create a GitHub App with:

- Pull requests: read and write
- Issues: read and write
- Metadata: read-only
- Pull request events subscribed
- Webhook URL ending in `/api/webhooks/github`

Generate a private key, install the App on the target repository, and add the App ID, installation ID, webhook secret, private-key path, and bot login to `.env`. Keep the private key outside version control.

### 3. Start Supermemory Local

Use either the package command or an installed binary:

```bash
npx supermemory local
# or
supermemory-server
```

The default API URL is `http://localhost:6767`. Add the local API key to `.env` if the instance requires one. Precedent checks Supermemory during startup and exits clearly if it cannot connect.

### 4. Configure `.env`

The required values are:

```dotenv
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_PATH=
GITHUB_INSTALLATION_ID=
GITHUB_WEBHOOK_SECRET=
SUPERMEMORY_BASE_URL=http://localhost:6767
SUPERMEMORY_API_KEY=
CONFIDENCE_THRESHOLD=0.78
DASHBOARD_REPOSITORIES=owner/repo
```

Keep the retrieval profile defaults from `.env.example` unless a benchmark has justified changing them. Set `SURFACING_MODE=observe` to inspect confident matches without posting GitHub comments.

### 5. Run locally

```bash
# terminal 1: Supermemory Local
npx supermemory local

# terminal 2: forward GitHub webhooks during local development
npx smee-client -u <smee-url> -t http://localhost:3000/api/webhooks/github

# terminal 3: Precedent
npm run dev
```

Open:

- `http://localhost:3000/` — landing page
- `http://localhost:3000/dashboard` — read-only demo and retrieval inspector
- `http://localhost:3000/healthz` — backend health check

The dashboard reads captured decisions from Supermemory and surfaced comments from GitHub. It does not maintain a separate analytics database.

## Commands

```bash
npm run cli -- <owner>/<repo> "what is our convention for X?"
npm run memories:list -- <owner>/<repo>

npm test
npm run build
npm start
```

Historical ingestion is dry-run first:

```bash
npm run backfill:threads -- <owner>/<repo>
npm run backfill:threads -- <owner>/<repo> --apply
```

Evaluate retrieval changes in the isolated benchmark before enabling them:

```bash
npm run accuracy:benchmark
```

A failed promotion gate means the experimental profile must remain observe-only. Generated benchmark reports are local artifacts and are not committed.

## Deployment

Build first, then use the included PM2 configuration to keep Precedent and Supermemory Local running:

```bash
npm ci
npm run build
npx pm2 start ecosystem.config.cjs
```

## Project structure

```text
frontend/          React landing page
public/dashboard/  Read-only demo dashboard
src/ingestion/     Resolved-thread capture
src/surfacing/     Retrieval, confidence gates, and GitHub comments
src/dashboard/     Dashboard data and inspection APIs
src/evaluation/    Accuracy metrics and promotion policy
src/webhooks/      Signed GitHub webhook routing
src/cli/           Explicit repository query
src/lib/           GitHub, Supermemory, configuration, and logging
benchmarks/        Isolated retrieval evaluation corpus
scripts/           Smoke tests, replay, backfill, and demo utilities
tests/             Vitest suite
```

## License

MIT. See [LICENSE](LICENSE).
