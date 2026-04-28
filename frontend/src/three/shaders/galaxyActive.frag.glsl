varying vec3 vColor;
varying float vDistFalloff;
uniform int uDistanceFalloffMode;

void main() {
  float m = clamp(float(uDistanceFalloffMode), 0.0, 1.0);
  vec3 c = vColor * mix(1.0, vDistFalloff, m);
  gl_FragColor = vec4(c, 1.0);
}
