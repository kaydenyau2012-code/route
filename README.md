# Backrooms Online

A browser-playable Backrooms game with a WebSocket multiplayer server.

## Run it locally

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000` in your browser.

Click **Multiplayer** in the game. One player hosts a room and shares the 4-digit code; friends open the same website and join with that code. Rooms support up to 4 players.

## Put it online

Deploy this folder as a Node.js web service on a host that supports persistent WebSocket connections (for example, Render or Railway).

- Build command: `npm install`
- Start command: `npm start`
- The server listens on the hosting provider's `PORT` environment variable.
- Share the deployed HTTPS website address with friends. The game automatically connects to its `/ws` WebSocket endpoint (WSS on HTTPS).

Do not open `public/index.html` directly with `file://` for online multiplayer. Use the local server or deployed website.

## Multiplayer notes

- The host creates a four-digit room code.
- Up to 4 players can join one room.
- The host starts the shared maze and chooses co-op or race mode.
- Player movement, race-mode shots, player events, and host admin spawn commands are relayed through the server.
- Each player's entities and local game simulation remain client-side, matching the game's existing multiplayer design.

## Files

- `public/index.html` — game client (original embedded pixel font retained; title/subtitle have enhanced glitch animation)
- `server.js` — HTTP static server and WebSocket room relay
- `package.json` — dependencies and start script
- `test/` — basic server source checks


## Render deployment

This repository is arranged with `package.json`, `server.js`, and `render.yaml`
at the repository root, and the game page at `public/index.html`.

When creating the Render service, use **New → Blueprint** and select this
repository, or create a **Web Service** with:
- Root Directory: leave blank
- Build Command: `npm install && npm test`
- Start Command: `npm start`

Do not set the Root Directory to `public`; the Node server serves
`public/index.html` from the repository root and also provides the `/ws`
WebSocket endpoint required for multiplayer.


## Health check

The server also exposes `GET /health` (and `/healthz`) which returns HTTP
200 with `ok`. If your hosting dashboard has a health-check path setting,
set it to `/health`. Keep the service's public HTTP port mapped to the
`PORT` environment variable; the server binds to `0.0.0.0`.
