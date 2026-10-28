# RED vs BLUE — TikTok LIVE game

Two-team auto-battler for TikTok LIVE (vertical 9:16). Viewers type `แดง` / `น้ำเงิน` in chat to join, own a persistent soldier, level it with hearts and fighting, pick a class at Lv.10 (`1` Knight · `2` Archer · `3` Mage · `4` Assassin) and turn gifts into **Bonus Stats + Aura** that are applied *after* each match with a cutscene queue. Design doc: [docs/DESIGN.md](docs/DESIGN.md).

The game is a **web page** (Three.js + KayKit CC0 models) that you capture in OBS / TikTok LIVE Studio as a 1080×1920 browser source. A small Node server stores progress in Postgres and fans out viewer events.

```
TikTok LIVE ─ bridge (your PC) ─▶ POST /api/ingest ─▶ server (Node + Postgres) ─SSE─▶ /game.html (OBS)
Simulator (Operator panel) ──────────────────────────▲                         ◀─ match commit ─┘
```

## Run locally
```bash
npm ci
tools/dev-postgres.sh start            # local Postgres on :5545 (or set DATABASE_URL to Neon)
DATABASE_URL=postgresql://postgres@localhost:5545/redblue npm start
```
The console prints `OPERATOR_TOKEN` / `CHANNEL_TOKEN` if you did not set them (put them in `.env`, see `.env.example`).
1. Open `http://localhost:3000/operator.html`, enter the operator token → it shows the game URL.
2. Open that URL (`/game.html?token=…`) — or add it to OBS as a **Browser source, 1080×1920**, audio off.
3. In the operator panel press **Spawn crowd**, then **Gift storm / Likes / Class picks** to play the full loop without TikTok.

## Real TikTok LIVE (unverified — see below)
```bash
npm run bridge -- --user @yourname --server https://YOUR-APP.onrender.com --token <CHANNEL_TOKEN>
```
Run it on your own PC while you are LIVE. It uses the **unofficial** `tiktok-live-connector` (needs the creator to be live; uses a third-party sign server, an optional `EULER_SIGN_API_KEY` raises limits). Event mapping is unit-tested against the library's types, but **no real LIVE connection was run during development.** If it breaks, replace `adapters/tiktok-live-connector.js` (e.g. with TikTok's official API) — everything else only sees the normalized events in `shared/events.js`.

## Deploy (Render + Neon)
`render.yaml` is included: create a Neon database, set `DATABASE_URL`, deploy. Free Render instances sleep when idle — open `/healthz` before going LIVE (or use a paid plan). Not deployed/tested on Render/Neon in development (tested against local Postgres 16).

## Tuning the numbers
Every number is in `config/balance.js` (stats, EXP, class multipliers, skills, aura tiers, bonus lifetime `permanent|season`, post-match timings, `gifts.enabled` policy switch).
`npm run sim` runs the headless Combat Simulation (win-rate / duration / base-kill matrices); `tools/tune.mjs` is the balance helper. Current values are **placeholders** — class balance in particular is rough.

## Performance — you must check on your streaming PC
Open `/stress.html?n=300&cap=100` on the streaming machine (sliders: units, fully-animated cap). Sandbox figures (software GL, so only structure counts): 300 units ≈ 620 draw calls / 1.3 M triangles, simulation 0.3 ms/tick at 500 units, 2 ms at 2000. If FPS is low lower `cap` (units beyond it lose weapons and animate every 3rd frame) or the player count.

## Tests
`npm test` (unit) · `TEST_DATABASE_URL=… npm run test:api` · `TEST_DATABASE_URL=… npm run test:e2e` (headless Chromium, 40 simulated viewers, full match + cutscenes + DB checks).

## What is NOT verified
- Real TikTok connection and per-user Like data in practice · FPS on real hardware · Render/Neon deployment · the TikTok policy question below.
- **Policy:** binding gifts to in-game benefits and using an unofficial connector may conflict with TikTok's terms/LIVE rules. Check before going public; `gifts.enabled=false` in `config/balance.js` turns gift benefits off. No gambling/prizes tied to results.
- Likes: the connector reports a per-user `likeCount`; if it ever only gives team totals, do not present it as individual EXP.

## Privacy
Stored: TikTok user id, nickname, avatar URL and game stats. Delete a viewer with `DELETE FROM players WHERE user_id = '…'` (cascades).

## Credits
KayKit Character Pack Adventurers / Skeletons by Kay Lousberg, CC0 (`public/assets/CREDITS.txt`). Three.js (MIT).
