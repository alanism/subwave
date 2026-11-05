# Subwave for Linux

Subwave opens as a local music player with two skins: **Original** (the Classic player) and **Enochian**, using the authored Enochian knobs, slider, receiver power, switches, display, Input Selector and Ivory/Obsidian finishes.

Launching the app starts its local library, YouTube download service and MP3 station automatically. No Docker, station address or login is needed. Choose audio files, search YouTube or paste a video URL, then play a genre station an ordered playlist, or a live internet-radio preset.

## Run a release

On the configured Omarchy computer, open **Subwave** from **Apps**. For a portable release, keep **Start Subwave** beside its versioned AppImage and open **Start Subwave**. The helper uses extract-and-run mode, which works without FUSE. Alternatively, extract the Linux tarball and run `subwave`. Enable execution in your file manager's Permissions tab if needed.

The **Skin** menu switches between **Original** and **Enochian**. Appearance inside the player offers the same two skins and their colour themes. Switching skins keeps the current audio element, playback and volume. Your appearance choices and window size survive restarts.

The **Player** menu opens **Library**, **Genre stations**, **YouTube downloads**, **Internet radio** and **Settings** inside the player. Opening or closing a panel keeps playback running. Closing the last window quits the app and stops its local services.

Desktop 1.4.0 includes **Help → Agent controls (Aya / Hermes)** and a bundled `subwave-agent` helper. The local browser page, JSON commands and stdio MCP share 25 tools for music search, downloads, genre/playlist changes, live-radio discovery/presets and native playback. See [agent setup and examples](../docs/agents.md).

## Add and play music

**Open audio files** opens the native Linux file chooser. Select up to 50 MP3, FLAC, WAV, M4A, OGG, Opus or AAC files. Subwave prepares playable MP3 copies in its library and preserves your source files. The Library panel lets you choose a destination genre before importing; this does not switch the music currently playing.

**YouTube downloads** accepts song/artist searches and pasted YouTube video URLs. Completed original MP3s stay in **Recent YT downloads**. Clear genre matches can be added automatically; uncertain matches remain available for you to assign. **Save MP3** opens a native save dialog for an additional copy. Search and extraction need an internet connection; completed local music remains available offline.

**Genre stations** select separate music collections. The initial collections are Jazz, House, Rock, Ambient and Local files, alongside **All music**. Add another genre from this panel or copy an existing library track into a genre. Importing into a collection preserves the current playback source.

In **Library**, create a playlist, add tracks, move them up or down, and choose **Play playlist**. It plays in the saved order, then repeats. You can rename a playlist, remove tracks, delete the playlist and restore it from **Deleted playlists**. Removing a playlist or its membership keeps the audio files.

**Internet radio** searches the community Radio Browser directory by name, genre and country. Save a preset or **Tune in**, or enter a direct public stream URL. Saved presets join genres/playlists on the authored receiver dial and use the shared spectrum, volume and mute. Direct MP3/AAC/OGG/FLAC and simple M3U/PLS are supported; adaptive HLS is not. Removing the selected preset stops playback without deleting local music. Presets persist in the profile; broadcasts are streamed, not downloaded.

## Your music and preferences

Subwave uses your system's Music directory, normally:

```text
~/Music/Subwave/
├── Recent YT downloads/
└── Stations/
    ├── Jazz/
    ├── House/
    ├── Rock/
    ├── Ambient/
    └── Local files/
```

New genre collections get their own folders under `Stations`. **Open music folder** opens this location in your file manager.

Playlists, saved radio presets, the selected collection, download records, preferences, Chromium storage and `desktop.log` live in Electron's per-user Subwave application directory, normally `~/.config/Subwave`. Back up both this directory and `~/Music/Subwave` to retain the library and its organization. Download records and completed MP3s survive restarts; an interrupted extraction offers a retry.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Show player | Ctrl+1 |
| Open audio files | Ctrl+O |
| Library | Ctrl+L |
| New playlist | Ctrl+N |
| Play / Stop | Ctrl+Space |
| Next track | Ctrl+Right |
| Mute / Unmute | Ctrl+M |
| Genre stations | Ctrl+G |
| YouTube downloads | Ctrl+J |
| Internet radio | Ctrl+I |
| Settings | Ctrl+, |
| Original | Ctrl+Shift+1 |
| Enochian | Ctrl+Shift+2 |
| Cycle skins | S, while the player has focus |
| Quit | Ctrl+Q |

The existing transport shortcuts and Media Session controls remain available. Launch flags `--library`, `--stations`, `--youtube`, `--radio` and `--settings` open those panels directly.

## Runtime requirements

The packaged target is Linux x86_64 with glibc and a working graphical session. This build uses `/usr/bin/ffmpeg`, `/usr/bin/ffprobe` and `/usr/bin/yt-dlp`; these are already installed on the verified Omarchy machine. Other machines need these tools installed. The application prefers tool binaries included in its `resources/service/bin` directory when present.

Electron supplies the application runtime and an explicit Node shim for yt-dlp's JavaScript extraction. A separate system Node installation is not needed to run the installed app. YouTube extraction requirements can change, so keep yt-dlp and its extraction components current. Other architectures and distributions need their own build and verification.

## Build from source

Use Node 22.12 or newer and npm to build:

```sh
npm --prefix web ci
npm --prefix desktop ci
npm --prefix desktop run lint
npm --prefix desktop test
npm --prefix web run lint
npm run desktop:build
```

Run heavy commands one at a time. The build bundles the local station service first, builds the interface into a separate `.next-desktop` directory, and produces the launch helper, AppImage and tar.gz in `desktop/dist/`. It includes local fonts and the four Original/Enochian palettes, strips local web environment files and preserves the regular web build. `npm run desktop` starts a prepared development build.

The interface and station bind only to loopback. The desktop gateway privately authorizes requests to its owned station; the renderer has no Node access. Native file operations use a sender-checked bridge and the operating system's file/save dialogs. External links open in your browser. For isolated development verification, `SUBWAVE_DESKTOP_DATA_DIR` selects a separate application profile; the Music directory remains the system Music directory.
