# Telegram Login Setup (OIDC)

This guide explains how self-hosted users can enable **Log In with Telegram** in LeMedia.

## What you need

- A Telegram bot created via `@BotFather`
- Your LeMedia public URL (for example: `https://media.example.com`)
- Admin access to LeMedia

## 1) Create or choose your bot

In Telegram, open `@BotFather` and create a bot (or use an existing one).

You should have:
- `TELEGRAM_BOT_TOKEN` (for bot features)
- Bot username (for `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`)

Optional but recommended:
- Set the bot/app icon in BotFather to one of your hosted LeMedia logos:
  - `${APP_BASE_URL}/icon-512.png`
  - `${APP_BASE_URL}/icon-1024.png`
  - Example: `https://media.example.com/icon-512.png`

LeMedia cannot force the icon automatically; Telegram requires setting it in BotFather.

## 2) Configure Web Login / OIDC in BotFather

In `@BotFather`:

- Open your bot
- Go to **Bot Settings** -> **Web Login**
- Add allowed URLs:
  - Your site origin (example: `https://media.example.com`)
  - OAuth callback URL:
    - `https://media.example.com/api/auth/oauth/telegram/callback`
  - App icon URL (recommended): `https://media.example.com/icon-512.png`

BotFather will provide:
- **Client ID**
- **Client Secret**

## 3) Configure Telegram in LeMedia

In LeMedia admin UI:

- Go to **Admin -> Settings -> Users & Auth -> 3rd Party Sign-ins**
- Select **Telegram**
- Enter **Client ID** and **Client Secret**
- Click **Save Changes**
- Enable Telegram

Once enabled and configured, Telegram appears in **Other sign-in methods** on `/login`.

## 4) Optional .env fallback

You can also define:

- `TELEGRAM_OAUTH_CLIENT_ID`
- `TELEGRAM_OAUTH_CLIENT_SECRET`

in `.env` / `.env.example`.

The admin UI is the preferred method because secrets are encrypted at rest in settings.

## 5) Restart

After changing environment variables, restart web:

```bash
docker compose up -d --build lemedia-web
```

## Troubleshooting

- **Telegram not shown on login**:
  - Ensure Telegram is **enabled** and **configured** in 3rd Party Sign-ins
  - Confirm BotFather allowed URLs exactly match your public domain and callback URL
  - Refresh/focus the login page after saving
- **Redirect/callback errors**:
  - Check `APP_BASE_URL` and reverse proxy config
  - Ensure HTTPS is used for production domains
