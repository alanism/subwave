# Enochian edition

Reference: https://uiux-nonhumanintelligence.web.app/UIUX

The listener is a physical receiver: one enclosure, speaker grille, inset display,
power switch, three action keys and a volume dial. The existing player core owns
audio, authentication and live metadata. All controls are HTML, not a rendered image.

## Visual specification

- White page (#ffffff), ivory enclosure (#e8e5dc), obsidian display (#1c1d1b),
  cinnabar signal (#c43727). Obsidian theme uses #171817 page and #292a27 enclosure.
- IBM Plex Sans body and headings; IBM Plex Mono instrument labels. Headings 30–36px,
  header 24px, secondary text 18px, uppercase instrument legends 11–13px.
- Desktop: wide centered receiver, two equal speaker/display columns, control row
  below. Mobile: display above grille, power and dial flanking the three keys.
- One 28px enclosure with bevel, 18px display, capsule grille, 9px dished keys.
  Shadows simulate physical depth only; no image overlays or decorative gradients.
- Power icon: Lucide, 2px outline. Volume: charcoal knob, red marker, dot ticks.
  Focus rings, pressed states and disabled states remain visible.
- Header: SUB/WAVE, Personal radio, Appearance. Receiver: SUB/WAVE, ENOCHIAN
  RECEIVER, STANDBY / TUNING / ON AIR / OFF AIR. Display: NOW PLAYING, live title
  and artist, or Waiting for the broadcast / Tune in to hear what is on.
  Bottom: ONE STATION / ONE SHARED STREAM. Keys: TUNE IN / TUNE OUT, REQUEST,
  TIMELINE, SCHEDULE, VOLUME. Footer: SUB/WAVE × ENOCHIAN, INTERNET RADIO.
- Below: One broadcast. A shared frequency. / Your library. Your DJ. Your station.
  Navigation: LISTEN, BOOTH, ADMIN.

## Integration

`enochian` is the fresh-install skin; `enochian-ivory` the fresh-install theme.
Saved operator and listener selections retain precedence. Both themes are in the
existing registry, so admin primitives and listener drawers share their palette.
Appearance still exposes every upstream skin. Request, timeline, booth and schedule
use the upstream components. No listener skip, seeking, fake equalizer or fake signal.

## Activation on an existing station

In Admin → Settings choose **Enochian** as the player skin and **Enochian Ivory**
or **Enochian Obsidian** as the theme. A listener can also choose them in Appearance.
Persisted choices intentionally outrank the new fresh-install defaults.

The broadcast stack still needs its normal Navidrome, Icecast and DJ configuration.
This is a presentation change, not a hosted station or a backend replacement.

## Asset provenance

The concept and woven grille were generated with the built-in Image Gen tool.
The shipped grille is `web/public/skins/enochian/grille.webp`; it is the only
raster surface. All legends, status, switches, keys and dial geometry are code.
The asset brief was: straight-on macro of premium obsidian woven speaker fabric,
fine charcoal fibres, low contrast, evenly lit, edge-to-edge, no enclosure,
markings, text, vignette or gradient. The concept brief specified the complete
receiver, white page, Ivory enclosure, Cinnabar power, dark display, three
physical keys, weighted dial, IBM Plex typography and the exact visible copy
listed above. No raster text is used as an interactive control.
