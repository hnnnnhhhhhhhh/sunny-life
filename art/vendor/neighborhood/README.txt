NEIGHBORHOOD ASSET KIT

Source models
- sofa.glb: GlamVelvetSofa, Eric Chadwick / Wayfair LLC, CC BY 4.0.
- curtains.glb: Curtains Double, Quaternius, CC0.
- sedan.glb, taxi.glb, van.glb and Textures/colormap.png: Kenney Car Kit, CC0.
- Download URLs, file hashes and authors are recorded in sources.json.
- Public attribution and adaptation details:
  public/models/neighborhood/LICENSE.txt.

Rebuild
  npm run neighborhood:rebuild

This rebuilds art/blender/sunny-neighborhood.blend and the public GLB/gzip
bundle. Do not run it over manual Blender changes without preserving them.
BLENDER_BIN may specify an alternate Blender 4.5+ executable.

Gameplay contracts
- Sofa footprint: 3.0 x 1.15 m, center seat at X=0, Z=0.18, Y approximately 0.68.
- Existing sofa IDs, color options, price and save records are preserved.
- Curtain model is normalized to one meter and fitted to each window.
  Only the cloth has a Breeze morph; the rail remains static.
- Vehicle roots are centered and grounded. Each has four isolated wheel
  pivots. Runtime cars stay on separate lanes at street Y=-6.6.
- Traffic and curtains stop with life pause and during building/avatar modes.
- A finite six-car pool is reused. Vehicles appear and reset outside the
  playable apartment, with staggered departures and no same-lane overlap.

Autonomy
- Existing urgent-need selection runs before leisure.
- Healthy residents can rest, watch TV, chat online or take a reachable walk.
- Leisure uses actual furniture plans, seat animation and existing gains.
- Manual input cancels autonomous walks and takes priority over leisure.
- Turning off autonomy stops autonomous activities and movement.

Music
- Native Web Audio, original gentle keyboard score, no external recordings.
- Disabled initially; the user enables it with the audio button.
- Volume and enabled preference use sunny-life.music.v1 independently of saves.
- Hidden pages stop scheduling and suspend audio; returning resumes only if
  the user previously enabled it. Mute stops queued voices.

Checks
  npm test
  npm run build
  npx playwright test tests/browser/neighborhood.spec.js
  CI=1 npx playwright test tests/browser/neighborhood.spec.js

Public builds do not include the unrelated private Mrs_Afton resident preview.
