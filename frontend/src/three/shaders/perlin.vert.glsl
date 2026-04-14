uniform float uTime;

varying vec3 vObjPos;
varying vec3 vNormal;

void main() {
  vObjPos = position;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
