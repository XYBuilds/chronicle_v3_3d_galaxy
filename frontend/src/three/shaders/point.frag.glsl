uniform float uPointsOpacity;

varying vec3 vColor;
varying float vEmissive;
varying float vInFocus;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;

  // Radial glow: bright core + soft halo; emissive scales HDR-ish output for Bloom.
  float core = exp(-r * r * 7.0);
  float halo = exp(-r * r * 2.2) * 0.30;
  float glow = core + halo;

  float e = clamp(vEmissive, 0.08, 2.5);
  float focusBoost = mix(0.72, 1.0, vInFocus);
  vec3 rgb = vColor * (0.18 + 0.82 * glow) * (0.35 + 1.15 * e) * focusBoost;

  float edgeSoft = 1.0 - smoothstep(0.78, 1.0, r);
  float a = uPointsOpacity * mix(0.55, 1.0, vInFocus) * edgeSoft;
  if (a < 0.001) discard;
  gl_FragColor = vec4(rgb, a);
}
