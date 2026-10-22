"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { usePlayer } from "@/store/player-store";
import { coverFit, paletteTrio, useAudioFrame, useCoverTexture } from "./kit";

/**
 * Constellation: glowing stars linked by lines when they come close. They
 * drift as a slow cloud, then regroup into the cover's dominant contours
 * (Sobel edges of the artwork, coloured by its pixels) before scattering
 * again. Mids widen the link radius, kicks scatter, highs twinkle.
 */
const HIGH_COUNT = 230;
const LOW_COUNT = 130;
const MAX_LINKS = 1400;
const SHAPE = 1.35;

const pointVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uScale;
uniform float uTime;
uniform float uTreble;
uniform float uBeat;
varying vec3 vColor;
varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.75 + 0.25 * sin(uTime * (2.0 + aSize * 5.0) + aSize * 60.0) * (0.4 + uTreble * 2.0);
  vTw = tw;
  vColor = aColor;
  gl_PointSize = aSize * uScale * (1.0 + uBeat * 0.6) * tw / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const pointFragment = /* glsl */ `
varying vec3 vColor;
varying float vTw;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = smoothstep(0.16, 0.02, d);
  float halo = exp(-d * d * 22.0) * 0.55;
  float a = (core + halo) * smoothstep(0.5, 0.35, d);
  vec3 col = mix(vColor, vec3(1.0), core * 0.7) * a * vTw;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface ShapeData {
  pos: Float32Array;
  col: Float32Array | null;
}

/** Picks `n` well-spread contour points of the cover (null if tainted). */
function sampleCover(texture: THREE.Texture, url: string | undefined, n: number): ShapeData | null {
  const img = texture.image as CanvasImageSource | undefined;
  if (!img) return null;
  const S = 96;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const [sx, sy] = coverFit(texture, url);
  const iw = (texture.image as { width: number }).width;
  const ih = (texture.image as { height: number }).height;
  const cw = iw * sx;
  const ch = ih * sy;
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, (iw - cw) / 2, (ih - ch) / 2, cw, ch, 0, 0, S, S);
    data = ctx.getImageData(0, 0, S, S).data;
  } catch {
    return null;
  }
  const lum = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  }
  const cand: { i: number; w: number }[] = [];
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const at = (dx: number, dy: number) => lum[(y + dy) * S + x + dx];
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      const w = Math.hypot(gx, gy) + at(0, 0) * 0.05;
      if (w > 0.12) cand.push({ i: y * S + x, w: w * (0.5 + Math.random()) });
    }
  }
  if (cand.length < n * 0.5) return null;
  cand.sort((a, b) => b.w - a.w);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const minD = (S / Math.sqrt(n)) * 0.55;
  const picked: number[] = [];
  const color = new THREE.Color();
  for (const c of cand) {
    if (picked.length >= n) break;
    const x = c.i % S;
    const y = Math.floor(c.i / S);
    let ok = true;
    for (const p of picked) {
      const px = p % S;
      const py = Math.floor(p / S);
      if ((px - x) ** 2 + (py - y) ** 2 < minD * minD) {
        ok = false;
        break;
      }
    }
    if (ok) picked.push(c.i);
  }
  // Not enough spread-out edges: fill with the strongest remaining ones.
  for (let k = 0; picked.length < n && k < cand.length; k++) {
    if (!picked.includes(cand[k].i)) picked.push(cand[k].i);
  }
  picked.forEach((p, k) => {
    const x = p % S;
    const y = Math.floor(p / S);
    pos[k * 3] = (x / S - 0.5) * 2 * SHAPE;
    pos[k * 3 + 1] = -(y / S - 0.5) * 2 * SHAPE;
    pos[k * 3 + 2] = (Math.random() - 0.5) * 0.12;
    color.setRGB(data[p * 4] / 255, data[p * 4 + 1] / 255, data[p * 4 + 2] / 255, THREE.SRGBColorSpace);
    // Lift dark pixels so every star still glows.
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, Math.min(1, hsl.s * 1.2), Math.max(0.45, hsl.l));
    col[k * 3] = color.r;
    col[k * 3 + 1] = color.g;
    col[k * 3 + 2] = color.b;
  });
  return { pos, col };
}

/** Procedural fallback: a seeded rose curve with an inner ring. */
function fallbackShape(n: number, seed: number): ShapeData {
  const pos = new Float32Array(n * 3);
  const petals = 3 + (seed % 5);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const inner = i % 4 === 0;
    const r = inner ? 0.45 : 0.75 + 0.45 * Math.cos(petals * t);
    pos[i * 3] = Math.cos(t * (inner ? 4 : 1)) * r * SHAPE * 0.8;
    pos[i * 3 + 1] = Math.sin(t * (inner ? 4 : 1)) * r * SHAPE * 0.8;
    pos[i * 3 + 2] = 0;
  }
  return { pos, col: null };
}

export default function Constellation() {
  const qualityLow = usePlayer((s) => s.qualityLow);
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const seed = usePlayer((s) => s.tracks[s.current]?.seed ?? 0);
  const coverUrl = usePlayer((s) => s.tracks[s.current]?.coverUrl);
  const cover = useCoverTexture();
  const count = qualityLow ? LOW_COUNT : HIGH_COUNT;
  const groupRef = useRef<THREE.Group>(null!);
  const state = useRef({ scatter: 0, rot: 0 });

  const cloud = useMemo(() => {
    const arr = new Float32Array(HIGH_COUNT * 4);
    for (let i = 0; i < HIGH_COUNT; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 0.9 + Math.pow(Math.random(), 0.5) * 1.4;
      const s = Math.sqrt(1 - u * u);
      arr[i * 4] = s * Math.cos(th) * r * 1.35;
      arr[i * 4 + 1] = u * r * 0.8;
      arr[i * 4 + 2] = s * Math.sin(th) * r;
      arr[i * 4 + 3] = Math.random() * 100;
    }
    return arr;
  }, []);

  const shape = useMemo<ShapeData>(() => {
    if (cover) {
      const sampled = sampleCover(cover, coverUrl, HIGH_COUNT);
      if (sampled) return sampled;
    }
    return fallbackShape(HIGH_COUNT, seed);
  }, [cover, coverUrl, seed]);

  const pointGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(HIGH_COUNT * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", pos);
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(HIGH_COUNT * 3), 3));
    const sizes = new Float32Array(HIGH_COUNT);
    for (let i = 0; i < HIGH_COUNT; i++) sizes[i] = 0.35 + Math.pow(Math.random(), 3) * 0.9;
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    return g;
  }, []);

  const lineGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(MAX_LINKS * 6), 3);
    const col = new THREE.BufferAttribute(new Float32Array(MAX_LINKS * 6), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", pos);
    g.setAttribute("color", col);
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({ uScale: { value: 60 }, uTime: { value: 0 }, uTreble: { value: 0 }, uBeat: { value: 0 } }),
    []
  );
  const materials = useMemo(
    () => ({
      points: new THREE.ShaderMaterial({
        uniforms,
        vertexShader: pointVertex,
        fragmentShader: pointFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      lines: new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }),
    [uniforms]
  );

  // Star colours: the cover pixels when available, else the palette.
  useEffect(() => {
    const attr = pointGeometry.getAttribute("aColor") as THREE.BufferAttribute;
    const trio = paletteTrio(palette).map((h) => new THREE.Color(h));
    for (let i = 0; i < HIGH_COUNT; i++) {
      if (shape.col) {
        attr.setXYZ(i, shape.col[i * 3], shape.col[i * 3 + 1], shape.col[i * 3 + 2]);
      } else {
        const c = trio[i % 3];
        attr.setXYZ(i, c.r, c.g, c.b);
      }
    }
    attr.needsUpdate = true;
  }, [palette, shape, pointGeometry]);

  useEffect(
    () => () => {
      pointGeometry.dispose();
      lineGeometry.dispose();
      materials.points.dispose();
      materials.lines.dispose();
    },
    [pointGeometry, lineGeometry, materials]
  );

  useAudioFrame((f, three) => {
    const st = state.current;
    if (f.kick && !f.reduced) st.scatter = Math.min(1, st.scatter + 0.35);
    st.scatter *= Math.exp(-f.rawDt * 2.5);
    // 26 s cycle: drift, gather into the cover, hold, release.
    const phase = (f.time % 26) / 26;
    // A mix handover scatters the figure before the next cover forms.
    const gather = THREE.MathUtils.smoothstep(phase, 0.3, 0.45) * (1 - THREE.MathUtils.smoothstep(phase, 0.82, 0.97)) * (1 - f.mix);
    st.rot += f.dt * (0.08 + f.mid * 0.25) * (1 - gather);
    const cr = Math.cos(st.rot);
    const sr = Math.sin(st.rot);
    const pos = pointGeometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const t = f.time;
    for (let i = 0; i < count; i++) {
      const cx = cloud[i * 4];
      const cy = cloud[i * 4 + 1];
      const cz = cloud[i * 4 + 2];
      const ph = cloud[i * 4 + 3];
      const wx = cx + Math.sin(t * 0.3 + ph) * 0.12;
      const wy = cy + Math.cos(t * 0.25 + ph * 1.3) * 0.12;
      const rx = wx * cr - cz * sr;
      const rz = wx * sr + cz * cr;
      const jitter = st.scatter * 0.25;
      const g = gather * (1 - st.scatter * 0.6);
      arr[i * 3] = rx + (shape.pos[i * 3] - rx) * g + Math.sin(ph * 7.1) * jitter;
      arr[i * 3 + 1] = wy + (shape.pos[i * 3 + 1] - wy) * g + Math.cos(ph * 5.3) * jitter;
      arr[i * 3 + 2] = rz + (shape.pos[i * 3 + 2] - rz) * g;
    }
    pos.needsUpdate = true;
    pointGeometry.setDrawRange(0, count);

    // Links between close stars (O(n²) on ≤230 points).
    const thr = 0.36 + f.mid * f.amp * 0.3 - gather * 0.12;
    const thr2 = thr * thr;
    const lp = lineGeometry.getAttribute("position") as THREE.BufferAttribute;
    const lc = lineGeometry.getAttribute("color") as THREE.BufferAttribute;
    const la = lp.array as Float32Array;
    const ca = lc.array as Float32Array;
    const colors = pointGeometry.getAttribute("aColor").array as Float32Array;
    const gain = 0.35 + f.mid * 0.9 + f.beat * 0.4;
    let links = 0;
    for (let i = 0; i < count && links < MAX_LINKS; i++) {
      const ax = arr[i * 3];
      const ay = arr[i * 3 + 1];
      const az = arr[i * 3 + 2];
      for (let j = i + 1; j < count && links < MAX_LINKS; j++) {
        const dx = arr[j * 3] - ax;
        const dy = arr[j * 3 + 1] - ay;
        const dz = arr[j * 3 + 2] - az;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > thr2) continue;
        const k = (1 - Math.sqrt(d2) / thr) * gain;
        const o = links * 6;
        la[o] = ax;
        la[o + 1] = ay;
        la[o + 2] = az;
        la[o + 3] = arr[j * 3];
        la[o + 4] = arr[j * 3 + 1];
        la[o + 5] = arr[j * 3 + 2];
        for (let c = 0; c < 3; c++) {
          ca[o + c] = colors[i * 3 + c] * k;
          ca[o + 3 + c] = colors[j * 3 + c] * k;
        }
        links++;
      }
    }
    lp.needsUpdate = true;
    lc.needsUpdate = true;
    lineGeometry.setDrawRange(0, links * 2);

    uniforms.uTime.value = t;
    uniforms.uTreble.value = f.treble * f.amp;
    uniforms.uBeat.value = f.beat;
    uniforms.uScale.value = 150 * three.viewport.dpr * (three.size.height / 900 * 0.6 + 0.4);
    const aspect = three.size.width / Math.max(1, three.size.height);
    groupRef.current.scale.setScalar(Math.min(1, aspect * 1.1));
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={lineGeometry} material={materials.lines} frustumCulled={false} />
      <points geometry={pointGeometry} material={materials.points} frustumCulled={false} />
    </group>
  );
}
