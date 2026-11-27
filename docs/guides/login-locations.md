# Login locations

The Home page's **Login Locations** block shows how many sign-ins your Google
Workspace users made in the last 24 hours and 7 days, and which countries they
came from. A sign-in's place is shown as its country, plus its state or
province when that is known.

## What happens to login IP addresses

- Helios reads sign-in events from Google's Reports API. The backend does this
  on its own schedule: right after Google is connected, at start-up, and then
  at most once an hour with the scheduled sync. Opening the Home page does not
  contact Google.
- **The location lookup runs locally.** Each sign-in's IP address is looked up
  on your own server, in a database file stored in the backend's data volume.
  No IP address is sent to any outside service.
- **The only outbound request is the database download.** The backend downloads
  the database file from its publisher's public address when the file is
  missing, and again each month when a new edition is published. It is a plain
  download of a public file. It carries no login data, no IP addresses from
  your users, and nothing about your organisation.

## Settings

Both settings are in `.env` and are passed to the backend by `docker-compose.yml`.

| Setting | Default | What it does |
|---|---|---|
| `GEOIP_DATABASE_PATH` | `/app/data/geoip/dbip-city-lite.mmdb` | Where the database file lives. The default is inside the `backend_data` volume, so the file survives image upgrades. |
| `GEOIP_DATABASE_AUTO_DOWNLOAD` | `true` | Download the file when it is missing and refresh it monthly. Set to `false` to stop all downloads. |

The file is about 60 MB to download and about 120 MB on disk. The backend holds
it in memory while running, so allow roughly that much extra RAM (twice that
briefly while a monthly update is checked).

### Turning the download off (air-gapped or restricted servers)

1. Set `GEOIP_DATABASE_AUTO_DOWNLOAD=false` in `.env`.
2. On a machine that can reach the internet, download the current
   "IP to City Lite" file in MMDB format from
   <https://db-ip.com/db/download/ip-to-city-lite> and unpack it (`gunzip`).
3. Copy it into the backend's data volume at the path in
   `GEOIP_DATABASE_PATH`, for example:
   `docker compose cp dbip-city-lite-2026-11.mmdb backend:/app/data/geoip/dbip-city-lite.mmdb`
   (create the `geoip` folder first if needed).
4. Restart the backend: `docker compose restart backend`.

Replace the file the same way when you want newer data. With downloads off,
Helios never replaces it.

### Without a database

Sign-ins are still collected and counted. Their location is left empty, and
the block says locations are unavailable and why (not downloaded yet, or
downloads turned off). Once a database is in place, the next hourly pull fills
in the location of sign-ins already stored.

### When a download fails

A new file is checked before it is used: it must open as a valid database and
place well-known public addresses in a country. If the download or the check
fails, the file already in use is kept and the backend logs one warning (not
one per attempt). It tries again the next day.

## Data source and licence

Locations come from **DB-IP "IP to City Lite"**, which is free, needs no
account, and is updated monthly.

What was checked on the publisher's own pages on 2026-11-27:

| Question | Answer | Source |
|---|---|---|
| Licence | Creative Commons Attribution 4.0 International (CC BY 4.0) | <https://db-ip.com/db/lite.php>, <https://db-ip.com/db/download/ip-to-city-lite> |
| Commercial use and redistribution | Allowed by CC BY 4.0: share and adapt "for any purpose, even commercially", with attribution | <https://creativecommons.org/licenses/by/4.0/> |
| Attribution required | Yes. Pages that display or use results must link back to DB-IP. Required wording: `<a href='https://db-ip.com'>IP Geolocation by DB-IP</a>` | <https://db-ip.com/db/lite.php> |
| Account or key | None. The download page asks only that you accept the licence | <https://db-ip.com/db/download/ip-to-city-lite> |
| Download address | `https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz`. The current and previous month answered 200; next month answered 404 until it is published | Checked with HTTP HEAD requests |
| Size | About 60 MB compressed; listed as 121 MB unpacked | HEAD `Content-Length`, and the download page |
| Fields | Country, state or province, city, approximate latitude and longitude. Helios stores country, state or province, and coordinates (used only to place the country on the map) | <https://db-ip.com/db/download/ip-to-city-lite> |

Helios does not ship the file in its image or repository; each install
downloads it, or the admin places it.

**Not chosen: MaxMind GeoLite2.** It needs a MaxMind account, its licence
restricts passing the data to third parties without MaxMind's consent, and it
grants use for internal business purposes
(<https://www.maxmind.com/en/geolite2/eula>). That does not suit an
open-source product that each customer installs.

### Attribution in Helios

Where locations are shown, Helios displays "IP Geolocation by DB-IP" linked to
<https://db-ip.com>: under the Login Locations block, and after the login list
in the Developer Console.

The reader library is `mmdb-lib` (MIT licence, pure JavaScript, no native build step).

## The map

The land outline behind the markers is built into Helios; drawing it calls no
map or tile service. It is generated once by
`frontend/scripts/build-world-outline.mjs` into
`frontend/src/components/widgets/worldOutline.ts`, using the same frame as the
markers (`loginMapProjection.ts`). A test checks that known inland places
(Edmonton, Abia State, London, central Australia) fall on land and open ocean
does not, so the outline and the markers cannot drift apart again.

Sources, none of which is a Helios dependency at run time:

| Part | Licence |
|---|---|
| Natural Earth 1:110m land, <https://www.naturalearthdata.com/> | Public domain |
| world-atlas 2.0.2 (Natural Earth as TopoJSON) | ISC, notice below |
| d3-geo 3.1.1 and topojson-client 3.1.0 (used by the generator only) | ISC |

world-atlas licence notice:

> Copyright 2013-2019 Michael Bostock
>
> Permission to use, copy, modify, and/or distribute this software for any
> purpose with or without fee is hereby granted, provided that the above
> copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
> REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
> AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
> INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
> LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
> OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
> PERFORMANCE OF THIS SOFTWARE.
