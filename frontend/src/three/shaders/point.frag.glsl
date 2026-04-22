varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;

  float a = 1.0 - smoothstep(0.95, 1.0, r);
  gl_FragColor = vec4(vColor, a);
}
