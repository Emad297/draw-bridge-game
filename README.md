# Draw Bridge

A tiny browser game: draw a line, press **GO**, and see whether the little yellow car makes it to the flag.

- Tap **👍** after any run you like (fails count too, and they're often the funniest).
- On the menu, open **👍** to see your liked runs. Add captions, reorder them, then press **🎬 Save video**.
  Every liked run is replayed exactly (the physics is deterministic) and rendered frame by frame into one
  **1080×1920, 60 fps, H.264 MP4 (~24 Mbit/s) with AAC audio** — ready for TikTok / Reels / Shorts. Only the 3D scene is
  in the video (no buttons or menus); a caption appears only if you type one.
- Tap **🎨** while drawing (or a swatch on the menu) to switch between 10 styles of sky, buildings and car.

Play it: https://emad297.github.io/draw-bridge-game/

## Adding levels

All levels live in [`js/levels.js`](js/levels.js) as plain data. Copy one entry and change the numbers:

| field | meaning |
|---|---|
| `solids` | brick towers: `[x0, x1, topY]` |
| `car` / `flag` | start position / goal |
| `ink` | metres of ink the player gets |
| `speed` | how fast the car drives |
| `view` | camera frame: `[centreX, centreY, width, height]` |
| `hazards` | `spinner` (spinning spike wheel that shoots), `saw` (moving buzz saw), `fan` (blows things upward) |

New hazard types go in `js/physics.js` (behaviour) and `js/scene.js` (looks).

## Adding styles

Styles live in [`js/themes.js`](js/themes.js). Building patterns are painted in [`js/textures.js`](js/textures.js).

## Running locally

Any static server works, e.g. `python3 -m http.server`, then open http://localhost:8000.
Three.js and planck.js are vendored in `vendor/`, so there's no build step.
