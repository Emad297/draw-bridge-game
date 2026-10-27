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
    solids: [[-40, -10, 0], [10, 40, 0]],
    car: [-11.7, .75], flag: [11, 0], ink: 60, speed: 9,
    view: [-.35, -.8, 23.9, 6.5],
  },
  {
    id: 'spinner', name: 'Spike Wheel', hint: 'Something is spinning down there…',
    solids: [[-40, -10, 0], [10, 40, 0]],
    car: [-11.7, .75], flag: [11, 0], ink: 70, speed: 8,
    view: [-.35, -1.5, 23.9, 8],
    hazards: [{ type: 'spinner', x: 0, y: -2.6, arms: 4, len: 2.6, spin: 1.9, shots: { first: 4, every: 1.4, speed: 15, angles: [-.18, .14, -.06, .22, -.25, .05] } }],
  },
  {
    id: 'drop', name: 'The Drop', hint: 'Going down is easy. Landing is not.',
    solids: [[-40, -9, 2.5], [10, 40, -.5]],
    car: [-10.7, 3.25], flag: [11, -.5], ink: 56, speed: 8,
    view: [.15, .6, 22.9, 7],
  },
  {
    id: 'double', name: 'Double Trouble', hint: 'Two gaps, one little pillar.',
    solids: [[-40, -11, 0], [-1, 1, -1.2], [11, 40, 0]],
    car: [-12.7, .75], flag: [12, 0], ink: 64, speed: 8,
    view: [-.35, -1, 25.9, 7],
  },
  {
    id: 'saw', name: 'Buzz Saw', hint: 'Mind the saw. It moves.',
    solids: [[-40, -10, 0], [10, 40, 0]],
    car: [-11.7, .75], flag: [11, 0], ink: 70, speed: 8,
    view: [-.35, -.8, 23.9, 7],
    hazards: [{ type: 'saw', x: 0, y: -.4, r: 1.0, spin: 9, path: [[-7.5, -.6], [7.5, -.6]], period: 5.6 }],
  },
  {
    id: 'fan', name: 'Hurricane', hint: 'A giant fan blows from below.',
    solids: [[-40, -10, 0], [10, 40, 0]],
    car: [-11.7, .75], flag: [11, 0], ink: 70, speed: 8,
    view: [-.35, -.8, 23.9, 7],
    hazards: [{ type: 'fan', x: 0, y: -6.5, dir: [0, 1], power: 34, width: 5, length: 9 }],
  },
];
