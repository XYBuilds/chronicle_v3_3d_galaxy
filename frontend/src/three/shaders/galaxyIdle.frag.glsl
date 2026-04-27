varying vec3 vColor;
varying float vInFocus;

void main() {
  float alpha = clamp(1.0 - vInFocus, 0.14, 0.95);
  gl_FragColor = vec4(vColor, alpha);
}
