# Subwave owner’s manual

**Linux desktop edition · version 1.3.0 · Original + Enochian**

Subwave plays music saved on your computer. It also searches YouTube, downloads MP3s and organizes them into separate genre radio stations. Your local station starts with the app. You do not need an admin login or a separately configured server.

## Contents

- [Get started](#get-started)
- [Find your way around](#find-your-way-around)
- [Open and find local files](#open-and-find-local-files)
- [Play music](#play-music)
- [Create and manage playlists](#create-and-manage-playlists)
- [Use genre radio stations](#use-genre-radio-stations)
- [Search YouTube and keep an MP3](#search-youtube-and-keep-an-mp3)
- [Appearance and window controls](#appearance-and-window-controls)
- [Keyboard controls](#keyboard-controls)
- [Let Aya or Hermes control Subwave](#let-aya-or-hermes-control-subwave)
- [Your files and settings](#your-files-and-settings)
- [Backup and restore](#backup-and-restore)
- [Troubleshooting](#troubleshooting)

## Get started

Open **Subwave** from the **Apps** menu on your Omarchy desktop. The player and local music service start together. An empty library on first launch is normal.

To play your own files:

1. Open **Library & Playlists**.
2. Under **Add files to genre**, choose a destination such as **Local files** or **Jazz**.
3. Choose **Open audio files** and select files in the Linux chooser.
4. Wait for the import result. Choose **Play** beside a track.

To start with YouTube:

1. Open **YouTube**.
2. Search by song/artist or paste an individual YouTube video URL.
3. Download the intended video as an MP3.
4. Find it in **Recent YT downloads** and choose **Add & play**.

Opening a panel keeps music playing. **Close · Esc** returns to the player. **Player → Quit**, **Ctrl+Q**, or closing the last app window ends playback and stops the local service. Minimize the window if you want music to continue.

## Find your way around

Original uses a top toolbar. Enochian puts the same actions on six small front-panel keys: **Open files, Library, Genres, YouTube, Next and Settings**. The native menus remain available in both skins. In Enochian, **Library** opens Library & Playlists and **Genres** opens Genre stations.

| Area | What you do there |
| --- | --- |
| **SUB/WAVE LOCAL** | Return to the main player. |
| **YouTube** | Search, download, assign a genre and save another MP3 copy. |
| **Genre stations** | Choose a listening collection or create another genre station. |
| **Library & Playlists** | Import/search music and create or edit playlists. |
| **Open files** | Open the chooser using the current import destination. |
| **Settings** | Choose a skin/palette, see storage paths and refresh the library. |

**Player** opens the same areas and provides playback commands. **Skin** selects Original or Enochian. **View** controls zoom and fullscreen. **Help** opens your music folder, desktop log and version information.

The selected playback collection appears in the status bar and, in Enochian, beside the **INPUT** knob and on the receiver display. Turn the left knob by dragging vertically; the source changes when you release it. With the knob focused, arrow keys select the next/previous station or playlist, Home selects the first and End selects the last. Empty collections stay selectable so you can add music to them. Choosing an **import destination** controls where files are added; it does not switch what is playing.

## Open and find local files

### Import audio

In Library, choose **Add files to genre**, then **Open audio files**. **Ctrl+O** and **Player → Open audio files…** use this same destination.

Select up to **50 files** at once, each no larger than **250 MiB**. MP3, FLAC, WAV, M4A and OGG imports have been verified. The chooser also accepts Opus and AAC.

Subwave prepares playable MP3 copies inside its music folder. MP3 audio is copied without re-encoding during import; other accepted formats are converted to MP3. Source files stay unchanged in their original locations. This uses additional disk space and does not retain lossless playback for converted formats.

Progress names the files being prepared. A mixed selection can add valid files and report errors for the others. Canceling adds nothing. Re-selecting the same unchanged file for the same destination does not add another copy.

### Find a song

Use **Find a track** to search by title, artist or genre. **Show collection** filters the list to a genre. Tracks show title, available artist, genre and duration. Choose **Play** beside the song.

Use **Refresh library** after repairing or changing files in Subwave’s managed folders. Use the importer for new non-MP3 source files so they receive a playable copy.

## Play music

### Start, stop and advance

Choose **Play** beside a library track, **Play playlist** in a playlist editor, or **Play station** in Genre stations.

Enochian’s **POWER** control starts or stops listening to the selected collection. Its indicator follows the listening state; the central screen reports **STOPPED**, **STARTING** or **PLAYING**. If the collection is empty, power opens Library so you can add music. Original exposes its player transport. **Ctrl+Space** provides Play / Stop in either skin.

Choose **Next track** or press **Ctrl+Right** to advance. Next does not start music while stopped. If you stop during a pending track selection, playback stays stopped.

The desktop uses a continuous local radio stream. It does not expose a seek/scrub control or promise exact-position pause/resume. Changing sources reconnects playback to the chosen collection. Playlists run in their displayed order, then repeat.

### Volume and mute

In Enochian, drag the right **VOLUME** knob up/down. Open **Fine volume control** below the receiver to reveal the original ribbed slider. Both control the same gain. Focus the knob and use arrows for 2% steps; the slider offers 1% arrow steps and 10% Page Up/Down steps. Home/End select minimum/maximum. The mute switch silences output. In Original, use its volume control. **Ctrl+M** toggles mute in either skin. Skin changes preserve the intended volume and mute state.

The display reports the current song and playback state. Empty stations explain how to add music. Brief connection and metadata delays can occur when joining or changing the local MP3 stream.

## Create and manage playlists

### Create a playlist

1. Open **Library & Playlists**, or press **Ctrl+N** to focus **New playlist name**.
2. Enter a name and choose **Create playlist**.
3. Select it under **Edit playlist**.
4. Select a track under **Add from library**, then choose **Add to playlist**.
5. Add the remaining tracks and choose **Play playlist**.

Blank names receive validation guidance. New playlists are empty until you add tracks. A song can belong to several playlists. Tracks already in the current playlist are marked **already added**.

### Change order or name

Select a track in the numbered list, then choose **Move up** or **Move down**. Changes save as you make them. Playback follows the saved order and repeats after the last track. **Play selected track** starts at the selected track in that playlist.

Edit **Playlist name** and choose **Save name** to rename it.

### Remove, delete and restore

**Remove from playlist** removes that membership and keeps the library file and other playlists.

**Delete playlist** moves it into **Deleted playlists**. Expand that section and choose **Restore** to recover its name, tracks and order. Deleted playlists remain recoverable after relaunch. These actions keep the audio files.

## Use genre radio stations

Each genre station has its own local track collection. Initial choices are **Jazz, House, Rock, Ambient and Local files**. **All music** combines the available station library. These collections are independent of YouTube uploader channels.

### Listen to a genre

Open **Genre stations**, select a station and choose **Play station**. Selecting another genre during playback changes the actual music source. An empty genre asks you to add files or download music instead of substituting another genre.

### Create a station

Under **Create a genre station**, enter **Station name** and **Genre**, then choose **Create station**. For example: **Soul Radio** and **Soul**.

You can keep up to **eight genre stations**, including the initial five. All music is an aggregate view and does not use a genre slot.

### Add music to a genre

- Choose the destination genre when importing local files.
- In Recent YT downloads, choose **Add to genre station**, then **Add to Subwave**.
- In Library, expand **Copy an existing track to another genre**, choose the track and destination, then **Copy to genre**.

Adding music does not switch playback. A genre copy preserves the source file and existing playlist memberships. The same song can belong to more than one genre.

## Search YouTube and keep an MP3

YouTube requires internet access. Download content you have permission to save.

### Search by song or artist

1. Open **YouTube**.
2. Type in **Song, artist or YouTube URL**. In Enochian, open the red rolling search control first.
3. Press **Enter** or choose **Search**.
4. Check the title, uploader/channel and duration to identify the intended recording.
5. Choose **Download MP3** beside that result.

Try another query if no songs are found. A result’s title opens YouTube in your browser; **Download MP3** saves audio through Subwave.

### Paste a video URL

Paste an individual YouTube video URL in the same field, then press **Enter** or **Download MP3**. Malformed or non-YouTube links receive inline guidance. This interface handles individual videos; it does not provide bulk playlist/channel downloads.

Follow the item in **Recent YT downloads**. States include Queued, Reading song details, Downloading, MP3 ready, Adding to station, Added to station and Download failed. A percentage appears when the downloader provides it. Ready means processing completed.

### Sort into a genre

Choose **Destination station → Auto · match the genre station**, or select a specific destination. With **Add matching songs automatically** enabled, clear matches can be added without another step.

Matching uses video genre tags, title and description. It does not classify the sound itself. Tied or unclear evidence leaves the song in Recent for your decision.

To assign manually, choose **Add to genre station** on the completed item, then **Add to Subwave**. The **Needs a station** filter finds completed songs still awaiting assignment. Adding a genre copy keeps the retained original.

### Play or save a download

**Add & play** puts an unassigned download into **Local files** and starts it. Once a station copy exists, the action reads **Play**. To put the song in a playlist, add it to a station/library first, then use **Add from library** in the playlist editor.

**Save MP3** opens the native save dialog for an extra copy. Choose a folder and filename and save. Canceling preserves the retained original. Recent keeps that original after saves and genre copies.

Requesting the same video reuses its download record. Failed items offer **Retry download**. After closing during extraction, reopen Subwave and check the job’s status/retry action.

## Appearance and window controls

Choose **Skin → Original** or **Skin → Enochian**, or use **Settings → Player skin**. Original offers Light/Dark palettes; Enochian offers Ivory/Obsidian finishes. Use **Settings → Color palette** to select a finish. The appearance control beside the skin name also offers appearance options and **Lite mode**.

Changing skins preserves the shared player and music organization. Appearance and window size are saved. Lite mode reduces optional effects; controls also honor the system’s reduced-motion preference.

Resize the window normally. The minimum is **800 × 620**. Panels scroll when needed. Use **View → Zoom in**, **Zoom out**, **Reset zoom** or fullscreen for readability. Both skins and main panels were checked at 800 × 620 and 1440 × 900, including 125% zoom.

## Keyboard controls

Shortcuts apply while Subwave is the active application.

| Action | Shortcut |
| --- | --- |
| Show player | Ctrl+1 |
| Open audio files | Ctrl+O |
| Library & Playlists | Ctrl+L |
| New playlist name | Ctrl+N |
| Play / Stop | Ctrl+Space |
| Next track | Ctrl+Right |
| Mute / Unmute | Ctrl+M |
| Genre stations | Ctrl+G |
| YouTube downloads | Ctrl+J |
| Settings | Ctrl+, |
| Original | Ctrl+Shift+1 |
| Enochian | Ctrl+Shift+2 |
| Close local panel | Esc |
| Quit | Ctrl+Q |

Use **Tab / Shift+Tab** to move between controls, **Enter** to submit forms and **Space** to activate focused buttons/switches. In the genre selector, arrows move between exclusive choices and **Home / End** choose first/last. Focus the Enochian knob or slider to use arrows for volume; **Home / End** set minimum/maximum. The slider also supports **Page Up / Page Down** for larger steps.

## Let Aya or Hermes control Subwave

Keep Subwave open. Choose **Help → Agent controls (Aya / Hermes)** to open the local control page. It can search your library or YouTube, download MP3s, add songs to the selected genre, and operate the actual native player. Playback stays in Subwave; the page does not start a second audio player.

Aya needs access to this connected computer through the OpenAI desktop app. Ask it to open the Subwave agent page or use the installed `subwave-agent` command. A dot running only on its cloud computer cannot use your local music service.

Hermes uses the bundled MCP connection. Once connected, ask it to find a local song, search YouTube for a missing recording, add the MP3 to Jazz, build a playlist or change the player volume. New downloads are asynchronous: the agent should check the job until ready before claiming that a song was added or played.

The tools preserve downloaded originals and use the same genre/playlist rules as the app. Specify the intended recording if search results are ambiguous. For connection instructions and the complete tool catalog, see [Agent controls](docs/agents.md).

## Your files and settings

**Settings → Local storage** shows actual music paths. **Help → Open music folder** opens them in the file manager. The usual layout is:

```text
~/Music/Subwave/
├── Recent YT downloads/       retained original YouTube MP3s
└── Stations/
    ├── Jazz/
    ├── House/
    ├── Rock/
    ├── Ambient/
    └── Local files/
```

Additional genres get their own folders. The Music directory follows your system configuration, so its exact path can differ.

The application profile is normally **`~/.config/Subwave/`**. It contains preferences, browser storage, `desktop.log` and `local-station/` records for playlists, library, genre routing and YouTube jobs.

Saved library organization survives restarts. Imported music plays offline, independently of the external files you originally selected. Avoid moving/renaming managed files used in playlists; refresh after an intentional change.

## Backup and restore

### Back up

1. Quit Subwave so no import or download is writing.
2. Copy the entire music folder, normally **`~/Music/Subwave/`**, to your backup location.
3. Copy the entire profile, normally **`~/.config/Subwave/`**, into the same backup set.

Back up external source originals separately if you want to retain them too. The music backup keeps playable copies; the profile keeps playlist order, routing, appearance and Recent records.

### Restore

Quit Subwave and retain a copy of the current folders. Restore matching music and profile backups to their original paths under the same user account. Reopen and check the library; use **Refresh library** if needed.

A different account or folder layout can leave old paths in records. This version has no guided library migration; preserve the layout or re-import files as needed. Re-importing alone does not reconstruct lost playlist organization.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Empty library on first launch | Import files or download a song. Subwave does not include a music catalog. |
| Some imports fail | Read the named errors. Valid imports stay added. Repair/replace failed files and check the format, file-size and count limits. |
| Import adds zero files | The unchanged files may already be in that destination. Search before adding again. |
| Unavailable/corrupt song | Repair or re-import it, choose **Refresh library** or **Retry / refresh**, then play a valid track. Other valid music remains available. |
| No sound | Check app volume/mute, Linux output device and system volume. Try a known-good local track. |
| Empty station/playlist | Add tracks, then choose Play station/Play playlist. An empty collection does not substitute unrelated music. |
| Rejected YouTube link | Paste a complete individual video URL or use song/artist text to search. |
| No search results | Change the query and check the connection. Existing downloads remain. |
| Download failed | Read the error, check the network and choose **Retry download**. Removed/restricted videos may remain unavailable. |
| Tools show Not available | Expand **Storage and setup details**. A new installation needs yt-dlp and FFmpeg/ffprobe. Ask the installation maintainer to install/update them; the verified Omarchy machine already has them. |
| No automatic genre match | Filter **Needs a station**, choose a destination and **Add to Subwave**. Unclear matches wait for you. |
| Playlist/copy fails to save | Check free disk space and write access to music/profile folders, then retry. Failed operations are not reported as saved. |
| Cramped panel | Scroll, enlarge the window or use **View → Reset zoom**. |
| Local service/interface stops | Close and reopen. If it repeats, use **Help → Open desktop logs** and keep the error text. |
| Browser page asks for admin credentials | Open the installed app from Apps. The inherited web/server edition has its own setup; this manual describes the local desktop window. |

For a bug report, include **Help → About Subwave** version, distribution, skin, the action, expected/actual result and relevant log lines. Omit private paths or video details you do not want to share. Back up music and the profile before reinstalling or attempting a reset.

For installation and source builds, see [README.md](README.md). For control mapping, see [Enochian design notes](docs/enochian-design.md).
