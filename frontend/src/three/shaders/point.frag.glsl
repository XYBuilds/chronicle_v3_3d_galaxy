varying vec3 vColor;
varying float vEmissive; // kept for shader link; not used in this style pass.

// Normalized radius: 0 at center, 1 at circle edge (gl_PointCoord space).
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;

  // Hard-edged disc: genre fill inside, white stroke ring to outer edge.
  const float inner = 0.88;
  vec3 rgb = mix(vec3(1.0), vColor, step(r, inner));
  gl_FragColor = vec4(rgb, 1.0);
}
