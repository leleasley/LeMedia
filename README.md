# MediaOps (MVP)

This is a **single web app** that:
- Browses/searches TMDB with posters/backdrops
- Shows TV seasons/episodes
- Can **request a specific set of episodes** (Sonarr) or a movie (Radarr)
- Shows basic Sonarr/Radarr status + logs
- Uses **header-based auth** (works cleanly behind Authelia/Authentik/Caddy forward_auth)

## Why header-based auth?
Because it’s boring, robust, and fits your homelab reality: you already have SSO-ish auth at the reverse proxy layer.
The app refuses access unless the trusted headers are present (or you enable DEV_USER).

## Requirements
- Docker (compose in Portainer is fine)
- A TMDB API key (v3 key)
- Sonarr + Radarr API keys
- Reverse proxy (Caddy) doing auth (Authelia or similar)

## Quick start (Docker)
1) Put this project at:
   `/opt/LeMedia`

2) Copy `.env.example` to `.env` and fill it in.
   (The real `.env` is ignored so credentials stay local.)

3) Deploy the compose:
   `docker compose up -d --build`

4) Put it behind your Caddy with forward_auth (example below).

### Faster rebuilds / less disk usage

- If you only changed runtime config in `.env` (URLs, API keys, DB string), you **do not need to rebuild**:
  - `docker compose up -d`
- Only use `--build` when you changed code or dependencies:
  - `docker compose up -d --build`

If disk usage grows over time, it’s usually Docker build cache:
- `docker builder prune -af` (build cache)
- `docker image prune -af` (unused images)

## Caddy snippet (Authelia forward_auth)
The important part is: pass `Remote-User` and `Remote-Groups` to the app.
Your forward_auth snippet likely already does `copy_headers`. If so, you’re done.

Example site:

```
mediaops.leleasley.uk {
  import auth
  reverse_proxy 10.77.77.250:3010
}
```

## Notes on Sonarr episode requests
Sonarr supports looking up a series directly via `tvdb:<id>` in series lookup. (We pull tvdb_id from TMDB external IDs first.)
This makes the "request specific episodes" workflow possible. 
See Sonarr forum mention of `tvdb:12345` lookup. 
