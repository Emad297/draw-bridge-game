// ============================================================================
//  THE LEVEL — one long backrooms corridor, as plain data. x runs along the corridor (metres), y is up, the floor
//  is y = 0 and the ceiling is `ceil`. Get the car to `exit` with the engine still driving a wheel.
//
//  pits   : { x0, x1, cover }    a trench with spikes at the bottom; cover = rotten floor tiles that drop when driven on
//  hazards:
//     { type: 'crusher', x, w, period, phase }               a steel block that slams down from the ceiling
//     { type: 'saw', r, path: [[x,y],[x,y]], period, spin }  a buzz saw sliding back and forth
//     { type: 'mine', x }                                    a floor mine: touch it -> boom
//     { type: 'ball', x, len, amp, period, phase }           a wrecking ball swinging from the ceiling
//     { type: 'flame', x, period, on, phase }                a floor flamethrower, burning for `on` seconds every `period`
//     { type: 'slabs', x0, x1, trigger }                     the ceiling between x0..x1 collapses once the car passes `trigger`
//     { type: 'wall', x, cols }                              a drywall partition to smash through
//     { type: 'clutter', x0, x1, n }                         office junk: cardboard boxes and filing cabinets
//     { type: 'barrel', x }                                  an explosive barrel
// ============================================================================
export const LEVEL = {
  name: 'Level 0', start: 0, exit: 105, ceil: 3.2, length: [-6, 111],
  pits: [{ x0: 32.4, x1: 35 }, { x0: 73, x1: 77, cover: true }],
  hazards: [
    { type: 'wall', x: 7, cols: 2 },
    { type: 'crusher', x: 13, w: 1.8, period: 2.8, phase: 0 },
    { type: 'saw', r: .6, path: [[17.5, .1], [23.5, .1]], period: 3.4, spin: 14 },
    { type: 'clutter', x0: 25.5, x1: 28.5, n: 4 },
    { type: 'barrel', x: 29.8 },
    { type: 'ball', x: 43, len: 2, amp: 1.55, period: 3.8, phase: 0 },
    { type: 'crusher', x: 53, w: 1.6, period: 2.4, phase: 0 },
    { type: 'crusher', x: 59.5, w: 1.6, period: 2.4, phase: .9 },
    { type: 'slabs', x0: 67, x1: 71, trigger: 63.3 },
    { type: 'flame', x: 84, period: 2.2, on: .9, phase: 0 },
    { type: 'flame', x: 86.5, period: 2.2, on: .9, phase: 1.1 },
    { type: 'mine', x: 90.5 },
    { type: 'wall', x: 95.6, cols: 2 },
    { type: 'saw', r: .7, path: [[100, .9], [100, 2.6]], period: 1.8, spin: 16 },
    { type: 'barrel', x: 101.6 },
    { type: 'barrel', x: 102.15 },
    { type: 'wall', x: 103, cols: 1 },
  ],
};
