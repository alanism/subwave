# YouTube imports

Open **Admin → Library → YouTube imports**. Search by song and artist, or paste a YouTube video URL. Choose **Download MP3** to queue a search result. A pasted video URL queues directly when you press Enter or **Download MP3**. The original atlas rolling search, receiver Input Selector keys, switch and display are used by this page, with the source CSS preserved.

Every completed MP3 is kept in **Recent YT downloads**, on the machine running Subwave. **Save MP3** also downloads a copy to the device using the admin page. Downloads survive controller restarts. The queue runs one download at a time and offers Retry after a failed or interrupted attempt. Duplicate requests return the existing download.

## Genre stations

Create the desired station profiles in **Admin → Stations**, configure each station’s Navidrome connection, then open **Genre stations** on the imports page. Give each destination a genre, optional comma-separated aliases, and a relative music folder. For example:

| Station | Genre | Aliases | Music folder |
| --- | --- | --- | --- |
| Jazz | Jazz | Bebop, hard bop | YouTube/Jazz |
| House | House | Deep house, tech house | YouTube/House |

Enable **Add matching songs automatically** to send clear genre matches to their destination. Genre metadata and video tags carry more weight than the title and description. Equal or uncertain matches stay in Recent YT downloads for manual assignment. Selecting an explicit destination overrides the automatic genre suggestion. A song can be added to more than one station.

Each destination’s Navidrome library/user must have access to its intended music folder. A folder name alone does not isolate a station’s library. Configure separate libraries, users or Navidrome instances as appropriate. The importer writes the selected genre into the station copy’s MP3 metadata and requests a Navidrome scan using that station’s own credentials. Scan failures leave the file in place and show a warning.

Subwave’s existing station profiles share one active broadcast. Importing into an inactive profile does not switch the broadcast. Simultaneous independent streams need separate running broadcast stacks; this importer does not change that architecture.

## Storage connection

Downloads work without a library connection. Adding songs to Subwave requires a **writable** music root shared with Navidrome. Do not use an unrelated empty folder: Navidrome must scan the same files.

For a native controller, install Node 22+, FFmpeg/ffprobe and the official `yt-dlp[default]` Python package, then set:

```dotenv
YT_LIBRARY_PATH=/absolute/path/to/navidrome/music
```

The controller and all-in-one Dockerfiles include FFmpeg and a pinned yt-dlp package with its EJS dependency. To connect a host music root with the standard Compose stack, set `YT_LIBRARY_HOST` in `.env`, then use the override when rebuilding/running the stack:

```sh
docker compose -f docker-compose.yml -f docker-compose.youtube.yml up -d --build controller web
```

For BYO/dev Compose, use the same override alongside that base file. The override mounts the selected host root at `/youtube-library` and sets `YT_LIBRARY_PATH` accordingly. For an all-in-one container, mount the root writable yourself and set `YT_LIBRARY_PATH` to its container path.

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| YT_DOWNLOADS_DIR | `<state root>/Recent YT downloads` | Saved originals; use persistent storage |
| YT_LIBRARY_PATH | MUSIC_LIBRARY_PATH, if set | Writable destination music root |
| YT_DLP_PATH | yt-dlp | Downloader executable |
| FFMPEG_PATH | ffmpeg | Tagging executable |

Routing and queue history are install-level state under `youtube-imports/`. They remain shared when switching station profiles. Back up that directory, the Recent YT downloads folder, and destination music folders. Custom paths outside state need their own backup and volume mounts.

## Operational details

All import endpoints require admin authentication. Only canonical YouTube video IDs are accepted for downloading; searches use yt-dlp’s YouTube search extractor. Executables receive argument arrays without a shell. User config, plugins, cookies and remote component downloads are disabled. Each download is limited to 30 minutes and 250 MiB; the queue holds up to 25 pending jobs and 500 history records. Existing destination files are never replaced. Publication records contain content hashes so a retry can recognise its own completed copy after a restart.

YouTube availability and extraction requirements can change. Setup details on the imports page show tool availability; update the pinned yt-dlp version when necessary. See the [official yt-dlp documentation](https://github.com/yt-dlp/yt-dlp#readme) for dependencies and extractor support.
