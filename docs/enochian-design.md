# Enochian edition — receiver composition and authored controls

Source of truth: [Enochian Elements Interactive Atlas](https://uiux-nonhumanintelligence.web.app/UIUX).
The listener embeds the author's actual HTML/CSS and ports its interaction code
to React. Receiver controls come from the Radio Player and Input Selector;
the arcade-style Button Banks and large Push Switch are not used. The atlas controls must remain faithful to their source;
layout and sizing may adapt to the station, but their materials and geometry are
not to be redesigned.

## Linux receiver composition (1.3.0)

The Linux Enochian skin is one low, wide enclosure, informed by the two JBL reference photos supplied by the owner. It mounts the input selector on the left, a compact black display centrally, and volume on the right, with small function keys below. The closed player has no duplicate toolbar, component-demo tiles or footer navigation. Original retains its own layout.

`DesktopReceiver.tsx` and `DesktopReceiver.module.css` define the enclosure, responsive mounting and local callbacks. They do not modify the vendored CSS. Mounting rules remove the atlas's demo decks/cases and readouts, arrange key rows horizontally, scale the controls, and fit display content to an equipment aperture. They retain the knobs' original base/cap/marker/ticks, key sockets/caps and springs, power ring, toggle and ribbed slider. Source DOM signatures and immutable snapshot hashes remain checked.

The input knob adds discrete stops for actual stations/playlists. Dragging previews a source; release commits once, cancellation restores the starting position, and arrows/Home/End commit a deliberate choice. The volume dial retains the source's continuous travel, 2% keyboard steps and cancellation behavior. Fine volume remains available through the source slider below the enclosure. These are real controls; cabinet vents/feet are inert structural decoration. No fake ports, frequencies or audio processing claims are added.

The supplied hero cards inform two separate frozen [receiver rubrics](design/enochian-receiver-evaluation.md): Ryo Lu for clarity/coherence, Andy Allen for object/tactile craft. The former 95-point general usability assessment is historical and does not count as a receiver score.

## Component mapping

| Atlas component | Station use | Preserved source |
| --- | --- | --- |
| Rotary Knob 01 (`#darkDial`) | Left input and right volume in the Linux receiver; hosted volume | 220px dial, original dot/end ticks, base, cap and dash; ±135° rotation, 150px drag travel, 2% arrow increments |
| Slider 01 (`#trk`) | Same volume | 280px track, 66×34px thumb and five ribs; original spring, grab offset, 1% arrows and 10% Page keys |
| Keyboard display (`#keyboardDisplay`) | Live title and artist | Original inset surface; compact aperture and text hierarchy adapt for the receiver |
| Radio Player power head (`#radio .rhead`) | Tune in/out and connection status | Original 30px white power ring and 5px state dot; local mount removes demo readout and adapts hit area |
| Toggle Switch 01 (`#std`) | Mute | Original cap, 44px throw and 3px drag threshold |
| Input Selector (`#ilk`) | Local panels, Next, genre selection and importer actions; hosted station drawers | Original 36px caps, 46px sockets and PRESS/SNAP spring travel; local faceplate uses a horizontal row with labels below |
| Search Field (`#rs`) | YouTube song/URL search | Original rolling 60px ball, field, icon, shadows and 160/20/1 spring; Escape closes and clears |
| Toggle Switch 01 (`#std`) | Automatic genre imports | Original switch, bound to the import preference |

`SourceControls.tsx`, `ReceiverControls.tsx`, `SourceSearch.tsx` and `VolumeDial.tsx` retain the original class names and DOM
parts. `Enochian.module.css` arranges the hosted player; `DesktopReceiver.module.css` mounts the local receiver. The immutable source snapshots preserve the authored control materials. Display typography and presentation containers are adapted to their actual product role.

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
This desktop fork offers Original and Enochian.

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
