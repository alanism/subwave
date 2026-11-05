# Enochian receiver evaluation

2026-11-05 · status: installed 1.3.0 verified; owner aesthetic acceptance pending

The supplied screenshot of 1.2.1 fails as an AV receiver. It uses genuine authored components but presents them as separate demonstration tiles. Passing prior file/playback/playlist checks does not establish industrial-design quality.

The two independent, frozen rubrics are [Ryo Lu inspired](enochian-receiver-ryo-rubric.md) and [Andy Allen inspired](enochian-receiver-andy-rubric.md). These are project interpretations of the supplied hero cards, not reviews or endorsements by those designers.

| Assessment | Ryo /100 | Andy /100 | Receiver gates |
|---|---:|---:|---|
| User-supplied 1.2.1 screenshot | 50 | 46 | Fail: no chassis, missing input knob, disconnected control stages |
| Rebuilt 1.3.0 receiver | **96** | **95** | All receiver gates pass in the installed app; evidence and limits below |

## Reference-driven corrections

| Supplied JBL evidence | Rejected app evidence | Required correction |
|---|---|---|
| Single low faceplate, approximately 3.3:1 or 3.8:1 | Tall page of independent instrument cards | One low, bounded horizontal chassis |
| Input knob left, screen center, volume right | One enormous volume knob and separate playback tile | Two real functional knobs on a shared axis |
| Small central black display | Full-width text banner | Restrained recessed display with compact track/source/state text |
| Small aligned function controls | Large vertical button bank plus repeated navigation | One small horizontal front-panel function row |
| Cabinet edge, fine seams and grounded base | Floating widgets in large pale tiles | Consistent enclosure depth, edge, base and contact shadow |
| Fine labels printed around controls | Dashboard section headings | Quiet equipment label hierarchy |

## Source-to-function mapping

| Authored Enochian component | Receiver role | Adaptation boundary |
|---|---|---|
| Rotary Knob 01 (original ticks, base, cap, marker) | Left: select actual station or playlist; right: volume | Resize mounting only. Input adapter adds discrete stops and commits source on release/key press. Volume keeps original continuous behavior. |
| Keyboard display | Central track, artist, selected source, real playback and volume state | Compact aperture, typography and content only; no invented audio telemetry |
| Radio Player power ring | Start/stop; open Library when the selected source is empty | Mount power head without its demo case/readout |
| Input Selector sockets and sprung caps | Open files, Library, Genres, YouTube, Next, Settings | Horizontal arrangement on faceplate; preserve cap/socket materials and spring travel |
| Toggle Switch 01 | Mute | Resized mount; actual mute action and state |
| Slider 01, ribbed thumb | Fine volume control below receiver, disclosed on request | Original continuous drag/keyboard behavior, same actual gain value |

The small-screen layout may become less low to preserve usable controls at Linux minimum window size and 125% zoom. It must retain the input / display / volume hierarchy. No fake tuner, VU meters, HDMI ports or surround controls are added.

## Iteration record

1. **Baseline:** user-supplied 1.2.1 screenshot, Ryo 50/100 and Andy 46/100; receiver gates fail.
2. **First live build:** one enclosure and two functional knobs. Reference comparison exposed an over-wide display, residual key-bank demo shadow and padded mute mounting. These were corrected in live code; no intermediate score was invented.
3. **Compact-window check:** the minimum window at 125% exposed crowded lower controls. Knobs were reduced for this size and power/mute moved clear of the source labels.
4. **Finish check:** Obsidian retained a black rectangular demo-case patch at power. The mount was corrected, and the state dot kept visible against its authored white ring. Final snapshot hashes remain unchanged.
5. **Final assessment:** score every frozen criterion below. The former general-usability score is neither reused nor added to these totals. These are internal project assessments, not designer endorsements or a claim that the owner has accepted the result.

## Ryo Lu inspired assessment

