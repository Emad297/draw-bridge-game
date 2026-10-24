# Draw Bridge

A tiny browser game: draw a line, press **GO**, and see whether the little yellow car makes it to the flag.

- Tap **👍** after any run you like (fails count too, and they're often the funniest).
- On the menu, open **👍** to see your liked runs. Add captions, reorder them, then press **🎬 Save video**.
  Every liked run is replayed exactly (the physics is deterministic) and rendered frame by frame into one
  **1080×1920, 60 fps, H.264 MP4 (~24 Mbit/s) with AAC audio** — ready for TikTok / Reels / Shorts. Only the 3D scene is
  in the video (no buttons or menus); a caption appears only if you type one.
- Tap **🎨** while drawing (or a swatch on the menu) to switch between 10 styles of sky, buildings and car.

Play it: https://emad297.github.io/draw-bridge-game/

## How the world behaves

- **Drawings stay where you draw them.** A line that touches a cliff (or the canyon floor) is fixed to it; lines that touch each other are joined. Lines touching nothing fall. Hard enough pulls rip a line loose.
- **The car takes damage** from hard landings, crashes, spikes, bullets and saws: it smokes, loses its cabin and a wheel, catches fire and finally explodes.
- **The cliffs break.** Their edges are made of blocks that crack off under big impacts and explosions, raining rocks and dust.
- Sounds are real recordings (Kenney impact & sci-fi packs, CC0 — `sfx/`) mixed with a synthesized engine, tyres, fire and wind.
- Pressing **←** during a run cancels it and takes you back to your drawing.

Damage/destruction strength is tuned at the top of [`js/physics.js`](js/physics.js).

## Adding levels

All levels live in [`js/levels.js`](js/levels.js) as plain data. Copy one entry and change the numbers:

| field | meaning |
|---|---|
| `solids` | brick towers: `[x0, x1, topY]` |
| `car` / `flag` | start position / goal |
| `ink` | metres of ink the player gets |
| `speed` | how fast the car drives |
| `view` | camera frame: `[centreX, centreY, width, height]` |
| `floor` | optional canyon floor height (default: 9 m below the lowest cliff; `null` = bottomless) |
| `hazards` | `spinner` (spinning spike wheel that shoots), `saw` (moving buzz saw), `fan` (blows things upward) |

New hazard types go in `js/physics.js` (behaviour) and `js/scene.js` (looks).

## Adding styles

Each style is a complete world, not just a colour swap: `env.build` picks the surroundings (distant mountains or skyline, vegetation, props, weather — see [`js/world.js`](js/world.js)), `env.ground` the ground texture and `env.cliff` the cliff shape (depth, rough or layered rock, with or without a top slab).

Styles live in [`js/themes.js`](js/themes.js) (`skyFx` sets the sun/moon position, size and glow; the sky and clouds are drawn by [`js/sky.js`](js/sky.js)). Building patterns are painted in [`js/textures.js`](js/textures.js).

## Publishing an update

Run `python3 tools/bump-version.py` before committing. It stamps every file with a new version so phones load the update immediately instead of a cached copy.

## Running locally

Any static server works, e.g. `python3 -m http.server`, then open http://localhost:8000.
Three.js and planck.js are vendored in `vendor/`, so there's no build step.
