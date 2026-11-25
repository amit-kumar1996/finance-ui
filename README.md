# Personal Finance Manager web app

This folder is an independent npm project for the React, TypeScript, and Vite frontend.

## Local development

From this directory, run `npm.cmd install` in PowerShell (or `npm install` in a shell that permits npm scripts). Copy `.env.example` to `.env.local`, then run `npm.cmd run dev`. The app is served at <http://localhost:5173>.

Run `npm.cmd run lint`, `npm.cmd run type-check`, `npm.cmd test`, and `npm.cmd run build` for the frontend checks.

The API base URL is configured with `VITE_API_URL`. Do not put credentials or private tokens in frontend environment variables; Vite embeds these values in the browser bundle.

## Passkey sign-in

Open the app at <http://localhost:5173> for local WebAuthn testing. The local API must be running with `WEB_ORIGIN=http://localhost:5173` and `WEBAUTHN_RP_ID=localhost`. Avoid using `127.0.0.1` in the browser address because the configured WebAuthn RP ID is `localhost`. In production, passkeys require HTTPS; the backend RP ID must be the shared parent domain and `WEB_ORIGIN` must exactly match the deployed frontend URL.

The first setup screen asks for the backend's one-time setup token. It is sent directly to the API and is not saved by the frontend. After initial setup, the app shows recovery codes once; save them privately before dismissing the panel. Device listing and passkey removal are available in Settings.

## Cloudflare Pages production

This repository is connected to Cloudflare Pages. Use the repository root as the Pages root directory, `npm run build` as the build command, and `dist` as the output directory. Set the production branch to `main` and define `VITE_API_URL=https://api.example.com/api/v1` in the Pages production environment, replacing the example hostname. Vite puts this URL in the public browser bundle; never set secrets there.

The public directory contains `_redirects` for React Router fallback and `_headers` for browser security headers. Before production, replace `api.example.com` in `_headers` with the exact API hostname. The CSP allows API connections only to that host. GitHub Actions run lint, type-check, tests and build on `dev` and `main`; the Git-connected Pages project publishes the production branch. Pages preview URLs are not same-site with the API and cannot be used for passkey sign-in unless a separate staging frontend/API pair is configured.
