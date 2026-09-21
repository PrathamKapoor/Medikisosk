/**
 * GradientWaves for the vanilla console — the same WebGL wave field as the kiosk, driven by
 * `ogl` directly instead of through React. Mounted behind the login card only, paused when the
 * tab is hidden, and reduced to a single static frame under prefers-reduced-motion.
 */

import { Renderer, Program, Mesh, Triangle } from "ogl";

const VERTEX = `#version 300 es
in vec2 position; void main(){ gl_Position=vec4(position,0.,1.); }`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 iResolution,uMouse; uniform float iTime,uSpeed,uAmplitude,uWaveScale,uWaveRatio,uSwell,uTurbulence,uTilt,uZoom,uHeight,uFogDepth,uBrightness,uOpacity,uGrain,uGrainIntensity,uParallax; uniform bool uEnableMouse; uniform vec3 uHorizonColor,uWaveColor,uCrestColor; out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float field(vec3 p,float t){float x=p.x+uSwell*sin((p.y+p.x)/20.+t);float y=p.y+uTurbulence*cos(p.x/23.+t*.7);return p.z-(sin(x*uWaveScale/7.)+sin(y*uWaveScale*uWaveRatio/3.))*uAmplitude-uHeight;}
void main(){vec2 uv=gl_FragCoord.xy/iResolution.xy-.5;uv.x*=iResolution.x/iResolution.y;uv.y*=-1.;float T=iTime*uSpeed;vec3 cam=vec3(0.,0.,30.),dir=normalize(vec3(uv/max(uZoom,.05),-1.));float c=cos(uTilt),s=sin(uTilt);dir=mat3(c,0.,s,0.,1.,0.,-s,0.,c)*dir;if(uEnableMouse){dir.xy+=(uMouse-.5)*uParallax*.16;}float dist=0.;for(int i=0;i<70;i++){float d=field(cam+dir*dist,T);if(abs(d)<.1)break;dist+=d*.9;if(abs(dist)>20000.)break;}float fog=clamp(uFogDepth/max(abs(dist),.001),0.,1.);vec3 body=mix(uWaveColor,uCrestColor,clamp((cam+dir*dist).z*.08+.5,0.,1.));vec3 col=clamp(mix(uHorizonColor,body,fog)*uBrightness,0.,1.);float a=clamp(fog*uOpacity+(hash(gl_FragCoord.xy+iTime)-.5)*uGrain*uGrainIntensity,0.,1.);fragColor=vec4(col*a,a);}`;

function rgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? [
        parseInt(match[1], 16) / 255,
        parseInt(match[2], 16) / 255,
        parseInt(match[3], 16) / 255,
      ]
    : [1, 1, 1];
}

/**
 * Mount the wave field into `element`. Returns a disposer. No-ops without WebGL2.
 */
export function mountWaves(element, options = {}) {
  if (!element || !window.WebGL2RenderingContext) return () => undefined;
  const {
    horizonColor = "#093b78",
    waveColor = "#2759be",
    crestColor = "#a78bfa",
    speed = 0.18,
    opacity = 0.72,
  } = options;
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new Renderer({
    webgl: 2,
    alpha: true,
    premultipliedAlpha: true,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  const canvas = gl.canvas;
  canvas.className = "waves-canvas";
  element.appendChild(canvas);

  const uniforms = {
    iTime: { value: 0 },
    iResolution: { value: new Float32Array([1, 1]) },
    uMouse: { value: new Float32Array([0.5, 0.5]) },
    uSpeed: { value: speed },
    uAmplitude: { value: 1.8 },
    uWaveScale: { value: 0.46 },
    uWaveRatio: { value: 0.9 },
    uSwell: { value: 24 },
    uTurbulence: { value: 12 },
    uTilt: { value: 1.18 },
    uZoom: { value: 1 },
    uHeight: { value: 5.5 },
    uFogDepth: { value: 19 },
    uBrightness: { value: 0.82 },
    uOpacity: { value: opacity },
    uGrain: { value: 1 },
    uGrainIntensity: { value: 0.025 },
    uParallax: { value: 0.18 },
    uEnableMouse: { value: true },
    uHorizonColor: { value: new Float32Array(rgb(horizonColor)) },
    uWaveColor: { value: new Float32Array(rgb(waveColor)) },
    uCrestColor: { value: new Float32Array(rgb(crestColor)) },
  };
  const mesh = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms,
    }),
  });

  const resize = () => {
    const rect = element.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
    uniforms.iResolution.value.set([
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    ]);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  resize();

  const onMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    uniforms.uMouse.value.set([
      (event.clientX - rect.left) / rect.width,
      1 - (event.clientY - rect.top) / rect.height,
    ]);
  };
  canvas.addEventListener("pointermove", onMove);

  let frame = 0;
  const start = performance.now();
  const render = (now) => {
    uniforms.iTime.value = (now - start) / 1000;
    renderer.render({ scene: mesh });
  };
  const draw = (now) => {
    render(now);
    frame = requestAnimationFrame(draw);
  };
  let stopVisibility;
  if (reducedMotion) {
    render(start);
  } else {
    frame = requestAnimationFrame(draw);
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) {
        frame = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    stopVisibility = () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }

  return () => {
    cancelAnimationFrame(frame);
    if (stopVisibility) stopVisibility();
    observer.disconnect();
    canvas.removeEventListener("pointermove", onMove);
    canvas.remove();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
