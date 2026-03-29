# TrustStack

Starter SaaS UI and API for estimating whether **images** or **text** look AI-generated. Uses [Hugging Face Inference](https://huggingface.co/docs/api-inference/) when `HUGGINGFACE_ACCESS_TOKEN` is set; otherwise runs in **demo mode** (deterministic placeholder scores for UI testing only).

## Setup

```bash
cp .env.example .env.local
# Add your token from https://huggingface.co/settings/tokens (Inference Providers permission)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use **Open console** for `/dashboard`.

## API

- `POST /api/analyze/image` — `multipart/form-data` field `file` (JPEG, PNG, GIF, WebP, max 8 MB).
- `POST /api/analyze/text` — JSON `{ "text": "..." }` (max 8000 characters).

Optional env: `HF_IMAGE_MODEL`, `HF_TEXT_MODEL` (see `.env.example`).

## Deploy

Deploy on [Vercel](https://vercel.com) or any Node host; set env vars in the project settings.
