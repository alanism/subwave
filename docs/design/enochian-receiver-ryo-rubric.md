# Enochian AV receiver — Ryo Lu inspired rubric

Version 1.0 · frozen before implementation · 2026-11-05

This is a project-specific evaluation inspired by the supplied Ryo Lu hero card (`work/qa/council/ryo_lu_design_hero.md`), interpreted against the user's two JBL receiver photographs. It is not a rubric authored by Ryo Lu, a personal review, or an endorsement. The reference photos and the user's requirement to preserve the Enochian source control designs are the product specification.

The Ryo lens evaluates clear structure, simple controls and a coherent working product. The Andy lens evaluates a convincing physical object, tactile control and material craft. Neither lens grants points merely for passing general usability tests.

## Scoring

20 criteria × 1–5 points = 100. Select the highest level fully supported by visible or interaction evidence; use the lower level when evidence is missing. A static screenshot cannot establish an interaction score. The release target is **at least 95/100 in each rubric**, no row below 4, and all hard gates passed. Scores are an internal design assessment; user acceptance remains decisive. Do not alter these anchors to raise a score.

Hard gates:

- One bounded, low horizontal receiver enclosure, with a left input knob, compact central display and right volume knob. At the normal desktop viewport the faceplate should be approximately 3–4.5 times wider than tall, informed by the roughly 3.3:1 and 3.8:1 faces in the supplied photographs. Smaller windows may adapt while retaining the same physical hierarchy.
- Authored Enochian control snapshots remain byte-for-byte unchanged. Layout adapters may remove demo presentation containers and resize controls, but must retain control geometry, materials, DOM signatures and real behavior. No arcade or generic replacements.
- All visible controls do real work. No invented tuner frequencies, surround modes, meters, connectors or technical claims.
- Open files, playback, volume/mute, playlists, genre stations and YouTube remain usable; one shared audio element is retained. Native keyboard and zoom behavior must pass regression checks.

## Five-level anchors

