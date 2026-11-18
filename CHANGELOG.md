# Changelog

## 0.19.0 (2026-11-18)

### New
- **The DMM page now lists Radarr and Sonarr backups.** Sort by newest, oldest or largest, filter
  by app, and press **Import** on a row: the server pulls that archive from the *arr itself and
  forwards only the database inside it to DMM, so no download-and-re-upload dance. **Back up now**
  starts one in the *arr for installs that have none (Sonarr often has zero).
- **Recent imports** records every import — app, archive, added / already-wanted counts, whether it
  came from a backup, an upload or the scheduler.
- **What zurg has fetched** shows zurg's own report of DMM jobs (fetched, retrying, recent titles).
  It deliberately does not read DMM's wanted list, because reading that list marks it as polled by
  zurg and would make zurg look healthier than it is.
- **Scheduled import** (off by default): once a day, import each app's newest backup. A backup
  already imported is skipped, so the job never re-sends the same archive.
- Links to DMM's wanted list, its settings and Gatekeeper, plus the hourly import budget, all on
  the same page.

## 0.18.0 (2026-11-18)

### New
- **DMM has its own page under Admin → Media.** The wanted-list import lives there instead of
  inside Radarr & Sonarr, matching how Zurg and rex are laid out.

### Changed
- **Service pages only appear when the service is configured.** Zurg, rex, Prowlarr, DMM and
  Radarr & Sonarr drop out of the admin sidebar (and its search) on installs that do not have
  them, instead of leading to an empty or unreachable page. DMM counts as configured once a
  sponsor key is saved; rex still works through its Plex-service setup.
- Every loading indicator uses the same red ring as the full-page loader. Previously the page
  loader span red while section and list loaders used a grey icon, with a couple of red ones mixed
  in.

## 0.17.0 (2026-11-18)

### New
- **Admin → Radarr & Sonarr → DMM wanted list.** Hand LeMedia a Radarr or Sonarr backup zip and
  everything the *arr is still looking for lands on your DMM wanted list for zurg to fetch:
  monitored films without a file, and the missing seasons of monitored shows. The server takes the
  *arr database out of the archive and forwards only that member to DMM, so the rest of the backup
  (including the *arr API key) never leaves the box. DMM's own counts come back — added, already
  wanted, no IMDb id, not released yet, over the list cap — plus the Sonarr seasons that have
  nothing aired on TMDB and therefore will not be fetched.
- The card only works for an active DMM sponsorship: the key is exchanged for a signed sponsor
  token first, and DMM refuses a lapsed key. Imports are capped at DMM's 10 per hour.

### Changed
- The tagline now describes what the app is for: "Your media setup, for you and yours." on the
  login screen, and a requester-for-family-and-friends description in the page metadata and PWA
  manifest.
- The Debrid Media Manager service shows DMM's own icon instead of a "DMM" placeholder tile.

### Fixed
- Nothing this release.

## 0.16.0 (2026-11-17)

### New
- **Link a title to the Sonarr series it really is.** TMDB and TVDB disagree about some shows —
  *Top Boy* is TMDB 93544 (2019, 3 seasons) but TVDB 253138 (2011, 5 seasons), so Sonarr's
  `tmdb:93544` lookup returns nothing and every request for the newer entry failed forever. An
  admin now gets **Link to Sonarr** on a TV title page: search Sonarr, pick the series, and the
  stored TVDB id drives dispatch, the season explorer (TVDB numbering) and sync. The link can be
  removed from the same dialog.
- The picker flags the TMDB mismatch explicitly instead of hiding it, and marks series already in
  the library. Sync keeps honouring the link when Sonarr reports the sibling TMDB id, so a linked
  title still turns AVAILABLE instead of staying "missing".

### Fixed
- "Cannot resolve … check the service metadata lookup" now says what actually happened: no series
  for that TMDB id (with the link action named), a lookup that failed (with its HTTP status), or a
  stored identity that disagrees with the service. It still never echoes upstream errors, which
  may carry the instance API key.

## 0.15.0 (2026-11-17)

### New
- **Report an issue** on any title page: pick what is wrong (playback, wrong file, audio,
  subtitles, something else) and describe it. The report lands in **Admin → Issues** for triage,
  with a bell notification for admins; marking it resolved (or reopening it) is one click. Nothing
  in the library is changed automatically.

### Fixed
- A title the media server already holds is now reported as "in your library" on its page, even
  when Radarr/Sonarr have no row for it. Previously the page offered Request and mentioned an
  import-list exclusion, then the request was refused as already owned.

## 0.14.0 (2026-11-16)

