varying vec3 vColor;
varying float vFocusAlphaMult;

void main() {
  gl_FragColor = vec4(vColor, vFocusAlphaMult);
}
