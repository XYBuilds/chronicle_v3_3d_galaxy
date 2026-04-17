uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uWeight0;
uniform float uWeight1;
uniform float uWeight2;
uniform float uWeight3;
uniform float uTime;
uniform float uAlpha;

/** Multiplier on object-space position for noise sampling. */
uniform float uScale;
/** FBM octaves (1–8). */
uniform float uOctaves;
/** Amplitude decay per octave. */
uniform float uPersistence;
/** Boundary softness in normalized noise space (wider = softer genre borders). */
uniform float uThreshold;

varying vec3 vObjPos;
varying vec3 vNormal;

float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}

float fbmOctaves(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  vec3 shift = vec3(100.0, 37.0, 19.0);
  int o = int(clamp(uOctaves + 0.5, 1.0, 8.0));
  float pers = clamp(uPersistence, 0.08, 0.98);
  for (int i = 0; i < 8; i++) {
    if (i >= o) break;
    sum += amp * noise3(p);
    norm += amp;
    p = p * 2.02 + shift;
    amp *= pers;
  }
  return norm > 1e-5 ? sum / norm : 0.0;
}

void main() {
  vec3 p = vObjPos * uScale + vec3(uTime * 0.08, uTime * 0.05, uTime * 0.06);
  float n = clamp(fbmOctaves(p), 0.0, 1.0);

  float c1 = uWeight0;
  float c2 = c1 + uWeight1;
  float c3 = c2 + uWeight2;
  float bw = max(0.002, uThreshold);

  float s0 = 1.0 - smoothstep(c1 - bw, c1 + bw, n);
  float s1 = smoothstep(c1 - bw, c1 + bw, n) * (1.0 - smoothstep(c2 - bw, c2 + bw, n));
  float s2 = smoothstep(c2 - bw, c2 + bw, n) * (1.0 - smoothstep(c3 - bw, c3 + bw, n));
  float s3 = smoothstep(c3 - bw, c3 + bw, n);

  vec3 col = uColor0 * s0 + uColor1 * s1 + uColor2 * s2 + uColor3 * s3;
  float wsum = s0 + s1 + s2 + s3;
  col /= max(wsum, 1e-4);

  float rim = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.2);
  col += col * rim * 0.36;

  gl_FragColor = vec4(col, uAlpha);
}
