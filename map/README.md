# Kejar's own map file

The game map reads a Malaysia + Singapore map file (Protomaps format, from OpenStreetMap) from Cloudflare R2, through
the small Worker in this folder. If it can't be reached, the app falls back to OpenFreeMap by itself.

- Bucket: `kejar-map` (R2). Worker: `kejar-map` at `https://kejar-map.kejar.workers.dev`.
- The app's address for the file is `LIVE_MAP_FILE` in `app/src/game/mapTiles.ts`.
- The Worker only answers Kejar's own pages (`kejar-eosin.vercel.app`, `kejar-*.vercel.app`, localhost) and caches
  each piece at Cloudflare's edge for a day. Free tier: 100,000 Worker requests a day, 10 GB of R2 storage.
- Keys live outside the repo, in `../kejar-map/cloudflare.env` (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`).
  Never commit them.

## Refreshing the map (every few months)

1. Get the `pmtiles` tool (github.com/protomaps/go-pmtiles releases) and find the newest daily build at
   `https://build.protomaps.com/YYYYMMDD.pmtiles`.
2. Cut Malaysia + Singapore:
   `pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles my-sg.pmtiles --bbox=99.5,0.8,119.5,7.6`
3. Upload it under a new dated name, `my-sg-YYYYMMDD.pmtiles`, to the `kejar-map` bucket. The file is over the 300 MB
   limit of the dashboard and `wrangler r2 object put`, so use the S3 API (multipart). An API token with
   "Workers R2 Storage: Edit" works as an S3 key: access key ID = the token's ID, secret = SHA-256 of the token.
4. Change `LIVE_MAP_FILE` to the new name, push, and delete the old file from the bucket once the deploy is live.

## Changing the Worker

From this folder, with the keys loaded into the environment: `npx wrangler deploy`.
