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