| # | Frozen criterion | Final /5 | Evidence / deduction |
|---|---|---:|---|
| 01 | Receiver recognition | 5 | One bounded low receiver is recognizable in the normal-size native and 1280px browser captures. |
| 02 | One coherent object | 5 | Both knobs, the display and all primary controls share a continuous enclosure; demo tiles are gone. |
| 03 | Input → display → volume hierarchy | 5 | Left INPUT, central display and right VOLUME remain distinct across all eight receiver layouts. |
| 04 | Primary display economy | 5 | The screen occupies the central aperture; short source, title, artist and state replace a page-width message banner. |
| 05 | Control-to-function mapping | 5 | Input changes actual collections; power starts/stops or opens empty-source Library; volume/mute affect real audio. |
| 06 | Progressive disclosure | 5 | Six direct function keys disclose the existing complete library/genre/YouTube/settings tools; fine volume is optional. |
| 07 | Navigation duplication | 5 | Enochian has one function-key row, without duplicate toolbar/footer navigation. Native menus remain. |
| 08 | Source identity | 5 | Input label, accessible value text, central source name and backend selected source agree after pointer/keyboard selection. |
| 09 | Playback state honesty | 4 | Actual playback/connecting/stopped states are shown. Deduction: track metadata still follows the existing polled local stream, so it can lag a source/track transition. |
| 10 | Empty-state restraint | 5 | Empty source retains the same receiver and offers Open files, YouTube and enabled power-to-Library. |
| 11 | Volume and mute legibility | 5 | Gain is printed beside volume and on screen; knob, slider and mute were checked against actual audio.volume. |
| 12 | Label hierarchy | 4 | Brand, fine printed labels and stronger display text are consistent. Deduction: small labels remain deliberately fine at compact sizes. |
| 13 | Alignment and rhythm | 5 | Knobs share one axis; function keys share a baseline; screen and key row share the central mounting grid. |
| 14 | Control scale hierarchy | 5 | Normal-size 141px dial assemblies lead; 36px source caps are mounted at smaller scale. Compact mode reduces both knobs. |
| 15 | Authored component fidelity | 5 | Immutable atlas CSS/HTML/JS hashes pass; original knob ticks/base/cap/marker and key/socket/switch/slider parts remain. |
| 16 | Keyboard and focus | 4 | Knob/slider keys, input Home/arrows, function access and modal Escape/return focus pass. Deduction: no new full physical OS-dialog keyboard walkthrough was recorded; native chooser results in regression tests are stubbed. |
| 17 | Resizing and zoom | 4 | 800×620 and 1440×900 at 100%/125% pass. Deduction: minimum-size receiver is taller than the photo proportions to keep controls usable. |
| 18 | Management flow continuity | 5 | Installed file import/export, playback/mute/Next, local panels, playlist persistence and agent regression pass; shared audio element survives skin/finish changes. |
| 19 | Visual restraint | 5 | Vents, cabinet edge and feet only describe enclosure structure; there are no invented tuner readings, meters, ports or processing modes. |
| 20 | Live product coherence | 5 | Final working native build and browser view agree with the receiver hierarchy; Original retains its existing layout and both share one audio owner. |

**Total: 96/100.** Every row is at least 4.

## Andy Allen inspired assessment

