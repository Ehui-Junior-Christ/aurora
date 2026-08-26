export const fragmentShader = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vNoise;

void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N = normalize(vNormalW);

  float fresnel = pow(1.0 - max(dot(V, N), 0.0), 2.3);
  float band = smoothstep(-0.75, 0.95, vNoise);

  vec3 base = mix(uColorA, uColorB, band);
  base = mix(base, uColorC, clamp(uMid * 1.25, 0.0, 1.0) * 0.42);

  float shade = 0.45 + uBass * 1.05;
  vec3 col = base * shade
           + fresnel * mix(uColorC, vec3(1.0), 0.38) * (0.65 + uTreble * 1.7)
           + pow(fresnel, 3.0) * uColorB * 0.9
           + uBeat * 0.55 * fresnel * mix(uColorB, vec3(1.0), 0.4)
           + base * pow(max(dot(V, N), 0.0), 4.0) * 0.45;

  float alpha = 0.96 - fresnel * 0.16;

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
