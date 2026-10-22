#version 460 core
// "Organisme": Blob.tsx (+ Particles.tsx in the overlay), recreated.
// The web blob is an icosphere displaced in the vertex shader by 3 simplex
// noises (src/lib/shaders/vertex.ts) and shaded with the base sphere normal
// (fragment.ts). Here the displaced surface is intersected as a radial height
// field (8 samples + 1 secant step, fixed cost) with
// the exact same displacement and shading formulas; the additive glow sprite
// behind it is analytic; the 1300 particles come from the overlay.
//   world->object rotation (mat3 columns) = uP0.xyz | uP0.w uP1.xy | uP1.zw uP2.x
//   uP2.y mesh scale   uP2.z uNoiseFreq   uP2.w uFlowSpeed
//   uP3.x blob seed (rand * 80)   uP3.y uAmpMul   uP3.z sprite opacity   uP3.w sprite scale
//   uTime = the blob clock; uBass/uMid/uTreble = the blob k=9 smoothing.
#define HAS_OVERLAY
#include <common.glsl>
#include <noise.glsl>

const float RADIUS = 1.32;
const float CAM_K = 1.3025; // 0.5 / tan(21 deg): fov 42 like the web camera

mat3 rotInv() { return mat3(uP0.xyz, vec3(uP0.w, uP1.xy), vec3(uP1.zw, uP2.x)); }

// vertex.ts displacement for a unit direction (object space).
float displace(vec3 dir) {
  float t = uTime * uP2.w;
  float off = uP3.x * 0.173;
  float f = uP2.z;
  float n = snoise(dir * f + vec3(t * 0.7, t * 0.45, t * 0.3) + off);
  n += 0.5 * snoise(dir * f * 2.3 + vec3(-t * 0.9, t * 0.6, t) + off * 2.0) * (0.35 + uMid * 1.15);
  float ridge = 1.0 - abs(snoise(dir * f * 4.2 + vec3(t * 1.5) + off));
  n += ridge * uTreble * 0.55;
  return n;
}

void main() {
  vec2 uv = sceneUv();
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  vec3 col = backdrop(uv);

  // Glow sprite (z = -0.7, additive, radial gradient .85 / .22 at .3 / 0 at 1).
  float sr = length(p) * 5.1 / CAM_K / (uP3.w * 0.5);
  float g = sr < 0.3 ? mix(0.85, 0.22, sr / 0.3) : mix(0.22, 0.0, clamp((sr - 0.3) / 0.7, 0.0, 1.0));
  col += uColorA * g * uP3.z;

  vec3 ro = vec3(0.0, 0.0, 4.4);
  vec3 rd = normalize(vec3(p, -CAM_K));
  float amp = (0.14 + uBass * 0.52 + uBeat * 0.06) * uP3.y;
  float sc = uP2.y;
  // Quick reject: outside the largest possible blob.
  float bound = (RADIUS + amp * 2.2) * sc;
  float b0 = dot(ro, rd);
  if (b0 * b0 - (dot(ro, ro) - bound * bound) > 0.0) {
    mat3 Ri = rotInv();
    // Object space (the mesh scale is uniform).
    vec3 oo = Ri * ro / sc;
    vec3 od = Ri * rd;
    float b = dot(oo, od);
    float c0 = dot(oo, oo);
    float rb = RADIUS + amp * 2.2;
    // Radial height field: the first hit lies between the bounding sphere
    // and the ray's closest approach to the centre. 8 uniform samples, then
    // a secant step (fixed cost: 10 displacement evaluations).
    float t0 = -b - sqrt(max(b * b - (c0 - rb * rb), 0.0));
    float tc = -b;
    // No break / nested loop: GLES drivers get a plain fixed loop.
    float tPrev = t0;
    float fPrev = amp;
    float hit = 0.0;
    float ta = t0, fa = amp, tb2 = tc, fb = 0.0;
    // Closest miss (for the anti-aliased silhouette).
    float fMin = 1e9;
    float tMin = tc;
    for (int i = 1; i <= 8; i++) {
      float ti = mix(t0, tc, float(i) / 8.0);
      vec3 po = oo + od * ti;
      float r = length(po);
      float fi = r - (RADIUS + displace(po / max(r, 1e-4)) * amp);
      float first = (1.0 - hit) * step(fi, 0.0);
      ta = mix(ta, tPrev, first);
      fa = mix(fa, fPrev, first);
      tb2 = mix(tb2, ti, first);
      fb = mix(fb, fi, first);
      hit = max(hit, first);
      if (fi < fMin) { fMin = fi; tMin = ti; }
      tPrev = ti;
      fPrev = fi;
    }
    float t = tc;
    float n = 0.0;
    vec3 dir = vec3(0.0, 0.0, 1.0);
    // Analytic edge coverage: rays that miss by less than ~1.5 px still
    // get partial coverage (pixels per object unit at the blob distance).
    float pxPerUnit = sc * CAM_K * uSize.y / 4.4;
    float coverage = hit > 0.0 ? 1.0 : clamp(1.0 - fMin * pxPerUnit / 1.5, 0.0, 1.0);
    if (hit < 0.5 && coverage > 0.0) t = tMin;
    if (hit > 0.0) {
      // Secant refinement inside [ta, tb2].
      float tm = ta + (tb2 - ta) * fa / max(fa - fb, 1e-5);
      vec3 pm = oo + od * tm;
      float rm = length(pm);
      float fm = rm - (RADIUS + displace(pm / max(rm, 1e-4)) * amp);
      if (fm < 0.0) { tb2 = tm; fb = fm; } else { ta = tm; fa = fm; }
      t = ta + (tb2 - ta) * fa / max(fa - fb, 1e-5);
    }
    if (coverage > 0.0) {
      dir = normalize(oo + od * t);
      n = displace(dir);
      vec3 pw = ro + rd * t * sc;
      // fragment.ts: base sphere normal (vNormalW), world position.
      vec3 N = normalize(transpose(Ri) * dir);
      vec3 V = normalize(ro - pw);
      float fresnel = pow(1.0 - max(dot(V, N), 0.0), 2.3);
      float band = smoothstep(-0.75, 0.95, n);
      vec3 base = mix(uColorA, uColorB, band);
      base = mix(base, uColorC, clamp(uMid * 1.25, 0.0, 1.0) * 0.42);
      float shade = 0.45 + uBass * 1.05;
      vec3 bc = base * shade
             + fresnel * mix(uColorC, vec3(1.0), 0.38) * (0.65 + uTreble * 1.7)
             + pow(fresnel, 3.0) * uColorB * 0.9
             + uBeat * 0.55 * fresnel * mix(uColorB, vec3(1.0), 0.4)
             + base * pow(max(dot(V, N), 0.0), 4.0) * 0.45;
      float alpha = (0.96 - fresnel * 0.16) * coverage;
      col = bc * alpha + col * (1.0 - alpha);
    }
  }

  col = composeOverlay(col, uv, 0.0);
  col += overlayGlow(uv, 5.0) * 0.6 * uBloom;
  finish(bloomApprox(col, 1.0), 0.0);
}
