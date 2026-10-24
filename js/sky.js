// The sky: a shader dome (smooth atmospheric gradient, sun or moon with glow, horizon haze, stars) and soft painted
// cumulus/cirrus clouds with baked self-shadowing, tinted per theme.
import * as THREE from 'three';

const RNG = s => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };

// ---- value-noise fbm for the cloud textures
function makeNoise(seed){ const r = RNG(seed), P = new Uint8Array(512), G = new Float32Array(256); for (let i = 0; i < 256; i++){ P[i] = i; G[i] = r(); }
  for (let i = 255; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; } for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const v = (x, y) => G[P[P[x & 255] + (y & 255)]], s = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi); const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  return (x, y, oct = 5) => { let f = 0, amp = .5, fr = 1; for (let i = 0; i < oct; i++){ f += amp * n(x * fr, y * fr); amp *= .5; fr *= 2.03; } return f; }; }

// R = how lit the cloud is (top/sun side bright, belly dark), A = density
function cloudTexture(seed, kind){ const W = 384, H = kind === 'wisp' ? 96 : 240, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), fbm = makeNoise(seed), r = RNG(seed * 7 + 1);
  const puffs = kind === 'wisp' ? [] : ((n) => Array.from({ length: n }, (_, i) => ({ x: .18 + .64 * (i + r() * .6) / n, y: .55 - r() * .25, rx: .14 + r() * .12, ry: .2 + r() * .2 })))(5 + Math.floor(r() * 4));
  const dens = (u, v) => { let shape;
    if (kind === 'wisp'){ const e = 1 - Math.pow((u - .5) / .5, 2); shape = Math.max(0, e) * Math.max(0, 1 - Math.pow((v - .5) / .45, 2)); return Math.max(0, Math.min(1, (fbm(u * 9, v * 3) * 1.4 - .55 + shape * .5) * 2.2 * shape)); }
    shape = 0; for (const p of puffs){ const d = Math.pow((u - p.x) / p.rx, 2) + Math.pow((v - p.y) / p.ry, 2); shape = Math.max(shape, 1 - d); }
    shape *= Math.min(1, Math.max(0, (.82 - v) / .1)); // flat-ish bottom
    return Math.max(0, Math.min(1, (shape * 1.15 + (fbm(u * 6, v * 4) - .5) * .9) * 1.6 - .15)); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){ const u = x / W, v = y / H, d = dens(u, v); let lit = 1;
    if (d > 0){ const up = dens(u + .015, v - .06), up2 = dens(u + .03, v - .12); lit = 1 - Math.min(1, up * .45 + up2 * .35) - (kind === 'wisp' ? 0 : Math.max(0, v - .45) * .55); lit = Math.max(0, lit) * .85 + (1 - d) * .25; }
    const i = (y * W + x) * 4; img.data[i] = Math.min(255, lit * 255); img.data[i + 1] = img.data[i + 2] = 0; img.data[i + 3] = d * 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t; }

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 zenith, mid, horizon, sunColor, sunDir, below; uniform float sunSize, glow, stars, stripes, time;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  float e = pow(clamp(h, 0.0, 1.0), 0.5); float hh = max(h, 0.0);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.45, e)); col = mix(col, zenith, smoothstep(0.35, 1.0, e));
  col += horizon * 0.18 * exp(-hh * 14.0);                         // bright haze band at the horizon
  float sd = dot(d, sunDir), s = max(sd, 0.0);
  col += sunColor * glow * (0.05 * pow(s, 3.0) + 0.35 * pow(s, 24.0) + 0.9 * pow(s, 400.0));   // atmospheric glow
  float c = cos(sunSize), disk = smoothstep(c, mix(c, 1.0, 0.08), sd);
  if (stripes > 0.5){ vec3 up = vec3(0.0, 1.0, 0.0), rt = normalize(cross(sunDir, up)), u2 = cross(rt, sunDir); float v = dot(d - sunDir * sd, u2) / sin(sunSize);
    float band = step(0.5, fract((v + 1.0) * 7.0 + time * 0.25)); disk *= v > -0.1 ? 1.0 : band; col = mix(col, mix(sunColor, vec3(1.0, 0.85, 0.3), clamp(v * 0.5 + 0.5, 0.0, 1.0)), disk); }
  else col = mix(col, sunColor * 1.2 + 0.2, disk);
  if (stars > 0.5 && h > 0.0){ vec2 g = vec2(atan(d.x, -d.z) * 120.0, asin(clamp(h, -1.0, 1.0)) * 120.0); vec2 id = floor(g), f = fract(g) - 0.5; float r = hash(id);
    if (r > 0.985){ float tw = 0.6 + 0.4 * sin(time * 2.0 + r * 60.0); col += vec3(smoothstep(0.12, 0.0, length(f)) * tw * smoothstep(0.0, 0.25, h)); } }
  col = mix(col, below, smoothstep(0.0, -0.06, h));                    // melt into the far ground below the horizon
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;                         // dither: no banding
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const CLOUD_FS = `
uniform sampler2D map; uniform vec3 lit, shade, haze; uniform float hazeAmt, opacity; varying vec2 vUv;
void main(){ vec4 t = texture2D(map, vUv); vec3 c = mix(shade, lit, t.r); c = mix(c, haze, hazeAmt); gl_FragColor = vec4(c, t.a * opacity);
  #include <colorspace_fragment>
}`;
const CLOUD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class Sky {
  constructor(scene){
    this.u = { zenith: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, .2, -1) }, below: { value: new THREE.Color() }, sunSize: { value: .03 }, glow: { value: 1 }, stars: { value: 0 }, stripes: { value: 0 }, time: { value: 0 } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
    this.dome.renderOrder = -10; this.dome.frustumCulled = false; scene.add(this.dome);
    const tex = [1, 2, 3, 4, 5].map(i => cloudTexture(i * 31, 'cumulus')).concat([6, 7].map(i => cloudTexture(i * 31, 'wisp')));
    this.cu = { lit: { value: new THREE.Color() }, shade: { value: new THREE.Color() }, haze: { value: new THREE.Color() } };
    const r = RNG(5); this.clouds = [];
    for (let i = 0; i < 30; i++){ const wisp = i >= 22, z = -60 - r() * 120, w = wisp ? 60 + r() * 60 : 22 + r() * 40, h = w * (wisp ? .18 : .55);
      const m = new THREE.ShaderMaterial({ uniforms: { map: { value: tex[wisp ? 5 + i % 2 : i % 5] }, lit: this.cu.lit, shade: this.cu.shade, haze: this.cu.haze, hazeAmt: { value: Math.min(.35, (-z - 50) / 380) }, opacity: { value: wisp ? .55 : .97 } },
        vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, fog: false, toneMapped: false });
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); c.renderOrder = -5 + (z + 200) / 200; c.position.set((r() - .5) * 130, (wisp ? 18 : 2) + r() * 20 + (-z) * .06, z); if (r() < .5) c.scale.x = -1;
      scene.add(c); this.clouds.push({ c, x0: c.position.x, v: (.3 + r() * .5) * (wisp ? 1.6 : 1) }); }
  }
  setTheme(T){ const u = this.u, S = T.skyFx || {};
    u.zenith.value.set(T.sky[0]); u.mid.value.set(T.sky[1]); u.horizon.value.set(T.sky[2]); u.sunColor.value.set(S.sun || T.sun[0]);
    const [az, el] = (S.at || [-6, 30]).map(v => v * Math.PI / 180); u.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    u.sunSize.value = (S.size ?? 1.6) * Math.PI / 180; u.glow.value = S.glow ?? 1; u.stars.value = T.stars ? 1 : 0; u.stripes.value = S.stripes ? 1 : 0;
    const lit = new THREE.Color(T.cloud), sky = new THREE.Color(T.sky[1]); this.cu.lit.value.copy(lit); this.cu.shade.value.copy(lit).lerp(sky, .5).multiplyScalar(S.shade ?? .66); this.cu.haze.value.set(T.sky[2]);
    const n = S.clouds ?? 30; this.clouds.forEach((o, i) => o.c.visible = i < 22 ? i < Math.min(22, n) : n > 22); }
  // colour of the sky right at the horizon straight ahead (same formula as the shader)
  horizonAhead(){ const u = this.u, s = Math.max(0, -u.sunDir.value.z), g = u.glow.value * (.05 * s ** 3 + .35 * s ** 24 + .9 * s ** 400);
    return u.horizon.value.clone().multiplyScalar(1.18).add(u.sunColor.value.clone().multiplyScalar(g)); }
  fogColor(){ const c = this.horizonAhead(); this.u.below.value.copy(c); return c; }
  update(t, camera){ this.dome.position.copy(camera.position); this.u.time.value = t; for (const o of this.clouds){ o.c.position.x = ((o.x0 + t * o.v + 75) % 150 + 150) % 150 - 75; } }
}