| # | Criterion | 1 — Fails | 2 — Weak | 3 — Partial | 4 — Good | 5 — Excellent |
|---|---|---|---|---|---|---|
| 1 | Receiver recognition | Unrelated webpage tiles | Audio controls, no appliance | One grouped unit, weak receiver identity | Recognizable receiver in one glance | Unmistakable receiver at full and thumbnail sizes |
| 2 | One coherent object | Several floating component cards | Multiple disconnected stages | Partial common enclosure | All primary controls share one faceplate | Every primary element belongs to one coherent appliance |
| 3 | Input → display → volume hierarchy | No source control or hierarchy | Volume dominates the entire page | Two of three anchors are clear | Left input, central display, right volume read clearly | Three anchors remain balanced across sizes and states |
| 4 | Primary display economy | Full-page message banner | Oversized screen crowds controls | Screen and controls compete | Compact central screen carries essential state | Screen is compact, legible and calmly subordinate to the chassis |
| 5 | Control-to-function mapping | Decorative or misleading controls | Several labels/actions conflict | Main actions work; one ambiguous mapping | Every receiver control has a clear real action | Action, label, location and feedback agree throughout |
| 6 | Progressive disclosure | Everything spread across dashboard | Management crowds playback | Some secondary tools tucked away | Library, genres, YouTube and settings open on demand | Closed receiver stays simple; every advanced flow remains easy to reach |
| 7 | Navigation duplication | Repeated toolbars, footer and control banks | Several redundant paths dominate | One redundant navigation layer remains | One integrated set of front-panel function keys | No competing app chrome; native menus provide expected alternatives |
| 8 | Source identity | Source absent or wrong | Generic source label only | Source visible away from selector | Selected source printed next to the input control | Source label and display agree immediately after selection |
| 9 | Playback state honesty | Fake playing indicators | Contradictory stopped/playing labels | State partly delayed or ambiguous | Stopped, connecting and playing are truthful | Real playback, display and power state stay coherent through errors |
| 10 | Empty-state restraint | Large instructional block takes over | Empty state dominates faceplate | Brief copy but unclear next action | Short display prompt and clearly named import/library keys | Empty receiver retains its proportions and offers an obvious working first action |
| 11 | Volume and mute legibility | No readable gain/mute state | Ambiguous or disconnected readout | Gain shown but mute weak | Numeric volume by knob; mute clearly indicated | Knob, slider, mute and actual output agree without competing readouts |
| 12 | Label hierarchy | Large headings on every widget | Web section labels dominate | Mixed label sizes and styles | Quiet printed equipment labels; screen text is stronger | Brand, input, function and status type form one disciplined hierarchy |
| 13 | Alignment and rhythm | Unrelated card/grid alignments | Large arbitrary gaps | Mostly aligned with isolated breaks | Knob centers, screen and key baselines are deliberate | All spacings and baselines resolve into one repeatable faceplate grid |
| 14 | Control scale hierarchy | Knob or keys consume whole viewport | Controls almost equal importance | Knobs lead but subsidiary controls oversized | Knobs lead; small keys and switch sit below | Fine scale relationships closely match the reference equipment |
| 15 | Authored component fidelity | Generic replacements | Lookalike CSS recreations | Some original assets retained | Original control DOM/materials preserved with layout adaptation | Original snapshots unchanged; resizing and live adapters verified |
| 16 | Keyboard and focus | Controls inaccessible by keyboard | Unlabeled or invisible focus | Most controls reachable | All controls labeled, focusable and keyboard operable | Source, transport, dialogs and return focus verified without pointer |
| 17 | Resizing and zoom | Layout breaks at supported size | Controls clip or overlap | One size works, smaller cramped | 800×620 and 125% remain usable | Receiver identity and all workflows survive supported sizes and zoom |
| 18 | Management flow continuity | New skin breaks tools | Several local actions lost | Tools accessible through workarounds | Files, playback, playlists, genres and YouTube remain direct | All core flows verified with one stable audio owner |
| 19 | Visual restraint | Excess decoration obscures use | Effects compete with playback | A few unnecessary flourishes | Only functional indicators and structural enclosure details | Every visible element earns its place; no fake audio specifications |
| 20 | Live product coherence | Static mockup only | Rendered shell with dead controls | Working partial prototype | Real application matches the intended receiver composition | Installed receiver, panels and interactions form one verified product |

## Baseline: supplied screenshot of 1.2.1

**50/100 — fails receiver gates.** The screen is a dashboard of separate oversized control stages. Source fidelity and working controls deserve credit; they do not compensate for the missing enclosure and receiver hierarchy. Interaction credit uses the existing verified 1.2.1 behavior; new layout behavior must be checked again.

| Criterion | Baseline |
|---|---:|
| 01. Receiver recognition | 1/5 |
| 02. One coherent object | 1/5 |
| 03. Input → display → volume hierarchy | 1/5 |
| 04. Primary display economy | 2/5 |
| 05. Control-to-function mapping | 4/5 |
| 06. Progressive disclosure | 3/5 |
| 07. Navigation duplication | 1/5 |
| 08. Source identity | 2/5 |
| 09. Playback state honesty | 4/5 |
| 10. Empty-state restraint | 2/5 |
| 11. Volume and mute legibility | 4/5 |
| 12. Label hierarchy | 2/5 |
| 13. Alignment and rhythm | 2/5 |
| 14. Control scale hierarchy | 1/5 |
| 15. Authored component fidelity | 5/5 |
| 16. Keyboard and focus | 4/5 |
| 17. Resizing and zoom | 3/5 |
| 18. Management flow continuity | 4/5 |
| 19. Visual restraint | 2/5 |
| 20. Live product coherence | 2/5 |

Final assessment and evidence: [receiver evaluation](enochian-receiver-evaluation.md). The previous 95/100 general usability assessment is separate and is not a receiver-design score.
