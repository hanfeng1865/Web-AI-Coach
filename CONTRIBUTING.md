# Contributing to Web AI Coach

Thanks for helping make Web AI Coach better. This project is a lightweight Chrome extension, so the default rule is: keep changes small, native, and easy to inspect.

## Development Setup

1. Fork and clone the repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable Developer mode.
4. Click "Load unpacked" and select the repository root folder.
5. Reload the extension after changing `manifest.json`, `src/background.js`, or other extension entry files.

## Local Checks

Run these before opening a pull request:

```bash
npm test
npm run check
```

## Coding Principles

- Prefer native JavaScript and CSS before adding dependencies.
- Keep modules decoupled, so features can be changed or removed without touching unrelated flows.
- Add graceful fallbacks for network failures, missing settings, invalid user input, and unavailable extension runtime APIs.
- Use clear Chinese `console.log` messages for important runtime checkpoints, because the primary debugging surface is the browser console.
- Do not commit API keys, tokens, local data, generated release archives, or personal documents.

## Pull Request Checklist

- Describe the user-facing change.
- Mention edge cases you considered.
- Include screenshots or short recordings for UI changes when practical.
- Confirm `npm test` and `npm run check` pass.