### New
- **Admin → Radarr & Sonarr → Exclusions** lists what each service refuses to add, with the
  title, year and TMDB/TVDB/IMDb ids. Search and filter by service, and remove an entry so the
  title can be requested normally. This is the manual counterpart to approving an excluded
  request.

## 0.13.1 (2026-11-16)

### Fixed
- An admin's own request for an excluded title no longer waits for approval — the admin is the
  approver, so it goes straight through and removes the exclusion. Normal users' requests are still
  held, and the "Excluded" badge now clears once a request is no longer pending.

## 0.13.0 (2026-11-16)

### New
- **Import-list exclusions are handled instead of failing.** When a requested title is on
  Sonarr's or Radarr's exclusions ("never add this again"), the request is still accepted but is
  always held for approval. The title page says why, the request card shows an **Excluded** badge,
  and approving removes the exclusion and adds the title. Without this the request was sent,
  rejected by the service, and nothing appeared in the library.

## 0.12.1 (2026-11-16)

### Fixed
- The desktop header put the admin, notifications and profile cluster **inside the search bar**:
  the search form is absolutely positioned, so the cluster was auto-placed into the middle grid
  column. Both sides are now pinned to their outer columns and the cluster sits at the far right.
- The quick-request "+" on posters is visible on desktop again. It was shown only while hovering
  (desktop) but always on touch, so the same card looked different between phone and computer.
  The rating pill moves aside when the button is present instead of sitting underneath it.
- No "+" on **upcoming**, processing or imported titles: those are already tracked, so offering a
  request suggested they had not been added. Only a missing title (or an available title with an
  untaken quality option) offers the button now.
- Clicking "+" now sends the request instead of navigating. A series requests the whole show; only
  an upgrade of something already available still opens the page, where the quality must be chosen.
- The tick that replaces "+" after a request is no longer hidden until hover.

## 0.12.0 (2026-11-15)

### New
- **Backup retention**: only the newest **5** saved backups are kept. Older archives are removed
  automatically after each overnight backup, on boot, and whenever the list is opened; the limit
  can be raised with `BACKUP_RETENTION` in `.env`. Admin → Backups shows the current limit.
- **Logs page**: routine "Job completed" lines are hidden behind a **Routine jobs** toggle (61% of
  this instance's log), repeated entries collapse into one row with a count and a time span, the
  category chips keep stable server-side counts instead of changing per page, levels show counts
  and include debug, and rows carry exact times with Today / Yesterday headings.

### Fixed
- The backup list endpoint now reports the retention limit alongside the files.

## 0.11.0 (2026-11-14)

### New
- **Debrid Media Manager (DMM)**: a service you can add with your sponsor key. When enabled it
  takes over new requests, lists and scheduled syncs — no Radarr or Sonarr required. Requests are
  validated against TMDB, IMDb and TVDB before they are sent, and seasons are merged with what is
  already wanted instead of replacing the list.
- **DMM completion**: Zurg's DMM jobs are matched back to titles through DMM's wanted list, so a
  fetched film becomes "available" and notifies its requesters. Season packs mark their season;
  single episodes never mark a whole season.
- **Optional Radarr/Sonarr mirror**: after a DMM fetch, add the title (unmonitored, no search) and
  rescan it, for setups where Zurg writes into the *arr's library folder.
- **Library import** for installs without Radarr/Sonarr: the media server's library becomes the
  catalogue, with Plex's own added dates, so the homepage and Recently Added reflect what you
  actually own. TMDB posters are filled in gradually, newest first.
- **Missing browse page**: "See all" on the Missing rows opens a sortable page (recently added,
  title, year, runtime, rating, missing episodes) with load-more.
- **REX updates**: a REX-only host helper with a one-line installer, manual and overnight updates,
  a post-update identity check and automatic rollback to the previous image.
- **Push notifications** are tracked per device: a replaced browser subscription is removed instead
  of delivering every alert twice, and Account → Notifications lists your devices so an old one can
  be deleted.
- Film and series pages: where to watch (with JustWatch credit), MDBList ratings, available vs aired
  episode counts, collection availability counts, an "available in your library" filter on actor
  pages, and "more like this from your library".
- Requesting a series from the top of its page requests the whole show, including seasons that were
  left unmonitored in Sonarr.
- Requests for a title already in your library are refused, even when there is no *arr row for it.

### Fixed
- Deleting a title returns you to the list you came from, with its sort intact, instead of the
  homepage. Dismissing the delete dialog no longer navigates at all.
- The Rating and Missing rows no longer ask Radarr for titles in Z–A order; they default to most
  recently added.
- Carousel posters for Missing rows were blank after the endpoint changed shape.
- A whole-series request no longer gets blocked by an older season-only request.
- Duplicate push subscriptions are pruned when a browser replaces its endpoint.

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
