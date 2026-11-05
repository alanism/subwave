# Enochian AV receiver — Andy Allen inspired rubric

Version 1.0 · frozen before implementation · 2026-11-05

This is a project-specific evaluation inspired by the supplied Andy Allen hero card (`work/qa/council/andy_allen_design_hero.md`), interpreted against the user's two JBL receiver photographs. It is not a rubric authored by Andy Allen, a personal review, or an endorsement. The reference photos and the user's requirement to preserve the Enochian source control designs are the product specification.

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
| 1 | Wide, low silhouette | No enclosure | Tall dashboard blocks | Wide group, weak appliance ratio | Single faceplate roughly 3–4.5:1 at normal desktop size | Low receiver silhouette holds at full view and thumbnail |
| 2 | Continuous faceplate | Separate tiles | Several disconnected material panels | Common background with visible card fragments | One continuous faceplate mounts every front control | Faceplate reads as a manufactured part with clear perimeter |
| 3 | Cabinet depth | Flat webpage | Random drop shadows | Some enclosure edge visible | Restrained top/rear edge gives cabinet depth | Top, front and lower edge form a consistent physical object |
| 4 | Grounding | Controls float in page space | Cards float independently | Enclosure weakly grounded | Base/feet and one contact shadow ground the unit | Object sits convincingly with consistent support and shadow |
| 5 | Knob placement and balance | One giant central/off-axis knob | Unbalanced isolated knob tiles | Two knobs but weak relation | Input left, volume right, shared centerline | Knob spacing and scale balance the display like reference hardware |
| 6 | Display aperture | Huge text banner | Floating rounded card screen | Dark screen loosely placed | Compact dark inset centered in the faceplate | Aperture, margins and content feel like one restrained equipment display |
| 7 | Subsidiary key scale | Keys look like game buttons | Large controls compete with knobs | Some keys still oversized | Small uniform tactile keys below display | Key size, spacing and labeling closely resemble AV function controls |
| 8 | Mounted controls | Widgets in separate presentation cards | Individual demo pedestals | Mixed mounted and card-like controls | Controls attach directly to common panel | Sockets, knob bases and switches visually belong to that panel |
| 9 | Material honesty | Flat generic UI controls | Conflicting arbitrary gradients | Some authored materials, mixed finishes | Authored ivory/metal/obsidian surfaces used coherently | Material response is consistent across panel, knobs, sockets and switch |
| 10 | Lighting consistency | Contradictory highlights | Multiple unrelated shadow directions | Mostly consistent lighting | Highlights and shadows share a believable light direction | Depth cues remain quiet, continuous and consistent in both finishes |
| 11 | Edges, seams and manufacturing | Random card radii | Inconsistent outlines and corners | Basic perimeter with weak seams | Fine edge, seam and corner logic reads as hardware | All exposed edges support one plausible manufacturing language |
| 12 | Fine equipment typography | Dashboard headings dominate | Oversized promotional type | Mixed web/equipment type | Small quiet printed labels with readable screen text | Typography has precise baselines, spacing and functional hierarchy |
| 13 | Authored knob geometry | Generic replacement | Approximate lookalike knob | Original shape with altered materials | Original ticks, cap, marker, sweep and material retained | Geometry and behavior remain intact under actual resized interaction |
| 14 | Authored keys/switch/slider | Generic UI buttons | Arcade substitutions | Some source controls retained | Original sockets, caps, ribbed thumb and switch retained | All authored control signatures and press/drag feedback remain intact |
| 15 | Physical interaction feel | Inert decoration | Arbitrary flashy animation | Working controls with inconsistent response | Original springs, press travel and drag behavior feel controlled | Pointer, key, cancel and reduced motion all preserve clear control |
| 16 | Signal discipline | Fake EQ/VU/tuner readings | Decorative LEDs imply false state | Real state mixed with ornament | Only real source/playback/mute/gain indicators | Restrained indicators convey actual state with no invented capabilities |
| 17 | Finish continuity | Unrelated cards/materials | Theme changes break hierarchy | One finish coherent, other uneven | Ivory and obsidian each read as one enclosure | Both finishes preserve depth, legibility and authored materials |
| 18 | Useful precision | Tiny unusable controls | Imprecise/hidden interaction | Pointer works, keyboard weak | Readable labels and precise keyboard alternatives | Source, gain and transport are precise across zoom and input methods |
| 19 | Edited composition | Everything in the asset catalog displayed | Decorative clutter and duplicate controls | Partially edited front panel | Only necessary playback/source/function controls on face | Closed receiver has no demo scaffolding, duplicated nav or visual filler |
| 20 | Object-level craft | Would not be mistaken for equipment | Audio-themed webpage | Plausible prototype with obvious rough edges | Convincing complete receiver with a distinctive Enochian identity | Whole object withstands reference comparison in empty, playing and dark states |

## Baseline: supplied screenshot of 1.2.1

**46/100 — fails receiver gates.** The screen is a dashboard of separate oversized control stages. Source fidelity and working controls deserve credit; they do not compensate for the missing enclosure and receiver hierarchy. Interaction credit uses the existing verified 1.2.1 behavior; new layout behavior must be checked again.

| Criterion | Baseline |
|---|---:|
| 01. Wide, low silhouette | 1/5 |
| 02. Continuous faceplate | 1/5 |
| 03. Cabinet depth | 1/5 |
| 04. Grounding | 1/5 |
| 05. Knob placement and balance | 1/5 |
| 06. Display aperture | 2/5 |
| 07. Subsidiary key scale | 2/5 |
| 08. Mounted controls | 1/5 |
| 09. Material honesty | 3/5 |
| 10. Lighting consistency | 3/5 |
| 11. Edges, seams and manufacturing | 1/5 |
| 12. Fine equipment typography | 2/5 |
| 13. Authored knob geometry | 5/5 |
| 14. Authored keys/switch/slider | 5/5 |
| 15. Physical interaction feel | 4/5 |
| 16. Signal discipline | 4/5 |
| 17. Finish continuity | 3/5 |
| 18. Useful precision | 4/5 |
| 19. Edited composition | 1/5 |
| 20. Object-level craft | 1/5 |

Final assessment and evidence: [receiver evaluation](enochian-receiver-evaluation.md). The previous 95/100 general usability assessment is separate and is not a receiver-design score.
