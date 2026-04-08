# Trial Server

This server provides two things for the extension:

1. A free-trial quota endpoint with a default limit of `15` requests per install.
2. A proxy layer that forwards chat-completion requests to your upstream model provider, so your real API key never lives inside the extension.

## Endpoints

- `GET /api/trial/status?installId=...`
- `POST /api/trial/chat`

The extension expects the trial base URL to look like:

```text
https://your-domain.com/api/trial
```

So the actual request URLs become:

- `https://your-domain.com/api/trial/status`
- `https://your-domain.com/api/trial/chat`

## Environment Variables

```powershell
$env:PORT="3030"
$env:TRIAL_MAX_REQUESTS="15"
$env:TRIAL_UPSTREAM_URL="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
$env:TRIAL_UPSTREAM_MODEL="qwen-vl-max-latest"
$env:TRIAL_UPSTREAM_API_KEY="your-real-api-key"
```

Optional:

```powershell
$env:TRIAL_STORE_FILE="D:\\AI\\codex\\AI coach\\server\\data\\trial-usage.json"
```

## Run Locally

```powershell
$env:TRIAL_UPSTREAM_API_KEY="your-real-api-key"
node .\server\index.mjs
```

Then set the extension's `体验服务地址` to:

```text
http://localhost:3030/api/trial
```

## Production Notes

- Replace the local URL with your real deployed domain before publishing.
- Keep `TRIAL_UPSTREAM_API_KEY` only on the server.
- Add basic rate limiting before inviting real users.
- Move the usage store from a local JSON file to Redis or a database when traffic grows.

## Deploy To Vercel

This repo now includes Vercel serverless entrypoints:

- [api/trial/status.mjs](D:/AI/codex/AI coach/api/trial/status.mjs)
- [api/trial/chat.mjs](D:/AI/codex/AI coach/api/trial/chat.mjs)
- [vercel.json](D:/AI/codex/AI coach/vercel.json)

Before deploying to Vercel, add these environment variables in the Vercel project:

```text
TRIAL_UPSTREAM_API_KEY=your-real-api-key
TRIAL_UPSTREAM_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
TRIAL_UPSTREAM_MODEL=qwen-vl-max-latest
TRIAL_MAX_REQUESTS=15
```

For persistent quota tracking on Vercel, also add a Redis-compatible REST store.
The easiest option is Upstash Redis. Add:

```text
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

If you skip Redis for now, the Vercel deployment can still run in demo mode, but free-trial counts will be memory-only and may reset between invocations.

After deployment, your extension's `体验服务地址` should be:

```text
https://your-vercel-domain.vercel.app/api/trial
```
