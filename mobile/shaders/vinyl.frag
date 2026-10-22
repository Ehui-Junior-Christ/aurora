#version 460 core
// "Vinyle": Vinyl.tsx recordFragment + haloFragment (same math) ray-traced
// on the tilted turntable group; platter cylinder lit like the web
// MeshStandardMaterial (ambient .6 + directional 2.2); tonearm in overlay.
//   world->group rotation (mat3 columns) = uP0.xyz | uP0.w uP1.xy | uP1.zw uP2.x
//   uP2.y group scale   uP2.z group x   uP2.w cover scale x
//   uP3.x uRot (platter angle)   uP3.y uNeedle   uP3.z uHasCover   uP3.w cover scale y
#define HAS_OVERLAY
#define HAS_COVER
#include <common.glsl>

const float RECORD_R = 1.5;

mat3 rotInv() { return mat3(uP0.xyz, vec3(uP0.w, uP1.xy), vec3(uP1.zw, uP2.x)); }
float hash1(float n) { return fract(sin(n) * 43758.5453); }

vec4 recordColor(vec2 vPos, float pix) {
  float r = length(vPos) / RECORD_R;
  float ang = atan(vPos.y, vPos.x);
  float local = ang - uP3.x;
  vec2 lp = vec2(cos(local), sin(local)) * r;
  // fwidth(r) of the web, from the ray footprint (SkSL has no derivatives).
  float fw = pix;
  float aa = fw * 1.5;

  vec3 col = vec3(0.018, 0.018, 0.022);
  float groove = 0.5 + 0.5 * sin(r * 900.0);
  // 900 rad per radius aliases at phone resolution: fade to the mean.
  groove = mix(groove, 0.5, clamp(fw * 900.0 / 6.2831853, 0.0, 1.0));
  float gaps = 1.0;
  for (int i = 1; i < 6; i++) {
    float gr = 0.36 + 0.6 * hash1(float(i) + uSeed * 13.0);
    gaps *= smoothstep(0.0, 0.006, abs(r - gr));
  }
  col += vec3(0.02) * groove * gaps;
  float sheenA = pow(abs(cos(ang - 0.9)), 38.0);
  float sheenB = pow(abs(cos(ang + 0.35)), 90.0) * 0.5;
  vec3 irid = mix(uColorB, uColorC, smoothstep(0.35, 0.95, r));
  col += (irid * 0.55 + 0.25) * (sheenA + sheenB) * (0.25 + uMid * 0.9) * (0.55 + 0.45 * groove) * gaps;
  col += uColorC * exp(-abs(r - uP3.y) * 140.0) * (0.35 + uBass * 1.4 + uBeat * 0.8);
  col += uColorB * exp(-abs(r - uP3.y) * 22.0) * (0.06 + uBass * 0.25);
  col += vec3(0.35) * smoothstep(0.985, 0.995, r) * (1.0 - smoothstep(0.995, 1.0, r));

  float labelR = 0.32;
  if (r < labelR + aa) {
    vec3 label;
    if (uP3.z > 0.5) {
      vec2 tuv = lp / labelR * 0.5 * vec2(uP2.w, uP3.w) + 0.5;
      label = srgbToLinear(texture(uCover, vec2(tuv.x, 1.0 - tuv.y)).rgb);
    } else {
      float band = smoothstep(0.0, 0.01, abs(r - labelR * 0.62));
      label = mix(uColorA, uColorC, 0.5 + 0.5 * lp.x / labelR) * (0.55 + 0.45 * band);
    }
    label *= 0.85 + uBeat * 0.2;
    label += vec3(0.08) * sheenA;
    col = mix(col, label, smoothstep(labelR + aa, labelR - aa, r));
    col = mix(col, vec3(0.8), smoothstep(0.018 + aa, 0.018, r));
    col = mix(col, vec3(0.01), smoothstep(0.011 + aa, 0.011, r));
  }
  return vec4(col, smoothstep(1.0, 1.0 - aa, r));
}

