<p align="center">
  <img src="docs/logo.png" width="120" alt="LeMedia" />
</p>

<h1 align="center">LeMedia</h1>

<p align="center">
  Ask for a film. Watch it tonight.
  <br />
  A self-hosted request app for Radarr and Sonarr.
</p>

---

LeMedia is based on [Oscarr by Arediss and contributors](https://github.com/Arediss/Oscarr), which states it is MIT licensed. See [Oscarr contributors](OSCARR_CONTRIBUTORS.md) for upstream credits.

**LeMedia** gives your household a simple way to request movies and shows without touching the
*arr admin panels. Radarr and Sonarr stay the source of truth; LeMedia is the friendly front door,
with accounts, quality choices, notifications and a mobile-first, installable UI.

## What it does

- **Requests for Radarr & Sonarr** — multiple instances, with folder rules by genre, language,
  country, user, role or keyword (a 4K library, an anime Sonarr and a regional Radarr can coexist).
- **Quality choices for users** — SD / HD / 4K / 4K HDR mapped to *arr profiles, gated by role.
- **Sign-in your way** — email and password, Google, GitHub, Discord, Plex, Jellyfin or Emby,
  each switchable on its own, with optional Cloudflare Turnstile on the login page.
- **Know when it's ready** — Telegram, Discord, email and web push, per event type and per user.
- **Home page that keeps up** — recently added, missing movies and episodes, availability badges.
- **Watch in your app** — a "Watch in" chooser for Plezy, the Plex app, Plex web, Infuse, or a
  copied stream link.
- **Zurg / debrid friendly (optional)** — acquisition status, instant availability, duplicate
  cleanup with background swaps, broken-release repair, and a rex (Plex emulator) health page.
- **Admin dashboard** — drag-and-drop widgets, service health, backups with signed archives,
  webhook event log, setup checklist.
- **Seerr-compatible API** at `/api/v1/*` so tools that speak Overseerr / Jellyseerr (Homarr,
  Doplarr, …) work with a per-app API key.
- **Secure by default** — stored service credentials are encrypted with AES-256-GCM using a key
  derived from `LEMEDIA_SECRET_KEY`.
- **PWA** — install it on your phone's home screen. English and French included.

## Install with Docker

1. Generate the three secrets. LeMedia refuses to start with a placeholder or short value.
   **Keep `LEMEDIA_SECRET_KEY` safe** — without it, saved service passwords can't be decrypted.

   ```bash
   echo "LEMEDIA_SECRET_KEY=$(openssl rand -hex 32)"
   echo "JWT_SECRET=$(openssl rand -base64 32)"
   echo "SETUP_SECRET=$(openssl rand -base64 32)"
   ```

2. Copy `.env.example` to `.env` and paste the three values in (plus a `TMDB_API_KEY`).

3. Build and start:

   ```bash
   docker compose up -d --build
   ```

4. Open `http://<your-server>:3456` and follow the setup wizard:

   1. enter the `SETUP_SECRET` (proves you own the server),
   2. create your admin account,
   3. connect Radarr and/or Sonarr,
   4. LeMedia applies sensible defaults and scans your library — done.

   A media server (Plex, Jellyfin, Emby), notifications and everything else are optional and live
   under **Admin**.

> `network_mode: host` lets LeMedia reach Radarr and Sonarr on your local network. On macOS
> Docker Desktop containers can't reach LAN addresses even then — use a Linux host or Colima.

For bare-metal installs, development mode and every environment variable, see
[`docs/installation.md`](docs/installation.md).

## License

[MIT](LICENSE)
