# STREETVERSE

**Live:** https://streetverse-devs-projects-deb15629.vercel.app · **Repo:** https://github.com/basgenix4u/streetverse (public)

A Lagos street-life game. Explore a 3D city at golden hour, run courier shifts through traffic, earn fictional naira, and build your story — all in the browser.

**This is a game.** All money is fictional naira. No real-money purchases, no cash-out.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Three.js** — two hand-built WebGL scenes: the explorable city (`src/game/explore.tsx`) and the courier-shift runner (`src/game/shift.tsx`)
- **Tailwind CSS 4** — all styling in `src/app/globals.css`
- **PostgreSQL + Drizzle** — currently only backing `/api/health`; all game progress is stored locally in the browser (`localStorage`)

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional — point at a Postgres database to make `/api/health` report `{"ok":true}`:

```bash
cp .env.example .env.local   # set DATABASE_URL
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (typechecks as part of the build) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Push the Drizzle schema (needs `DATABASE_URL`) |

## Performance notes

The game is tuned to stay smooth at 60fps on desktop **and** mobile:

- **Lazy 3D chunks** — three.js (~650 KB) is code-split: the React shell hydrates first, and the city/runner modules download only when a game mode mounts (`next/dynamic`, `ssr: false`).
- **Device-aware rendering** — MSAA antialiasing is disabled on small screens, the pixel ratio is capped per quality tier (low 1× / medium 1.25–1.5× / high 1.5–2×), and shadow filtering drops from PCFSoft to plain PCF below the "high" quality setting. Quality defaults to medium on phones.
- **Pause-aware rendering** — the city skips GPU renders while a modal pauses the world; the runner only animates its scene while mounted.
- **Cheaper glass on mobile** — backdrop blur over the WebGL canvas is halved below 760px.
- **System font stack** — no webfont downloads at all.
- **Compressed responses** — `compress: true` in `next.config.ts`.
- **Security headers** — HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` on every route.

## Without a database

The app is fully playable with no `DATABASE_URL` — progress lives in the browser. `/api/health` then responds `{"ok":false}` (HTTP 500) and the import layer never throws, so the game keeps serving.

To enable the database on Vercel: **Storage → Create Database → Postgres**, then set `DATABASE_URL` to the non-pooling connection string (`POSTGRES_URL_NON_POOLING`).

## License

MIT — see [LICENSE](LICENSE).
