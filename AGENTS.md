# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (entry `main.tsx`, simulator UI/logic in `App.tsx`, Tailwind imports in `index.css`).
- HTML shell: `index.html`. Static assets: `public/` (served at `/` in dev/prod).
- Tooling: `vite.config.ts`, `tsconfig.json` (strict), `tailwind.config.js`, `postcss.config.js`.
- Build output: `dist/` (created by Vite; do not commit).

## Build, Test, and Development Commands
- `npm install`: install deps (Node >= 18).
- `npm run dev`: start Vite dev server with HMR at a local port.
- `npm run build`: type-check (`tsc -b`) then create production bundle in `dist/`.
- `npm run preview`: serve the built bundle locally to verify production output.

## Coding Style & Naming Conventions
- Language: TypeScript + React 18 (function components + hooks).
- Types: `strict` enabled; avoid `any`; prefer explicit props/types.
- Files: components `.tsx`; utilities `.ts`. Component names in PascalCase, variables/functions in camelCase. Example: `MonitorCanvas.tsx`, `useShockLogic.ts`.
- Formatting: 2‑space indent. Tailwind classes are encouraged for styling; keep semantic grouping (layout → color → effects).

## Testing Guidelines
- No test runner is configured yet. If adding tests, prefer Vitest + React Testing Library.
- Location: co-locate as `*.test.ts(x)` next to source or under `src/__tests__/`.
- Suggested scripts: add `"test": "vitest"` and (optionally) `"test:watch": "vitest --watch"`.

## Commit & Pull Request Guidelines
- Commits: keep small and focused; prefer Conventional Commits when possible.
  - Examples: `feat(sim): add sync markers`, `fix(canvas): correct height calc`, `chore: update deps`.
- PRs: include a clear description, rationale, and scope; link related issues; add before/after screenshots or a short clip for UI changes; note any follow‑ups.
- Verify locally before opening PR: `npm run build` and manual smoke‑test via `npm run preview`.

## Security & Configuration Tips
- Do not store secrets in the repo; Vercel configuration belongs in the dashboard (build command `npm run build`, output `dist`).
- Keep assets lightweight in `public/`. This simulator is educational only; avoid real patient data.

