# Level 0

A tiny browser game: drive a car through one long backrooms corridor full of traps and try to reach the EXIT door
with anything left of it.

- **Controls:** hold **▶** for gas, **◀** to reverse (both also tilt the car in mid-air), tap **⤒** to hop.
  Keyboard: arrows / A D, W or space to hop, R to restart.
- **The car is built from ~24 separate pieces** (frame sections, engine, doors, fenders, hood, roof, pillars,
  windows, bumpers, fuel tank, lights) welded together, plus two wheels on sprung axles. Welds snap, saws slice
  pieces in two (and slice the halves again), crushers flatten them, glass shatters, tyres pop on spikes, a hit
  fuel tank blows up. You can keep driving as long as the engine is still connected to a wheel.
- **Traps:** crushers, sliding and dropping buzz saws, a spike trench, rotten floor tiles, mines.
- Tap **👍** after any run you like. On the menu, open **👍** to caption and reorder them, then **🎬 Save video**:
  every liked run is replayed exactly (the physics is deterministic, runs are stored as button presses) and rendered
  into one **1080×1920, 60 fps H.264 MP4 with sound**, ready for TikTok / Reels / Shorts.

Play it: https://emad297.github.io/draw-bridge-game/

## Code

| file | what |
|---|---|
| [`js/level.js`](js/level.js) | the level as plain data: trenches and traps along the corridor |
| [`js/physics.js`](js/physics.js) | planck.js physics: the car's pieces (`CAR`), how they weld, split, shred and burn; traps; tuning at the top |
| [`js/scene.js`](js/scene.js) | three.js: the backrooms, one mesh per car piece, sparks/smoke/fire/oil, follow camera |
| [`js/audio.js`](js/audio.js) | real recordings (crashes, metal, glass, engine, tyres, fire) mixed per event; also renders the video's audio |
| [`js/app.js`](js/app.js) | menu, controls, likes, video export |

Sounds: Kenney Impact Sounds (CC0) and CC0 recordings from BigSoundBank, The Designer's Choice and OpenGameArt —
see [`sfx/LICENSE-sources.txt`](sfx/LICENSE-sources.txt).

## Publishing an update

Run `python3 tools/bump-version.py` before committing. It stamps every file with a new version so phones load the
update immediately instead of a cached copy.

## Running locally

Any static server works, e.g. `python3 -m http.server`, then open http://localhost:8000.
Three.js and planck.js are vendored in `vendor/`, so there's no build step.
