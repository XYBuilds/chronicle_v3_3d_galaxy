varying vec3 vColor;
varying float vInFocus;
varying float vDistFalloff;
uniform int uDistanceFalloffMode;

void main() {
  float m = clamp(float(uDistanceFalloffMode), 0.0, 1.0);
  vec3 c = vColor * mix(1.0, vDistFalloff, m);
  float alphaInFocus = clamp(1.0 - vInFocus, 0.14, 0.95);
  float alphaHigh = clamp(1.0, 0.85, 0.95);
  float alpha = mix(alphaInFocus, alphaHigh, m);
  gl_FragColor = vec4(c, alpha);
}
