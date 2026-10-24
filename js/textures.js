// Painted canvas textures for the building surfaces. Each pattern returns { map, emissive? } canvases.
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const S = 512;
function canvas(){ const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }
function speckle(g, r, n, a){ for (let i = 0; i < n; i++){ g.fillStyle = r() < .5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; g.fillRect(r() * S, r() * S, 2, 2); } }
function blocks(g, r, W, H, colors, mortar, gap){ g.fillStyle = mortar; g.fillRect(0, 0, S, S); const out = [];
  for (let y = 0; y < S; y += H) for (let x = -W; x < S; x += W){ const ox = (y / H) % 2 ? W / 2 : 0, c = colors[Math.floor(r() * colors.length)]; g.fillStyle = c; g.fillRect(x + ox + gap, y + gap, W - gap * 2, H - gap * 2); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + ox + gap, y + gap, W - gap * 2, Math.max(3, H * .12)); out.push([x + ox + gap, y + gap, W - gap * 2, H - gap * 2]); }
  return out; }

const P = {
  brick(w){ const [c, g] = canvas(), r = rng(1); blocks(g, r, 64, 32, w.colors, w.mortar, 3); return { map: c }; },
  blocks(w){ const [c, g] = canvas(), r = rng(2); blocks(g, r, 128, 64, w.colors, w.mortar, 3); speckle(g, r, 5000, .08); return { map: c }; },
  moss(w){ const [c, g] = canvas(), r = rng(3), bl = blocks(g, r, 128, 85, w.colors, w.mortar, 4); speckle(g, r, 5000, .1);
    for (const [x, y, bw] of bl){ if (r() < .45) continue; g.fillStyle = w.moss; for (let k = 0; k < 14; k++){ g.beginPath(); g.arc(x + r() * bw, y + r() * 14, 4 + r() * 10, 0, 7); g.fill(); } } return { map: c }; },
  ice(w){ const [c, g] = canvas(), r = rng(4), bl = blocks(g, r, 256, 128, w.colors, w.mortar, 5);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; for (const [x, y, bw, bh] of bl){ for (let k = 0; k < 2; k++){ const a = x + r() * bw; g.beginPath(); g.moveTo(a, y + bh); g.lineTo(a + 40, y); g.stroke(); } } return { map: c }; },
  stripes(w){ const [c, g] = canvas(); g.fillStyle = w.colors[1]; g.fillRect(0, 0, S, S); g.fillStyle = w.colors[0];
    for (let x = -S; x < S * 2; x += 128){ g.beginPath(); g.moveTo(x, S); g.lineTo(x + 64, S); g.lineTo(x + 64 + S, 0); g.lineTo(x + S, 0); g.fill(); } return { map: c }; },
  windows(w){ const [c, g] = canvas(), [e, ge] = canvas(), r = rng(5); g.fillStyle = w.colors[0]; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 64){ const lit = r() < .4, col = w.lit[Math.floor(r() * w.lit.length)]; g.fillStyle = w.colors[1]; g.fillRect(x + 10, y + 8, 44, 50); g.fillStyle = lit ? col : '#151a28'; g.fillRect(x + 14, y + 12, 36, 42); if (lit){ ge.fillStyle = col; ge.fillRect(x + 14, y + 12, 36, 42); } }
    return { map: c, emissive: e }; },
  panels(w){ const [c, g] = canvas(), r = rng(6); g.fillStyle = w.mortar; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 128) for (let x = 0; x < S; x += 128){ const gr = g.createLinearGradient(x, y, x + 128, y + 128); gr.addColorStop(0, w.colors[Math.floor(r() * w.colors.length)]); gr.addColorStop(1, w.colors[Math.floor(r() * w.colors.length)]); g.fillStyle = gr; g.fillRect(x + 3, y + 3, 122, 122);
      g.fillStyle = 'rgba(0,0,0,.35)'; for (const [a, b] of [[12, 12], [116, 12], [12, 116], [116, 116]]){ g.beginPath(); g.arc(x + a, y + b, 4, 0, 7); g.fill(); } }
    g.globalAlpha = .06; for (let y = 0; y < S; y += 2){ g.fillStyle = r() < .5 ? '#000' : '#fff'; g.fillRect(0, y, S, 1); } g.globalAlpha = 1; return { map: c }; },
  grid(w){ const [c, g] = canvas(), [e, ge] = canvas(); g.fillStyle = w.colors[0]; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
    for (const k of [g, ge]){ k.strokeStyle = w.line; k.lineWidth = 5; for (let i = 0; i <= S; i += 128){ k.beginPath(); k.moveTo(i, 0); k.lineTo(i, S); k.moveTo(0, i); k.lineTo(S, i); k.stroke(); } } return { map: c, emissive: e }; },
  planks(w){ const [c, g] = canvas(), r = rng(7); g.fillStyle = w.mortar; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 48){ const off = r() * 300; for (let x = -off; x < S; x += 300){ g.fillStyle = w.colors[Math.floor(r() * w.colors.length)]; g.fillRect(x + 2, y + 2, 296, 44); g.strokeStyle = 'rgba(60,30,10,.25)'; g.lineWidth = 1.5;
        for (let k = 0; k < 4; k++){ const yy = y + 8 + r() * 32; g.beginPath(); g.moveTo(x + 4, yy); g.bezierCurveTo(x + 100, yy + (r() - .5) * 8, x + 200, yy + (r() - .5) * 8, x + 296, yy); g.stroke(); }
        g.fillStyle = 'rgba(40,20,5,.6)'; for (const nx of [x + 10, x + 288]){ g.beginPath(); g.arc(nx, y + 24, 2.5, 0, 7); g.fill(); } } } return { map: c }; },
  marble(w){ const [c, g] = canvas(), r = rng(8); const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, w.colors[0]); gr.addColorStop(1, w.colors[1]); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.strokeStyle = w.vein; for (let k = 0; k < 14; k++){ let x = r() * S, y = r() * S; g.globalAlpha = .2 + r() * .4; g.lineWidth = .8 + r() * 2.2; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 30; i++){ x += (r() - .3) * 30; y += (r() - .5) * 30; g.lineTo(x, y); } g.stroke(); }
    g.globalAlpha = .25; g.strokeStyle = '#ffffff'; g.lineWidth = 2; for (let y = 0; y < S; y += 256){ g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); } g.globalAlpha = 1; return { map: c }; },
};
const cache = new Map();
export function paintWall(theme){ if (!cache.has(theme.id)) cache.set(theme.id, (P[theme.wall.pattern] || P.brick)(theme.wall)); return cache.get(theme.id); }
// a small swatch (for the menu) — sky gradient with a slice of the wall and a car-coloured dot
export function swatch(theme){ const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 96);
  theme.sky.forEach((s, i) => gr.addColorStop(i / 2, s)); g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
  g.drawImage(paintWall(theme).map, 0, 0, 160, 160, 0, 56, 96, 96); g.fillStyle = theme.cap.color; g.fillRect(0, 52, 96, 6);
  g.fillStyle = theme.car.body; g.beginPath(); g.roundRect(30, 34, 36, 16, 6); g.fill(); g.fillStyle = '#111'; for (const x of [38, 58]){ g.beginPath(); g.arc(x, 50, 5, 0, 7); g.fill(); } return c.toDataURL(); }

