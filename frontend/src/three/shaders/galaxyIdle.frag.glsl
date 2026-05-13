varying vec3 vColor;
varying float vNearFadeAlpha;

void main() {
  gl_FragColor = vec4(vColor, vNearFadeAlpha);
}
