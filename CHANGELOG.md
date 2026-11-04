# Changelog

## 0.10.0 (2026-11-04)

Brings in the Oscarr 0.9.1 and 0.10 improvements (everything except the plugin changes).

### New
- Film and series pages: opening a title grows it out of the poster you tapped, with the homepage
  kept underneath so going back is instant and keeps your place. Softer backdrop fades.
- Series: seasons show as a grid of small posters; a season opens its episodes in a pop-up, ten at
  a time, with filters. Each season can be requested from the grid.
- Cast: round portraits, names and characters centred, rows can be dragged with a mouse. The round
  scroll arrows stay (mouse only, only when there is more to scroll).
- Episodes are numbered the way Sonarr numbers them. A one-off library sync runs after the update so
  existing requests pick up Sonarr's numbering.
- Shows are found in Sonarr by their TMDB id instead of by title, so titles that share a name no
  longer land on the wrong series.
- Routing rules open in a modal and can add Sonarr/Radarr tags (picked from the instance's own tags),
  alongside the folder, Sonarr type and instance.
- Request criteria (Admin, Criteria): your own extra choices when requesting, such as a language or an
  edition, usable as routing rule conditions.
- Requests page: requests for several seasons of the same show are grouped into one card that
  expands to show each season.

### Fixed
- Season requests send only the chosen seasons to Sonarr and start a search for each, instead of
  monitoring the whole show.
- Duplicate requests for the same season or quality are caught before reaching Sonarr/Radarr.
- Several request status fixes from upstream.
- A title Radarr/Sonarr still lists under the same TMDB id is no longer marked missing when the
  library sync refuses its match as an identity conflict.

### Other
- Zurg and rex: a Changelog button on their update row opens the recent releases with their notes,
  marking the one that is running and the newer ones.
- Docker scripts keep Unix line endings on Windows checkouts; `HOST` sets the listen address.
- Dependency security updates (follow-redirects, serialize-javascript).

### Database
- New columns `FolderRule.tagIds` and `MediaRequest.seasonNumbering`, new table `PostMigrationJob`.
  Migrations run automatically on start.

## Unreleased (2026-10-30)

### New
- Admin notifications (Admin → Notifications, per provider): a list added titles, an update is
  available for Sonarr, Radarr, Prowlarr, Zurg or rex (once per version), the result of an automatic
  update, and Zurg releases that newly broke. Telegram, Discord and email now show the details.
- The same three events reach admins' phones as push notifications (including the iOS home
  screen app), each with its own switch under Profile → Notifications → Server (admins).
- Automatic updates for Radarr, Sonarr and Prowlarr in an hour you choose (per app), through the
  host helper, skipped when the image isn't published or the app can't be updated from LeMedia.
- One-click roll back to the image that ran before the last update (pinned by tag or digest).

### Fixed
- Cast and recommendation rows: the scroll arrows were dark full-height strips that covered the
  first and last cards (always visible on phones). They are now round buttons, shown only on
  devices with a mouse and only when there is more to scroll; cast names can wrap to two lines, and
  the first cast photo lines up with the heading on phones.
- Lists use their real names (MDBList, Trakt and TMDB titles, readable labels for the rest) instead of
  the link ("MDBList user/list"); existing auto-named lists were renamed, names you chose are kept.
  "List added titles" notifications read "Added The Wrecker, from your Amazon Prime Movies list".
- Zurg duplicates: releases used by a different film or show (for example a S.W.A.T. pack shown
  under 9-1-1, or "It Was Always You" under "Always") are no longer grouped, and only groups with
  an unused copy of the same title count as duplicates.
- Saving the Open links no longer resets other Radarr & Sonarr settings.

## Unreleased (2026-10-29)

LeMedia becomes the control panel for the whole stack: list feeding, Radarr, Sonarr, Prowlarr,
Zurg and rex are now run from Admin, with optional host access for restarts and updates.

### New

