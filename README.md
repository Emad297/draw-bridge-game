# Draw Bridge

A tiny browser game: draw a line, press **GO**, and see whether the little yellow car makes it to the flag.

- Tap **👍** after any run you like (fails count too, and they're often the funniest).
- On the menu, open **👍** to see your liked runs. Add captions, reorder them, then press **🎬 Save video**.
  Every liked run is replayed exactly (the physics is deterministic) and recorded into one 9:16 video with sound.

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

## Running locally

Any static server works, e.g. `python3 -m http.server`, then open http://localhost:8000.
Three.js and planck.js are vendored in `vendor/`, so there's no build step.
