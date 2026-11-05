# Enochian edition — original atlas components

Source of truth: [Enochian Elements Interactive Atlas](https://uiux-nonhumanintelligence.web.app/UIUX).
The listener embeds the author's actual HTML/CSS and ports its interaction code
to React. Receiver controls come from the Radio Player and Input Selector;
the arcade-style Button Banks and large Push Switch are not used. The atlas controls must remain faithful to their source;
layout and sizing may adapt to the station, but their materials and geometry are
not to be redesigned.

## Component mapping

| Atlas component | Station use | Preserved source |
| --- | --- | --- |
| Rotary Knob 01 (`#darkDial`) | Volume | 220px dial, original dot/end ticks, base, cap and dash; ±135° rotation, 150px drag travel, 2% arrow increments |
| Slider 01 (`#trk`) | Same volume | 280px track, 66×34px thumb and five ribs; original spring, grab offset, 1% arrows and 10% Page keys |
| Keyboard display (`#keyboardDisplay`) | Live title and artist | Original inset surface, padding, font and shadow; width follows the page |
| Radio Player power head (`#radio .rhead`) | Tune in/out and connection status | Original 30px white power ring, 5px state dot, display, 70×72px hit area and receiver finishes |
| Toggle Switch 01 (`#std`) | Mute | Original cap, 44px throw and 3px drag threshold |
| Input Selector (`#ilk`) | Local panels, Next, genre selection and importer actions; hosted station drawers | Original 36px Ivory caps, 46px sockets, side labels, staggered rows, PRESS/SNAP spring travel and Ivory/Obsidian deck |
| Search Field (`#rs`) | YouTube song/URL search | Original rolling 60px ball, field, icon, shadows and 160/20/1 spring; Escape closes and clears |
| Toggle Switch 01 (`#std`) | Automatic genre imports | Original switch, bound to the import preference |

`SourceControls.tsx`, `ReceiverControls.tsx`, `SourceSearch.tsx` and `VolumeDial.tsx` retain the original class names and DOM
parts. `Enochian.module.css` only arranges these components and restores the
atlas's inherited typography/tokens. It does not restyle their surfaces.

## Source preservation

Snapshots are kept in `web/components/skins/enochian/vendor/`:

- `controls.css`: byte-for-byte source from
  [/UIUX/controls.css?v=a673dc924139](https://uiux-nonhumanintelligence.web.app/UIUX/controls.css?v=a673dc924139).
  SHA-256: `a673dc924139b8d46e6967a0b594d8fbff6498978097e21c421a3f4e3082e8ca`.
- `controls.reference.js.txt`: unmodified interaction source from
  [/UIUX/controls.js?v=c6829d0d7f9c](https://uiux-nonhumanintelligence.web.app/UIUX/controls.js?v=c6829d0d7f9c).
  SHA-256: `c6829d0d7f9c8a4745bb1961a536f3f1af140df8839919ccdadc58c1ffef519b`.
- `atlas.reference.html.txt`: original markup for comparison.
- `fonts.css`: the source's IBM Plex font declarations, with font URLs changed
  to the local copies in `web/public/skins/enochian/fonts/`.

`interaction.ts` adapts the original `driveDial`, `makeHSlider`, `makeToggle` and
`Spring` code: typed element refs replace global IDs; callbacks update PlayerCore;
listeners, animations and observers are cleaned up on unmount. Spring parameters,
integration step, geometry and keyboard increments are preserved. Reduced-motion
and lite mode settle directly. Receiver keys use the original PRESS parameters
(720/32/.55), SNAP release, and `--lift` positions of 1 and .15. The receiver
power dot follows the actual tune state. Momentary import actions return on
release; selected drawer keys and pending jobs remain seated.
`feedback.ts` uses the original filtered-noise
click envelopes and closes its AudioContext on unmount; station mute disables it.
The atlas's demonstration audio is not used as a station stream.

The Ivory/Obsidian page palettes use the source atlas's exact tokens. No generated
images are used to approximate any control. The gallery preview is a screenshot
of the rendered application.

## Integration and activation

The existing player core still owns audio, station authentication and metadata.
Power uses `useTuneInGate`; both volume controls update the same player value;
mute updates actual playback. Request, timeline, schedule and booth reuse the
upstream components in drawers. No broadcast/backend configuration is replaced.

`enochian` and `enochian-ivory` are fresh-install defaults. Saved operator and
listener choices retain precedence. On an existing station select **Enochian**
and **Enochian Ivory** or **Enochian Obsidian** in Appearance or Admin → Settings.
All upstream skins remain available.

The hosted web station still needs its normal Navidrome, Icecast and DJ configuration.
The Linux desktop edition starts its bundled local service instead, with no login
or station setup. Its shared Library, Playlists, Genre stations, YouTube and Settings
panels preserve one audio element across either skin. See [the desktop guide](../desktop/README.md).

## Verification

`npm test -- enochian` checks the unmodified source snapshots, original dial
geometry and the adapted spring's settling/cleanup. Browser checks compare
computed gradients, shadows, dimensions, borders, padding and typography against
the live source, then exercise the linked volume controls, mute, power and
drawers at desktop and mobile widths.