vec3 haloColor(vec2 vPos) {
  float r = length(vPos);
  float a = atan(vPos.y, vPos.x);
  vec3 tint = mix(uColorA, uColorC, 0.5 + 0.5 * sin(a * 2.0 + uTime * 0.4));
  float glow = exp(-max(r - 1.5, 0.0) * (6.0 - uBass * 2.0)) * smoothstep(1.4, 1.56, r);
  return tint * glow * (0.16 + uBass * 0.5 + uBeat * 0.35);
}

// MeshStandardMaterial #1b1c22 (metalness .2, roughness .5), world normal.
vec3 darkShade(vec3 nW, vec3 vW) {
  vec3 albedo = vec3(0.0103, 0.0110, 0.0160);
  vec3 l = normalize(vec3(-2.0, 3.0, 4.0));
  float ndl = max(dot(nW, l), 0.0);
  vec3 diff = albedo * 0.8 / 3.14159 * (0.6 + 2.2 * ndl);
  vec3 hv = normalize(l + vW);
  float spec = pow(max(dot(nW, hv), 0.0), 24.0) * 0.12 * 2.2 * ndl;
  return diff + vec3(spec);
}

void main() {
  vec2 uv = sceneUv();
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  vec3 col = backdrop(uv);

  vec3 cam = vec3(0.0, 0.15, 4.4);
  vec3 fw = normalize(vec3(0.0, -0.05, 0.0) - cam);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(p.x * rt + p.y * up + 1.3025 * fw);

  mat3 Ri = rotInv();
  float sc = uP2.y;
  vec3 ro = Ri * (cam - vec3(uP2.z, -0.1, 0.0)) / sc;
  vec3 dl = Ri * rd / sc;
  vec3 viewW = -rd;
  float dz = abs(dl.z) > 1e-6 ? dl.z : 1e-6;

  // Halo plane (z = -0.06), additive, drawn first (renderOrder -1).
  float th = (-0.06 - ro.z) / dz;
  if (th > 0.0) {
    vec2 hp = (ro + dl * th).xy;
    if (max(abs(hp.x), abs(hp.y)) < 3.0) col += haloColor(hp);
  }
  // Platter: cylinder r 1.56, z in [-0.09, -0.01].
  float pr = RECORD_R * 1.04;
  float tPl = 1e9;
  vec3 nPl = vec3(0.0, 0.0, 1.0);
  float tt = (-0.01 - ro.z) / dz;
  vec3 hp1 = ro + dl * tt;
  if (tt > 0.0 && length(hp1.xy) < pr) tPl = tt;
  float qa = dot(dl.xy, dl.xy);
  float qb = dot(ro.xy, dl.xy);
  float qc = dot(ro.xy, ro.xy) - pr * pr;
  float disc = qb * qb - qa * qc;
  if (disc > 0.0 && qa > 1e-8) {
    float ts = (-qb - sqrt(disc)) / qa;
    vec3 hp = ro + dl * ts;
    if (ts > 0.0 && ts < tPl && hp.z < -0.01 && hp.z > -0.09) { tPl = ts; nPl = vec3(hp.xy / pr, 0.0); }
  }
  if (tPl < 1e8) {
    vec3 nW = normalize(transpose(Ri) * nPl);
    col = darkShade(nW, viewW);
  }
  // Record (z = 0.001), alpha-blended.
  float tr = (0.001 - ro.z) / dz;
  vec3 hpr = ro + dl * tr;
  if (tr > 0.0 && length(hpr.xy) < RECORD_R * 1.01) {
    // Record-space size of one pixel: distance / focal, over the tilt.
    float pix = tr / (1.3025 * uSize.y) / (RECORD_R * sc) / max(abs(dz) * length(rd) / length(dl), 0.25);
    vec4 rc = recordColor(hpr.xy, pix);
    col = rc.rgb * rc.a + col * (1.0 - rc.a);
  }
  col = composeOverlay(col, uv, 1.0);
  finish(bloomApprox(col, 1.0), 0.0);
}
