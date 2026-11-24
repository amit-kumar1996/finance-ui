# Personal Finance Manager web app

This folder is an independent npm project for the React, TypeScript, and Vite frontend.

## Local development

From this directory, run `npm.cmd install` in PowerShell (or `npm install` in a shell that permits npm scripts). Copy `.env.example` to `.env.local`, then run `npm.cmd run dev`. The app is served at <http://localhost:5173>.

Run `npm.cmd run lint`, `npm.cmd run type-check`, `npm.cmd test`, and `npm.cmd run build` for the frontend checks.

The API base URL is configured with `VITE_API_URL`. Do not put credentials or private tokens in frontend environment variables; Vite embeds these values in the browser bundle.
