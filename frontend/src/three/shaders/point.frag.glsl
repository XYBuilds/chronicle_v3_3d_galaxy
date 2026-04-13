varying vec3 vColor;
varying float vEmissive;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;

  float core = 1.0 - smoothstep(0.35, 1.0, r);
  float glow = exp(-r * r * 5.0) * 0.65;
  float mixAmt = core + glow;

  // HDR-friendly: emissive from JSON is ~0.1–1.5; boost halo for later Bloom (Phase 3.6).
  vec3 rgb = vColor * vEmissive * (0.4 + 0.9 * core + 1.4 * glow);
  float alpha = clamp(mixAmt, 0.0, 1.0);

  gl_FragColor = vec4(rgb, alpha);
}
