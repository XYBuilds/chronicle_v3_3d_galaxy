uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uAlpha;

/** P8.3 — quantile thresholds from CPU (t1 < t2 < t3); hard band edges (no smoothstep). */
uniform float uThresh1;
uniform float uThresh2;
uniform float uThresh3;
uniform float uThresh4;

varying float vNoise;

void main() {
  float n = vNoise;
  float t1 = uThresh1;
  float t2 = uThresh2;
  float t3 = uThresh3;

  // step(edge, x): 0 if x < edge else 1 — solid bands, no cross-fade at thresholds.
  float s0 = 1.0 - step(t1, n);
  float s1 = step(t1, n) * (1.0 - step(t2, n));
  float s2 = step(t2, n) * (1.0 - step(t3, n));
  float s3 = step(t3, n);

  vec3 col = uColor0 * s0 + uColor1 * s1 + uColor2 * s2 + uColor3 * s3;
  gl_FragColor = vec4(col, uAlpha);
}
