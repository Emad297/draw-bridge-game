// ============================================================================
//  THEMES — the look of the world. Plain data: copy one and change the colours.
//
//  sky    : [top, middle, horizon] gradient       fog : far-away haze colour
//  hemi   : [skyLight, groundLight, intensity]     sun : [colour, intensity]
//  wall   : building surface. pattern = brick | blocks | moss | ice | stripes |
//           windows | panels | grid | planks | marble   (see js/textures.js)
//           colors = palette for the pattern, rough/metal = material feel
//  cap    : the slab on top of each building
//  car    : shape = hatch | sport | jeep | van | buggy, plus body/trim/glass colours
//  env    : how much the sky reflects in shiny things (0..1.5)
// ============================================================================
export const THEMES = [
  { id: 'classic', name: 'Classic', sky: ['#2f45ff', '#5a78ff', '#a9c0ff'], fog: '#8fa8ff', hemi: ['#eef2ff', '#6a5a7a', 1.3], sun: ['#fff4e0', 2.8],
    wall: { pattern: 'brick', colors: ['#b9452b', '#c24f33', '#a83e27', '#cc5a3a', '#b04a31'], mortar: '#e8d3c0', tint: '#e0806a', rough: .8 }, cap: { color: '#e9dccb' },
    car: { shape: 'hatch', body: '#ffcf1f', trim: '#333333', glass: '#24324a', rough: .45 }, cloud: '#ffffff', ink: '#141414', flag: '#ffe14a' },
  { id: 'sunset', name: 'Sunset Canyon', sky: ['#3b1f6b', '#d9567a', '#ffb36b'], fog: '#e98a7a', hemi: ['#ffd9c2', '#5a3050', 1.2], sun: ['#ffb070', 3.0],
    wall: { pattern: 'blocks', colors: ['#d98a52', '#c97a45', '#e39a60', '#cf8350', '#b96d3c'], mortar: '#8e4f2c', rough: .9 }, cap: { color: '#f0c08a' },
    car: { shape: 'jeep', body: '#1fa39a', trim: '#2b2b2b', glass: '#1d2a33', rough: .35, metal: .2 }, cloud: '#ffc7b0', ink: '#2a1430', flag: '#ffffff' },
  { id: 'night', name: 'Night City', sky: ['#05071a', '#141a4a', '#2b3a7a'], fog: '#1a2050', hemi: ['#8090ff', '#1a1020', .7], sun: ['#9fb0ff', 1.5], stars: true, exposure: 1.2,
    wall: { pattern: 'windows', colors: ['#3a3f52', '#444a60'], lit: ['#ffd27a', '#fff1c0', '#7ad8ff'], rough: .6 }, cap: { color: '#5a6075', metal: .4, rough: .4 },
    car: { shape: 'sport', body: '#e01e37', trim: '#111111', glass: '#0d1220', rough: .2, metal: .6, glow: '#ff3355' }, cloud: '#2e3868', ink: '#f2f2ff', inkGlow: true, flag: '#ff3355', env: 1 },
  { id: 'candy', name: 'Candy Land', sky: ['#ff9ad5', '#ffc4e8', '#c9f5ff'], fog: '#ffd6ee', hemi: ['#fff0fa', '#c48ab0', 1.5], sun: ['#fff6fb', 2.4],
    wall: { pattern: 'stripes', colors: ['#ff5fa2', '#fff4f9'], rough: .35 }, cap: { color: '#7fe0c4', rough: .3 },
    car: { shape: 'buggy', body: '#7fe0c4', trim: '#ff5fa2', glass: '#ffffff', rough: .25 }, cloud: '#ffffff', ink: '#6a2b7a', flag: '#7fe0c4' },
  { id: 'arctic', name: 'Arctic', sky: ['#7fb6e6', '#bfe0f5', '#eef8ff'], fog: '#d8ecfa', hemi: ['#ffffff', '#7a9ab8', 1.3], sun: ['#ffffff', 2.6],
    wall: { pattern: 'ice', colors: ['#bfe6f7', '#a8dbf2', '#d4f0fb', '#9fd3ec'], mortar: '#eefaff', rough: .12 }, cap: { color: '#ffffff', rough: .95 },
    car: { shape: 'van', body: '#ff7a1a', trim: '#ffffff', glass: '#20354a', rough: .4 }, cloud: '#ffffff', ink: '#123a5a', flag: '#ff3b3b', env: 1 },
  { id: 'jungle', name: 'Jungle Ruins', sky: ['#1f6b5a', '#5fb08a', '#c8e8a8'], fog: '#8cc8a0', hemi: ['#e8ffe0', '#3a4a2a', 1.3], sun: ['#fff3c8', 2.6],
    wall: { pattern: 'moss', colors: ['#8a8f7a', '#7a806a', '#9a9d86', '#6f7560'], mortar: '#4a4f3a', moss: '#4f8a2f', rough: .95 }, cap: { color: '#7a5a3a', rough: .9 },
    car: { shape: 'jeep', body: '#ff8a1f', trim: '#3a2a1a', glass: '#1f2a20', rough: .6 }, cloud: '#f0fff0', ink: '#2a1a0a', flag: '#ff3b3b' },
  { id: 'chrome', name: 'Chrome Factory', sky: ['#2a2d36', '#5a6070', '#a0a8b8'], fog: '#7a808e', hemi: ['#e0e6f0', '#30343c', 1.0], sun: ['#ffffff', 2.8],
    wall: { pattern: 'panels', colors: ['#9aa2ae', '#a8b0bc', '#8e96a2'], mortar: '#4a505a', rough: .35, metal: .55 }, cap: { color: '#ffcf1f', rough: .5 },
    car: { shape: 'sport', body: '#15161a', trim: '#c9ced6', glass: '#30405a', rough: .15, metal: .7 }, cloud: '#c8ced8', ink: '#ffcf1f', flag: '#ffcf1f', env: 1.3 },
  { id: 'toy', name: 'Toy Workshop', sky: ['#4a8fe0', '#8cc0f0', '#d8ecff'], fog: '#b0d0f0', hemi: ['#fff8ec', '#6a5040', 1.3], sun: ['#ffe8c8', 2.8],
    wall: { pattern: 'planks', colors: ['#c98a4a', '#b97a3c', '#d69a58', '#a86c32'], mortar: '#6a4020', rough: .75 }, cap: { color: '#3a7be0', rough: .35 },
    car: { shape: 'hatch', body: '#e03a2a', trim: '#ffd21f', glass: '#3a7be0', rough: .3, hub: '#ffd21f' }, cloud: '#ffffff', ink: '#1a1a1a', flag: '#ffd21f' },
  { id: 'synth', name: 'Synthwave', sky: ['#120024', '#4a0a6a', '#ff4fa0'], fog: '#3a0a5a', hemi: ['#ff9adf', '#100020', .8], sun: ['#ff8ae0', 1.8], stars: true, exposure: 1.1,
    wall: { pattern: 'grid', colors: ['#160a2a'], line: '#22e5ff', rough: .4 }, cap: { color: '#ff2fa0', glow: '#ff2fa0', rough: .3 },
    car: { shape: 'sport', body: '#1a1030', trim: '#22e5ff', glass: '#ff4fa0', rough: .2, metal: .5, glow: '#22e5ff' }, cloud: '#7a2a9a', ink: '#22e5ff', inkGlow: true, flag: '#22e5ff', env: 1 },
  { id: 'marble', name: 'Marble Temple', sky: ['#1a5fd0', '#5aa0f0', '#e0f0ff'], fog: '#a8ccf0', hemi: ['#ffffff', '#7a7060', 1.3], sun: ['#fff6e0', 2.8],
    wall: { pattern: 'marble', colors: ['#f4f2ee', '#d8d4cc'], vein: '#9a948a', rough: .25 }, cap: { color: '#d9b046', rough: .3, metal: .8 },
    car: { shape: 'van', body: '#1f4fa8', trim: '#d9b046', glass: '#1a2433', rough: .3, metal: .3, hub: '#d9b046' }, cloud: '#ffffff', ink: '#111111', flag: '#1f4fa8', env: .9 },
];
