// ============================================================================
//  LEVELS — every level is plain data. To add a level, copy one and edit it.
//
//  solids : [x0, x1, top]   brick towers (they extend far down). x/top in metres.
//  car    : [x, y]          where the car starts (y = height of its chassis)
//  flag   : [x, y]          reach this to win (y = the ground height there)
//  ink    : metres of ink you're allowed to draw
//  speed  : car motor speed (rad/s of the wheels)
//  view   : [centreX, centreY, width, height]  what the camera frames
//  hazards: optional list —
//     { type: 'spinner', x, y, arms, len, spin, shots: { first, every, speed, angles } }
//     { type: 'saw', x, y, r, spin, path: [[x,y],[x,y]], period }      (moving buzz-saw)
//     { type: 'fan', x, y, dir: [dx,dy], power, width, length }        (pushes things)
// ============================================================================
export const LEVELS = [
  {
    id: 'gap', name: 'The Gap', hint: 'Connect the two towers.',
    solids: [[-40, -3, 0], [3, 40, 0]],
    car: [-6.2, .75], flag: [7.4, 0], ink: 26, speed: 9,
    view: [.6, -.5, 17, 14],
  },
  {
    id: 'spinner', name: 'Spike Wheel', hint: 'Something is spinning down there…',
    solids: [[-40, -3, 0], [3, 40, 0]],
    car: [-6.2, .75], flag: [7.4, 0], ink: 30, speed: 7,
    view: [.6, -.8, 17, 15],
    hazards: [{ type: 'spinner', x: 0, y: -2.5, arms: 4, len: 2.5, spin: 1.9, shots: { first: 1.6, every: 1.5, speed: 15, angles: [-.18, .14, -.06, .22, -.25, .05] } }],
  },
  {
    id: 'drop', name: 'The Drop', hint: 'Going down is easy. Landing is not.',
    solids: [[-40, -2.5, 2.5], [4, 40, -.5]],
    car: [-6, 3.25], flag: [8.4, -.5], ink: 24, speed: 8,
    view: [1.2, .2, 18, 15],
  },
  {
    id: 'double', name: 'Double Trouble', hint: 'Two gaps, one little pillar.',
    solids: [[-40, -5, 0], [-.8, .8, -1.2], [5, 40, 0]],
    car: [-8.2, .75], flag: [9.4, 0], ink: 30, speed: 8,
    view: [.6, -.8, 21, 16],
  },
  {
    id: 'saw', name: 'Buzz Saw', hint: 'Mind the saw. It moves.',
    solids: [[-40, -3.5, 0], [3.5, 40, 0]],
    car: [-6.6, .75], flag: [7.8, 0], ink: 30, speed: 8,
    view: [.6, -.3, 18, 15],
    hazards: [{ type: 'saw', x: 0, y: -.4, r: 1.0, spin: 9, path: [[-2.2, -.6], [2.2, -.6]], period: 3.2 }],
  },
  {
    id: 'fan', name: 'Hurricane', hint: 'A giant fan blows from below.',
    solids: [[-40, -3.5, 0], [3.5, 40, 0]],
    car: [-6.6, .75], flag: [7.8, 0], ink: 30, speed: 8,
    view: [.6, -.3, 18, 15],
    hazards: [{ type: 'fan', x: 0, y: -6.5, dir: [0, 1], power: 34, width: 3.2, length: 9 }],
  },
];
