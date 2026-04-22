uniform float uPointsOpacity;
uniform float uDepthPrepassRadius;

void main() {
  if (uPointsOpacity < 0.001) discard;

  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  if (r > uDepthPrepassRadius) discard;

  // colorWrite 关闭下颜色不进Framebuffer；片元需存活以写深度
  gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
}