// ---------------- natural surfaces (rock walls and ground), painted per pixel from fractal noise
function vnoise(seed){ const r = rng(seed), G = new Float32Array(256 * 256); for (let i = 0; i < G.length; i++) G[i] = r();
  const v = (x, y) => G[(y & 255) * 256 + (x & 255)], s = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi); const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  // tileable fbm over a period of `per` cells
  return (x, y, per, oct = 5) => { let f = 0, a = .5, fr = 1; for (let i = 0; i < oct; i++){ const p = per * fr; const px = ((x * fr) % p + p) % p, py = ((y * fr) % p + p) % p;
      const xi = Math.floor(px), yi = Math.floor(py), xf = s(px - xi), yf = s(py - yi), w = k => ((k % p) + p) % p + i * 37;
      const A = v(w(xi), w(yi)), B = v(w(xi + 1), w(yi)), C = v(w(xi), w(yi + 1)), D = v(w(xi + 1), w(yi + 1)); f += a * (A + (B - A) * xf + (C - A) * yf + (A - B - C + D) * xf * yf); a *= .5; fr *= 2; } return f; }; }
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// paint(u, v, n) -> [r, g, b, height]; returns { map, bump }
function pixels(N, seed, paint){ const [c, g] = [document.createElement('canvas'), null]; c.width = c.height = N; const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  const b = document.createElement('canvas'); b.width = b.height = N; const bctx = b.getContext('2d'), bimg = bctx.createImageData(N, N), fbm = vnoise(seed);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){ const [R, G, B, H] = paint(x / N, y / N, (u, v, per, o) => fbm(u * per, v * per, per, o)), i = (y * N + x) * 4;
    img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255; const h = Math.max(0, Math.min(255, H * 255)); bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = h; bimg.data[i + 3] = 255; }
  ctx.putImageData(img, 0, 0); bctx.putImageData(bimg, 0, 0); return { map: c, bump: b }; }
