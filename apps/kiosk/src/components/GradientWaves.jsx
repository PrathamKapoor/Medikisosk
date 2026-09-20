import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import "./GradientWaves.css";

const rgb = (hex) => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? [
        parseInt(match[1], 16) / 255,
        parseInt(match[2], 16) / 255,
        parseInt(match[3], 16) / 255,
      ]
    : [1, 1, 1];
};

const vertex = `#version 300 es
in vec2 position; void main(){ gl_Position=vec4(position,0.,1.); }`;
const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution,uMouse; uniform float iTime,uSpeed,uAmplitude,uWaveScale,uWaveRatio,uSwell,uTurbulence,uTilt,uZoom,uHeight,uFogDepth,uBrightness,uOpacity,uGrain,uGrainIntensity,uParallax; uniform bool uEnableMouse; uniform vec3 uHorizonColor,uWaveColor,uCrestColor; out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float field(vec3 p,float t){float x=p.x+uSwell*sin((p.y+p.x)/20.+t);float y=p.y+uTurbulence*cos(p.x/23.+t*.7);return p.z-(sin(x*uWaveScale/7.)+sin(y*uWaveScale*uWaveRatio/3.))*uAmplitude-uHeight;}
void main(){vec2 uv=gl_FragCoord.xy/iResolution.xy-.5;uv.x*=iResolution.x/iResolution.y;uv.y*=-1.;float T=iTime*uSpeed;vec3 cam=vec3(0.,0.,30.),dir=normalize(vec3(uv/max(uZoom,.05),-1.));float c=cos(uTilt),s=sin(uTilt);dir=mat3(c,0.,s,0.,1.,0.,-s,0.,c)*dir;if(uEnableMouse){dir.xy+=(uMouse-.5)*uParallax*.16;}float dist=0.;for(int i=0;i<70;i++){float d=field(cam+dir*dist,T);if(abs(d)<.1)break;dist+=d*.9;if(abs(dist)>20000.)break;}float fog=clamp(uFogDepth/max(abs(dist),.001),0.,1.);vec3 body=mix(uWaveColor,uCrestColor,clamp((cam+dir*dist).z*.08+.5,0.,1.));vec3 col=clamp(mix(uHorizonColor,body,fog)*uBrightness,0.,1.);float a=clamp(fog*uOpacity+(hash(gl_FragCoord.xy+iTime)-.5)*uGrain*uGrainIntensity,0.,1.);fragColor=vec4(col*a,a);}`;

export default function GradientWaves({
  horizonColor = "#5227FF",
  waveColor = "#FF9FFC",
  crestColor = "#FFFFFF",
  speed = 0.4,
  amplitude = 2.5,
  waveScale = 0.6,
  waveRatio = 0.9,
  swell = 35,
  turbulence = 20,
  tilt = 1.11,
  zoom = 1,
  height = 5.5,
  fogDepth = 15,
  brightness = 1,
  opacity = 1,
  mouseInteraction = true,
  parallaxStrength = 0.5,
  grain = true,
  grainIntensity = 0.05,
  className = "",
}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.WebGL2RenderingContext) return undefined;
    // Reduced motion: render one static frame and never animate.
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      premultipliedAlpha: true,
      dpr: Math.min(devicePixelRatio || 1, 2),
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas;
    el.appendChild(canvas);
    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Float32Array([1, 1]) },
      uMouse: { value: new Float32Array([0.5, 0.5]) },
      uSpeed: { value: speed },
      uAmplitude: { value: amplitude },
      uWaveScale: { value: waveScale },
      uWaveRatio: { value: waveRatio },
      uSwell: { value: swell },
      uTurbulence: { value: turbulence },
      uTilt: { value: tilt },
      uZoom: { value: zoom },
      uHeight: { value: height },
      uFogDepth: { value: fogDepth },
      uBrightness: { value: brightness },
      uOpacity: { value: opacity },
      uGrain: { value: grain ? 1 : 0 },
      uGrainIntensity: { value: grainIntensity },
      uParallax: { value: parallaxStrength },
      uEnableMouse: { value: mouseInteraction },
      uHorizonColor: { value: new Float32Array(rgb(horizonColor)) },
      uWaveColor: { value: new Float32Array(rgb(waveColor)) },
      uCrestColor: { value: new Float32Array(rgb(crestColor)) },
    };
    const mesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program: new Program(gl, { vertex, fragment, uniforms }),
    });
    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height));
      uniforms.iResolution.value.set([
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
      ]);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    const move = (e) => {
      const r = canvas.getBoundingClientRect();
      uniforms.uMouse.value.set([
        (e.clientX - r.left) / r.width,
        1 - (e.clientY - r.top) / r.height,
      ]);
    };
    canvas.addEventListener("pointermove", move);
    let frame = 0;
    let stopVisibility;
    const start = performance.now();
    const render = (now) => {
      uniforms.iTime.value = (now - start) / 1000;
      renderer.render({ scene: mesh });
    };
    const draw = (now) => {
      render(now);
      frame = requestAnimationFrame(draw);
    };
    if (reducedMotion) {
      // One frame only: the backdrop stays readable and still.
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
      ro.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`gradient-waves-container ${className}`.trim()}
    />
  );
}
