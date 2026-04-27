varying float vNoise;

attribute float aNoise;

void main() {
  vNoise = aNoise;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