**Lists** (Admin → Media → Lists)
- Add a list by link and preview it before anything is added: every title shows as New, In library
  or Blocked (with the reason). Supports Debrid Media Manager (shows, movies, browse and genre
  pages), Trakt (lists, watchlists, charts), MDBList (lists and search), TMDB (lists, charts,
  trending), IMDb (Top 250, popular, lists, watchlists, through Radarr's list service), Stremio
  Cinemeta, and WWE PPV / premium live events.
- Subscriptions: lists re-sync on a schedule (6 hours by default) with sync now, retry failed,
  pause, edit, history of what was added, and an optional "only titles new to the list" mode.
- Handmade lists: search TMDB, build your own list, then preview and subscribe to it.
- Optional content filters, each switchable for movies and TV: foreign language (with an allowed
  languages list), anime, kids, game shows, talk shows, reality, documentaries. Radarr/Sonarr
  exclusion lists and the LeMedia blacklist always apply, and filters are checked again against
  the Radarr/Sonarr record just before adding.
- Lists set up inside Radarr/Sonarr are shown and can be moved to LeMedia (their own unfiltered
  auto-add is switched off).
- WWE events: SmackDown Hotel catalogue matched conservatively to TMDB movies, with event-type
  rules and manual pins for events that need a match.
- MDBList and Trakt keys are stored encrypted.

**Radarr & Sonarr** (Admin → Media → Radarr & Sonarr)
- Overview per app: online state, version and branch, update available (from the app's own update
  feed, so develop/nightly channels are respected) with what's new, update and restart, library
  counts, health warnings and disk space.
- Queue (remove, or remove and blocklist), Activity (grabs, imports, failures), Wanted (search one
  or search all missing), and a live Console.

**Prowlarr** (Admin → Media → Prowlarr)
- Indexers with searches, grabs, failure rate and speed; enable/disable, priority, settings
  (secrets kept unless replaced), test one or test all.
- Apps it syncs to, with "sync indexers to apps", search/grab/RSS history, and a live Console.

**Host helper** (optional)
- Lets LeMedia restart and update containers and read their logs over SSH. LeMedia creates its own
  key; the key is locked to `tools/lemedia-host-helper`, which only manages the containers you
  allow. Compose files and images are read from Docker's own labels.
- One-line install from Admin → Radarr & Sonarr → Settings (one-hour link), or manual steps.
- Updates pin the exact LinuxServer image tag for the app's branch, back up the compose file first
  and restore it if the container doesn't come back healthy. Other images can still be restarted.

**Zurg**
- The Zurg page has tabs: Overview, Cleanup and Console.
- Update Zurg now, and optional automatic overnight updates when a newer build is published.
- Zurg Cleanup: swap oversized movie files for a smaller unused copy (background queue), remove
  unused duplicates, repair broken releases (paced, with pause/resume), and manage the trash.
  Nightly duplicate re-analysis.
- Placement-import guard: releases Zurg placed but Radarr/Sonarr never imported get a rescan every
  15 minutes (3 tries per title, never deletes anything).

**rex**
- Library sync progress (playable, waiting for Zurg's probe, rate and ETA, stall warning) from the
  rex host reporter, plus host stats and version.

**Other**
- GitHub connection for release feeds, and update checks for Zurg and rex.
- "Watch in" app links for Plex, Plezy and Infuse.
- Clickable request cards, avatar proxy, new LeMedia logo and icons.
- Turnstile now also gates "Continue with Google".

### Changed
- Admin redesigned for desktop; Zurg Cleanup moved inside the Zurg page (old links redirect).
- Plugins and the instance changelog were removed.
- The maintenance page answers 503 with no caching, and the app shows one calm "LeMedia is
  restarting" note instead of errors while it restarts.

### Fixed
- Third-party posters failing because the service worker caught every host.
- Pages crashing when the browser reports a POSIX-style locale (for example `en-US@posix`).
- Zurg repair queue stuck on "waiting for Zurg", and reclaimable space counted shared packs twice.

### Database
- New tables `ListSubscription` and `CustomList`, and `Integration` for stored integration settings.
  Migrations run automatically on start.