Object.assign(P, {
  // layered sandstone: horizontal bands of different tones, wind-worn grooves
  strata(w){ const cols = w.colors.map(hex); return pixels(512, 11, (u, v, n) => { const warp = n(u, v, 4, 3) * .08, band = (v * 7 + warp * 6) % 1, k = Math.floor(v * 7 + warp * 6);
      const base = cols[((k % cols.length) + cols.length) % cols.length], grain = n(u, v, 32, 3), groove = Math.pow(Math.abs(Math.sin((v * 7 + warp * 6) * Math.PI)), 6);
      const c = mixc(base, [60, 30, 20], groove * .35 + (1 - grain) * .18); return [...c, .55 - groove * .5 + grain * .25]; }); },
  // dark wet rock with moss patches
  mossrock(w){ const cols = w.colors.map(hex), moss = hex(w.moss); return pixels(512, 12, (u, v, n) => { const h = n(u, v, 6, 5), cr = Math.abs(n(u + .3, v, 10, 3) - .5);
      let c = mixc(cols[0], cols[3] || cols[1], h); c = mixc(c, [30, 34, 26], cr < .03 ? .6 : 0); const m = n(u, v + .5, 5, 4); if (m > .55 && h > .45) c = mixc(c, moss, Math.min(1, (m - .55) * 6));
      return [...c, h - (cr < .03 ? .3 : 0)]; }); },
  // blue-grey rock under a crust of ice
  icerock(w){ const cols = w.colors.map(hex); return pixels(512, 13, (u, v, n) => { const h = n(u, v, 5, 5), f = Math.abs(n(u, v * .5, 8, 3) - .5);
      let c = mixc([92, 110, 128], cols[0], Math.min(1, h * 1.3)); if (f < .04) c = mixc(c, [255, 255, 255], .7); return [...c, h]; }); },
});
// ---------------- ground textures (tile every few metres)
const GROUND = {
  grass: (u, v, n) => { const h = n(u, v, 8, 5), b = n(u, v, 64, 2); let c = mixc([62, 118, 42], [112, 160, 60], h); c = mixc(c, [40, 80, 30], b > .62 ? .5 : 0); if (n(u + .7, v, 40, 2) > .76) c = [235, 220, 120]; return [...c, h * .6 + b * .4]; },
  sand: (u, v, n) => { const w = n(u, v, 3, 3), rip = Math.sin((v * 22 + w * 6) * Math.PI) * .5 + .5, g = n(u, v, 96, 2); const c = mixc([196, 120, 70], [232, 160, 100], rip * .5 + g * .5); return [...c, rip * .7 + g * .3]; },
  asphalt: (u, v, n) => { const g = n(u, v, 128, 2), h = n(u, v, 6, 4); let c = mixc([28, 30, 38], [52, 54, 64], g * .6 + h * .4); if (Math.abs(n(u, v, 4, 4) - .5) < .006) c = [18, 18, 22]; return [...c, g]; },
  snow: (u, v, n) => { const h = n(u, v, 6, 5), g = n(u, v, 128, 1); const c = mixc([196, 214, 236], [250, 252, 255], h * .7 + .3); return [...(g > .9 ? [255, 255, 255] : c), h]; },
  candy: (u, v, n) => { const h = n(u, v, 4, 4); let c = mixc([255, 160, 200], [255, 200, 225], h); const s = n(u, v, 48, 1); if (s > .8) c = [[120, 220, 200], [255, 230, 120], [140, 170, 255], [255, 255, 255]][Math.floor(s * 97) % 4]; return [...c, h * .5 + (s > .8 ? .5 : 0)]; },
  concrete: (u, v, n) => { const h = n(u, v, 8, 5), st = n(u, v, 3, 3), j = (u * 4 % 1 < .01 || v * 4 % 1 < .01) ? 1 : 0; let c = mixc([110, 112, 118], [150, 152, 156], h); c = mixc(c, [70, 64, 58], st > .62 ? (st - .62) * 2 : 0); if (j) c = [70, 72, 78]; return [...c, h - j * .4]; },
  wood: (u, v, n) => { const row = Math.floor(v * 8), off = (row * 0.37) % 1, gx = (u + off) % 1, seam = (v * 8 % 1 < .03) || (gx % .5 < .006); const g = n(u * 1, v * 8 + row, 16, 3), ring = Math.sin((g * 18 + v * 80) * 2) * .5 + .5;
    const c = mixc([170, 116, 62], [214, 160, 98], ring * .5 + ((row * 13) % 5) / 10); return [...(seam ? [90, 56, 28] : c), seam ? .1 : .5 + ring * .2]; },
  grid: (u, v, n) => { const l = (u * 4 % 1 < .02 || v * 4 % 1 < .02); return [...(l ? [34, 229, 255] : mixc([18, 6, 34], [28, 10, 48], n(u, v, 6, 3))), l ? .8 : .3]; },
  jungle: (u, v, n) => { const h = n(u, v, 8, 5), l = n(u, v, 48, 2); let c = mixc([36, 64, 26], [70, 104, 40], h); if (l > .66) c = mixc(c, [110, 84, 40], .6); return [...c, h * .5 + l * .5]; },
  meadowdry: (u, v, n) => { const h = n(u, v, 8, 5), s = n(u, v, 32, 2); let c = mixc([128, 140, 70], [176, 168, 96], h); if (s > .72) c = [196, 190, 176]; return [...c, h * .6 + (s > .72 ? .4 : 0)]; },
};
const gcache = new Map();
export function paintGround(kind){ if (!gcache.has(kind)){ const f = GROUND[kind] || GROUND.grass, out = pixels(512, kind.length * 7 + 3, f);
    if (kind === 'grid'){ const e = document.createElement('canvas'); e.width = e.height = 512; const g = e.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.strokeStyle = '#22e5ff'; g.lineWidth = 10; for (let i = 0; i <= 512; i += 128){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); } out.emissive = e; }
    gcache.set(kind, out); } return gcache.get(kind); }