| # | Frozen criterion | Final /5 | Evidence / deduction |
|---|---|---:|---|
| 01 | Wide, low silhouette | 5 | Normal desktop face is 1160×310 CSS px, approximately 3.74:1, between the supplied reference face ratios. |
| 02 | Continuous faceplate | 5 | One continuous matte face has a bounded edge and mounts both knobs, screen, keys, power and mute. |
| 03 | Cabinet depth | 4 | Top cabinet edge and vents provide depth. Deduction: this is a restrained 2D enclosure, without the photographs’ full three-dimensional surface detail. |
| 04 | Grounding | 5 | A dark base, two feet and a single grounded enclosure shadow replace independent floating widget shadows. |
| 05 | Knob placement and balance | 5 | Equal authored dial assemblies flank the central screen at one centerline; neither becomes a full-page instrument. |
| 06 | Display aperture | 5 | Compact dark aperture is centered and recessed; text fits actual music/source/state rather than a large instructional panel. |
| 07 | Subsidiary key scale | 5 | Subsidiary function caps are much smaller than the main knobs and form one orderly row below the display. |
| 08 | Mounted controls | 5 | Key-bank deck/shadow and power demo case/readout are removed at mounting boundaries; original tactile parts mount directly. |
| 09 | Material honesty | 4 | Authored ivory/obsidian knob, cap, socket and switch materials remain. Deduction: the added enclosure is matte, without the silver reference’s fine brushed-metal detail. |
| 10 | Lighting consistency | 5 | Top/front/base shading is restrained; source control highlights and shadows remain intact; no competing animated lighting. |
| 11 | Edges, seams and manufacturing | 5 | Fine face perimeter, slightly raised front edge, dark lower seam and feet establish consistent enclosure boundaries. |
| 12 | Fine equipment typography | 4 | Fine monospaced equipment labels and clear track text are aligned. Deduction: compact-window labels are intentionally small; they are not a substitute for the full panel controls. |
| 13 | Authored knob geometry | 5 | Original 220px geometry, dot/end ticks, cap/marker and ±135° sweep retain their proportions when mounted at reduced scale. |
| 14 | Authored keys/switch/slider | 5 | Original 36px sprung caps, 46px sockets, 30px power ring, toggle and five-rib slider thumb remain; no arcade substitutions. |
| 15 | Physical interaction feel | 5 | Original press/release springs and continuous volume drag remain; discrete input preview commits once on release and reverses on cancellation; reduced motion remains supported. |
| 16 | Signal discipline | 5 | Power/playing/mute/source/volume state is real. The power indicator is made legible on its authored white ring in both finishes; no fake audio telemetry. |
| 17 | Finish continuity | 4 | Ivory and Obsidian each keep one enclosure and original control finishes. Deduction: the authored black outer dial ticks have lower contrast on Obsidian; source labels, markers and numeric gain remain legible. |
| 18 | Useful precision | 5 | Keyboard source stops and precise continuous gain alternatives work; pointer input is checked at the resized mount, and dialogs retain practical normal-sized controls. |
| 19 | Edited composition | 5 | Demo scaffolding, large section headings, redundant footer and duplicate toolbar are removed; fine gain is disclosed only when needed. |
| 20 | Object-level craft | 4 | The result reads as a coherent Enochian receiver in actual empty/playing and both-finish captures. Deduction: “wall-worthy” is an aesthetic judgment awaiting the owner’s acceptance, not something functional tests prove. |

**Total: 95/100.** Every row is at least 4.

## Verification and practical limits

The receiver flow under test is `/listen` → select an actual source with the input knob → control actual playback/gain/mute → open and close local management panels → retain one audio element through skin/finish/zoom changes.

- **Environment:** Linux Electron 45.2.3 / bundled Next 16.4.3; private virtual display, isolated library and silent test audio sink. Connected CUA browser at 1280×720 also checked `/listen`; native tests cover 800×620 and 1440×900 at 100% and exact 125%.
- **Identity/nonblank/framework overlay/console:** native player and browser route/title match; real receiver and library content render; no framework overlay; no application page errors in native receiver checks or warning/error console entries in the browser check.
- **Interactions:** pointer source preview leaves backend unchanged until release; keyboard chooses real Jazz/All sources; knob/slider/mute affect actual audio; all front-panel panel keys work and Escape restores focus; empty-source power opens Library; one audio node survives finish and zoom changes.
- **Regression:** 645 interface tests and 17 desktop tests pass; final lint/type checks and packaging pass. Native file tests cover five formats, mixed-invalid results, duplicate/cancel behavior, unchanged originals and exact MP3 export bytes. Two skins and five main areas pass 40 size/zoom combinations. Stop cancels a pending Next; Next while stopped stays stopped.
- **Agent continuity:** 21 MCP tools were discovered in a fresh 1.3.0 test profile. Import/search/genre/playlist/native playback and live YouTube search → real MP3 decode → add to genre → playback → cold relaunch passed before the final enclosure-only CSS refinements. Agent interfaces were not changed by this receiver work.
- **Native dialogs:** test chooser/save return values are simulated while real IPC, service and conversion paths run. The user’s earlier physical chooser confirmations remain historical; no claim is made that a person manually repeated every OS dialog on 1.3.0.
- **Aesthetic limits:** compact windows use taller proportions; fine labels and lower-contrast authored Obsidian ticks retain the deductions above. Tactility and object quality are assessed from live controls and actual render captures, not proven by test counts. The owner’s aesthetic acceptance remains outstanding.

Main source commands: `npm --prefix web run lint`, `npm --prefix web test`, `npm --prefix desktop run lint`, `npm --prefix desktop test`, `npm --prefix desktop run pack`. Private native regression scripts and logs remain in the workspace QA folder rather than being shipped as production features. No telemetry or new analytics was added.

The README includes a clean installed-app screenshot. Additional window/finish evidence is linked from the local build board. Source rubrics remain at version 1.0 with unchanged anchors.
