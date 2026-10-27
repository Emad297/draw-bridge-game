// ============================================================================
//  THE LEVEL — one long backrooms corridor, as plain data. x runs along the corridor (metres), y is up, the floor
//  is y = 0 and the ceiling is `ceil`. Reach `exit` alive.
//
//  pits   : { x0, x1, cover }    a trench with spikes at the bottom; cover = rotten floor tiles that drop when stepped on
//  hazards:
//     { type: 'crusher', x, w, period, phase }   a steel block that slams down from the ceiling
//     { type: 'saw', r, path: [[x,y],[x,y]], period, spin }   a buzz saw sliding back and forth
//     { type: 'mine', x }                          a floor mine: steps on it -> boom
// ============================================================================
export const LEVEL = {
  name: 'Level 0', start: 0, exit: 64, ceil: 3.2, length: [-6, 70],
  pits: [{ x0: 24.5, x1: 27.2 }, { x0: 46.5, x1: 50.5, cover: true }],
  hazards: [
    { type: 'crusher', x: 9, w: 1.6, period: 2.6, phase: 0 },
    { type: 'saw', r: .6, path: [[14, .1], [20.5, .1]], period: 3.6, spin: 14 },
    { type: 'mine', x: 32 },
    { type: 'mine', x: 34.6 },
    { type: 'crusher', x: 39.5, w: 1.6, period: 2.2, phase: .3 },
    { type: 'crusher', x: 41.8, w: 1.6, period: 2.2, phase: 1.4 },
    { type: 'saw', r: .7, path: [[56, .9], [56, 2.6]], period: 1.7, spin: 16 },
    { type: 'mine', x: 59.5 },
  ],
};
