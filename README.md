# PR Precedent

Captures resolved code review discussions when a PR merges, and surfaces relevant past decisions as a bot comment on similar new PRs — so your team stops re-litigating the same review feedback.

## How it works

1. **Ingestion** — when a PR merges, its resolved review comments/discussions are stored as memories (via [Supermemory](https://supermemory.ai)).
2. **Surfacing** — when a new PR opens, it's compared against past precedent. If a close match is found (above `CONFIDENCE_THRESHOLD`), the bot posts a comment linking to the relevant past discussion.

## Requirements

- Node.js 18+
- A GitHub App (for webhook delivery and posting comments)
- Supermemory running locally (`npx supermemory local`) or a hosted instance

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file and fill in the values:
   ```bash
   cp .env.example .env
   ```
   | Variable | Description |
   |---|---|
   | `GITHUB_APP_ID` | GitHub App ID |
   | `GITHUB_APP_PRIVATE_KEY_PATH` | Path to the App's private key (`.pem`) |
   | `GITHUB_INSTALLATION_ID` | Installation ID for the target org/repo |
   | `GITHUB_WEBHOOK_SECRET` | Secret used to verify incoming webhooks |
   | `SUPERMEMORY_BASE_URL` | Supermemory API URL (default `http://localhost:6767`) |
   | `SUPERMEMORY_API_KEY` | Supermemory API key |
   | `CONFIDENCE_THRESHOLD` | Minimum match confidence before commenting (default `0.75`) |
   | `PORT` | Port for the webhook server (default `3000`) |

   See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions.

## Usage

Run the webhook server in development:
```bash
npm run dev
```

Build and run in production:
```bash
npm run build
npm start
```

Run the CLI:
```bash
npm run cli
```

Run tests:
```bash
npm test
```

## Project structure

```
src/
  index.ts       # Server entrypoint
  cli/           # CLI commands
  ingestion/     # Captures resolved PR discussions on merge
  surfacing/     # Matches new PRs against past precedent
  webhooks/      # GitHub webhook handlers
  lib/           # Shared clients (GitHub, Supermemory, config)
  types/         # Shared types
```

## License

MIT — see [LICENSE](LICENSE).
