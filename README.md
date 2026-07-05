# Spec2Mesh

Open-source AI studio for turning natural-language specs, photos, and dimensions into printable 3D models (STL). Powered by a multi-agent swarm that handles specification, dimension calculation, art direction, geometry generation, and validation.

## How it works

1. User describes a model (and optionally uploads reference photos)
2. Four internal agents — spec, calculation, art/manufacturing, geometry — build a validated model spec in parallel
3. The geometry engine converts the spec into a JSCAD mesh and exports STL
4. Three.js renders an interactive preview in the browser

The frontend is a Next.js 19 / React 19 app deployed on Cloudflare via [vinext](https://github.com/nicholasgasior/vinext). The AI backend runs through a **bridge server** (`bridge/server.mjs`) that wraps the [OpenAI Codex CLI](https://github.com/openai/codex).

## Prerequisites

- Node.js ≥ 22.13.0
- [OpenAI Codex CLI](https://github.com/openai/codex) installed and authenticated (`codex` on PATH)

## Setup

```sh
git clone https://github.com/mevoracha1001/3d-model-gen
cd spec2mesh
npm install
cp .env.example .env
```

Edit `.env`:

```env
CODEX_BRIDGE_URL=http://127.0.0.1:8788
DEV_AUTH_EMAIL=you@example.com   # skips ChatGPT auth in dev
DEV_AUTH_NAME=Your Name
```

## Running locally

**Terminal 1 — AI bridge:**

```sh
npm run bridge
```

**Terminal 2 — Next.js dev server:**

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Auth

In production (deployed on ChatGPT / OpenAI Sites), auth is handled automatically via `oai-authenticated-user-email` headers injected by the platform. Locally, set `DEV_AUTH_EMAIL` and `DEV_AUTH_NAME` in `.env` to bypass auth.

## Building

```sh
npm run build
```

Requires [vinext](https://github.com/nicholasgasior/vinext) and a Cloudflare-compatible environment for deployment. For local builds without Cloudflare, see the vinext docs.

## Testing

```sh
npm test
```

Runs unit tests for the geometry engine and bridge contract.

## Project structure

| Path | Purpose |
|------|---------|
| `app/` | Next.js app (UI, API routes) |
| `app/api/brain/route.ts` | Multi-agent orchestration endpoint |
| `app/api/model/route.ts` | STL generation endpoint |
| `bridge/server.mjs` | Local Codex CLI bridge server |
| `src/printable-model.mjs` | Geometry engine (JSCAD) |
| `src/codex-bridge-contract.mjs` | Prompt builder and response normalizer |
| `worker/index.ts` | Cloudflare Worker entry point |

## License

MIT — see [LICENSE](LICENSE).
