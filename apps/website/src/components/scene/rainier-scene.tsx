"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import type { DayPhase } from "./day-phase";

export type RainierSceneProps = {
  dayPhase: DayPhase;
  weather: "clear" | "snow" | "rain";
  paused: boolean;
  onReady: () => void;
  onError?: (reason?: string) => void;
};

const TAU = Math.PI * 2;
const BASE = -6;

const palettes = {
  morning: {
    horizon: "#edce9a", zenith: "#478dbc", fog: "#708f92", ground: "#225e63",
    snow: ["#547fa7", "#89b4cd", "#bfdfdf", "#f0edd4", "#fff4cc"],
    rock: ["#294875", "#42779a", "#669aab", "#94b9b9", "#d0d8be"],
    forest: ["#1b424c", "#246461", "#39847a", "#61a28b", "#94bd96"],
    ridges: ["#809ea8", "#527f91", "#326e76", "#205655"],
    rims: ["#b4c0b2", "#80a7a5", "#529488", "#3b7c69"],
    clouds: ["#fff1d1", "#e8e4d2", "#b8d4d4", "#85b6cc"],
  },
  day: {
    horizon: "#77c4d8", zenith: "#193f86", fog: "#2d687e", ground: "#174955",
    snow: ["#4265a5", "#709fce", "#a8d5e5", "#dbefe9", "#fff6dc"],
    rock: ["#223d70", "#32668f", "#4c8fa7", "#7ab9c4", "#b2d9d7"],
    forest: ["#13364c", "#195762", "#287b79", "#459887", "#7ab498"],
    ridges: ["#417bb4", "#286a92", "#1c596d", "#154753"],
    rims: ["#639dbd", "#3b899d", "#35877e", "#296b65"],
    clouds: ["#ecf8e8", "#d0ece8", "#9bd3df", "#70b0d0"],
  },
  night: {
    horizon: "#254a77", zenith: "#08142f", fog: "#173147", ground: "#0c283a",
    snow: ["#243d72", "#426499", "#789ac6", "#afcbdf", "#e1edf0"],
    rock: ["#14274d", "#23446b", "#36658a", "#5b89a1", "#91b4c7"],
    forest: ["#092537", "#10394a", "#1b535c", "#2f6e70", "#528b85"],
    ridges: ["#28496f", "#1c3f5c", "#123549", "#0c2a39"],
    rims: ["#426286", "#31566b", "#26505a", "#1c4148"],
    clouds: ["#9bbbd3", "#7294b5", "#4f7499", "#365578"],
  },
} satisfies Record<DayPhase, {
  horizon: string; zenith: string; fog: string; ground: string;
  snow: string[]; rock: string[]; forest: string[];
  ridges: string[]; rims: string[]; clouds: string[];
}>;

function noise(x: number, z: number) {
  return (
    Math.sin(x * 0.72 + Math.cos(z * 0.53)) * 0.5 +
    Math.sin(z * 1.37 + x * 0.44) * 0.27 +
    Math.sin(x * 2.81 - z * 2.23) * 0.13 +
    Math.cos(x * 5.43 + z * 4.39) * 0.07
  );
}

// Authored terrain inspired by Rainier's broad, glaciated massif. Not survey data.
function elevation(x: number, z: number) {
  const radius = Math.hypot(x / 1.12, z / 0.93);
  const angle = Math.atan2(z, x);
  const dome = 13.2 * Math.exp(-Math.pow(radius / 14.4, 1.72));
  const summit = 2.7 * Math.exp(-Math.pow(radius / 5.6, 2.25));
  const westShoulder = 1.65 * Math.exp(-((x + 3.7) ** 2 + (z - 0.9) ** 2) / 3.8);
  const eastShoulder = 0.95 * Math.exp(-((x - 2.8) ** 2 + (z + 1.3) ** 2) / 2.8);
  const crater = 0.8 * Math.exp(-((x - 0.1) ** 2 / 1.9 + (z + 0.3) ** 2 / 1.1));
  const ravines =
    Math.pow(0.5 + 0.5 * Math.sin(angle * 11 + Math.sin(angle * 3) * 1.2 + Math.cos(angle * 5) * 0.6 + Math.sin(radius * 0.38) * 0.58), 7) *
    Math.min(1, radius / 5) *
    Math.exp(-radius / 28) *
    1.7;
  const texture = noise(x * 0.72, z * 0.72) * Math.min(1, radius / 4) * Math.exp(-radius / 32);
  const foothills =
    2.1 *
    Math.exp(-((z + 19) ** 2) / 64) *
    (0.65 + 0.35 * Math.sin(x * 0.38)) *
    Math.exp(-(x * x) / 900);
  return BASE + dome + summit + westShoulder + eastShoulder - crater - ravines + texture + foothills;
}

function makeTerrain() {
  const geometry = new THREE.PlaneGeometry(78, 68, 104, 92);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, elevation(positions.getX(i), positions.getZ(i)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function Mountain({ active, dayPhase }: { active: boolean; dayPhase: DayPhase }) {
  const mountain = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (active && mountain.current) mountain.current.rotation.y += Math.min(delta, 0.05) * (TAU / 70);
  });
  const geometry = useMemo(() => makeTerrain(), []);
  const uniforms = useMemo(() => ({
    uSnow: { value: palettes[dayPhase].snow.map((c) => new THREE.Color(c)) },
    uRock: { value: palettes[dayPhase].rock.map((c) => new THREE.Color(c)) },
    uForest: { value: palettes[dayPhase].forest.map((c) => new THREE.Color(c)) },
  }), [dayPhase]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh ref={mountain} geometry={geometry}>
      <shaderMaterial
        uniforms={uniforms}
        toneMapped={false}
        vertexShader={`
          varying vec3 vNormal;
          varying vec3 vTerrain;
          void main() {
            vNormal = mat3(modelMatrix) * normal;
            vTerrain = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uSnow[5];
          uniform vec3 uRock[5];
          uniform vec3 uForest[5];
          varying vec3 vNormal;
          varying vec3 vTerrain;
          void main() {
            vec3 normal = normalize(vNormal);
            float light = dot(normal, normalize(vec3(-0.65, 0.85, 0.5)));
            // A small ordered dither softens the edges between hand-picked color bands.
            vec2 pixel = mod(floor(gl_FragCoord.xy), 2.0);
            float dither = fract(dot(pixel, vec2(0.5, 0.25))) - 0.375;
            float grain = fract(sin(dot(floor(vTerrain.xz * 1.6), vec2(12.9898, 78.233))) * 43758.5453);
            float shade = clamp(light * 0.65 + 0.3 + dither * 0.055, 0.0, 0.999);
            float snowLine = 1.7 + sin(vTerrain.x * 0.65) * 0.38 + cos(vTerrain.z * 0.8) * 0.35;
            bool snow = vTerrain.y > snowLine && normal.y > 0.48;
            int band = int(floor(shade * 5.0));
            vec3 color = uRock[band];
            if (vTerrain.y < -0.4) {
              band = int(floor(clamp(shade + (grain - 0.5) * 0.12, 0.0, 0.999) * 5.0));
              color = uForest[band];
            }
            if (snow) color = uSnow[band];
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  );
}

function Sky({ dayPhase }: { dayPhase: DayPhase }) {
  const uniforms = useMemo(() => ({
    uHorizon: { value: new THREE.Color(palettes[dayPhase].horizon) },
    uZenith: { value: new THREE.Color(palettes[dayPhase].zenith) },
  }), [dayPhase]);
  return <mesh renderOrder={-100}>
    <sphereGeometry args={[240, 24, 16]} />
    <shaderMaterial side={THREE.BackSide} depthWrite={false} toneMapped={false} uniforms={uniforms}
      vertexShader={`
        varying float vHeight;
        void main() {
          vHeight = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `}
      fragmentShader={`
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        varying float vHeight;
        void main() {
          float band = floor(smoothstep(-0.2, 0.3, vHeight) * 20.0) / 20.0;
          gl_FragColor = vec4(mix(uHorizon, uZenith, band), 1.0);
          #include <colorspace_fragment>
        }
      `}
    />
  </mesh>;
}

function LayeredFoothills({ dayPhase }: { dayPhase: DayPhase }) {
  const layers = useMemo(() => [
    { z: -100, rise: 10, seed: 2 },
    { z: -74, rise: 5, seed: 5 },
    { z: -49, rise: 0, seed: 8 },
    { z: -31, rise: -4, seed: 11 },
  ].map((layer) => {
    const ridge: [number, number][] = [];
    for (let x = -500; x <= 500; x++) {
      const height = layer.rise + Math.sin(x * 0.045 + layer.seed) * 5.2
        + Math.sin(x * 0.13 + layer.seed * 2) * 1.7 + noise(x * 0.6, layer.seed) * 0.55;
      ridge.push([x, height]);
    }
    const shape = new THREE.Shape();
    shape.moveTo(-500, -100);
    ridge.forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(500, -100);
    shape.closePath();
    const edge = new THREE.Shape();
    ridge.forEach(([x, y], i) => i === 0 ? edge.moveTo(x, y) : edge.lineTo(x, y));
    [...ridge].reverse().forEach(([x, y]) => edge.lineTo(x, y - 0.7 - Math.sin(x * 0.5) * 0.25));
    edge.closePath();
    return { ...layer, geometry: new THREE.ShapeGeometry(shape), edge: new THREE.ShapeGeometry(edge) };
  }), []);
  useEffect(() => () => layers.forEach((layer) => { layer.geometry.dispose(); layer.edge.dispose(); }), [layers]);
  return <group>{layers.map((layer, i) => (
    <group key={layer.z} position={[0, 0, layer.z]}>
      <mesh geometry={layer.geometry}><meshBasicMaterial color={palettes[dayPhase].ridges[i]} fog={false} /></mesh>
      <mesh geometry={layer.edge} position={[0, 0, 0.02]}><meshBasicMaterial color={palettes[dayPhase].rims[i]} fog={false} /></mesh>
    </group>
  ))}</group>;
}

function pixelSprite(width: number, height: number, unit: number, colorAt: (x: number, y: number) => THREE.Color | undefined) {
  const positions: number[] = [];
  const colors: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = colorAt(x, y);
    if (!color) continue;
    const left = (x - width / 2) * unit;
    const top = (height / 2 - y) * unit;
    positions.push(left, top, 0, left, top - unit, 0, left + unit, top, 0,
      left + unit, top, 0, left, top - unit, 0, left + unit, top - unit, 0);
    for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function Clouds({ active, dayPhase }: { active: boolean; dayPhase: DayPhase }) {
  const cloudGroup = useRef<THREE.Group>(null);
  const time = useRef(0);
  const geometry = useMemo(() => {
    const colors = palettes[dayPhase].clouds.map((c) => new THREE.Color(c));
    const puffs = [[13, 11, 12, 5], [24, 8, 11, 8], [35, 10, 12, 6], [45, 12, 9, 4]];
    return pixelSprite(56, 18, 0.55, (x, y) => {
      const inside = puffs.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1);
      return inside ? colors[Math.min(3, Math.floor(y / 5))] : undefined;
    });
  }, [dayPhase]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    if (active) time.current += Math.min(delta, 0.05);
    if (cloudGroup.current) cloudGroup.current.position.x = Math.sin(time.current * 0.012) * 13;
  });
  return <group ref={cloudGroup}>
    {[[ -85, 31, -100, 1.4 ], [ -28, 33, -105, 1.2 ], [ 43, 28, -95, 1.6 ], [ 96, 35, -115, 1.4 ], [ -58, 23, -65, 0.9 ], [ 18, 24, -72, 0.8 ]].map(([x, y, z, scale], i) => (
      <mesh key={i} geometry={geometry} position={[x, y, z]} scale={scale}>
        <meshBasicMaterial vertexColors fog={false} />
      </mesh>
    ))}
  </group>;
}

function CelestialBody({ dayPhase }: { dayPhase: DayPhase }) {
  const mesh = useRef<THREE.Mesh>(null);
  const ray = useMemo(() => new THREE.Vector3(), []);
  const geometry = useMemo(() => {
    const colors = (dayPhase === "night"
      ? ["#9bc9dc", "#c1e2e4", "#e3f1de", "#fff7db"]
      : dayPhase === "morning"
        ? ["#eaa05d", "#f4bb73", "#ffdb9d", "#fff1c6"]
        : ["#edbd65", "#ffda83", "#ffebb0", "#fff9d7"]
    ).map((c) => new THREE.Color(c));
    return pixelSprite(28, 28, 0.19, (x, y) => {
      const nx = (x - 13.5) / 13.5;
      const ny = (y - 13.5) / 13.5;
      const radius = nx * nx + ny * ny;
      if (radius > 1) return undefined;
      const crater = dayPhase === "night" && (((x - 10) / 3.5) ** 2 + ((y - 10) / 3) ** 2 < 1
        || ((x - 16) / 3) ** 2 + ((y - 17) / 2.5) ** 2 < 1
        || ((x - 9) / 1.5) ** 2 + ((y - 20) / 1.5) ** 2 < 1);
      const light = Math.sqrt(1 - radius) * 0.75 - nx * 0.22 - ny * 0.16 - (crater ? 0.25 : 0);
      return colors[Math.min(3, Math.max(0, Math.floor(light * 4.5)))];
    });
  }, [dayPhase]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ camera, size }) => {
    if (!mesh.current) return;
    camera.updateMatrixWorld();
    ray.set(size.width < 700 ? 0.46 : 0.42, dayPhase === "morning" ? 0.4 : 0.6, 0.5).unproject(camera).sub(camera.position).normalize();
    mesh.current.position.copy(camera.position).addScaledVector(ray, 88);
    mesh.current.quaternion.copy(camera.quaternion);
  });
  return <mesh ref={mesh} geometry={geometry}>
    <meshBasicMaterial vertexColors fog={false} toneMapped={false} />
  </mesh>;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function Weather({ active, weather }: { active: boolean; weather: RainierSceneProps["weather"] }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const random = seededRandom(198612);
    const positions = new Float32Array(900 * 3);
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (random() - 0.5) * 85;
      positions[i + 1] = random() * 44;
      positions[i + 2] = (random() - 0.5) * 65;
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uRain: { value: 0 }, uDpr: { value: 1 },
  }), []);
  useFrame(({ gl }, delta) => {
    if (!material.current) return;
    if (active) material.current.uniforms.uTime.value += Math.min(delta, 0.05);
    material.current.uniforms.uRain.value = weather === "rain" ? 1 : 0;
    material.current.uniforms.uDpr.value = gl.getPixelRatio();
  });
  return (
    <points geometry={geometry} visible={weather !== "clear"} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
        vertexShader={`
          uniform float uTime;
          uniform float uRain;
          uniform float uDpr;
          varying float vFade;
          void main() {
            vec3 p = position;
            float speed = mix(1.0, 12.0, uRain);
            p.y = mod(position.y - uTime * speed, 44.0) - 6.0;
            p.x += sin(uTime * 0.33 + position.z) * mix(1.3, 0.12, uRain) + uTime * 0.06;
            p.x = mod(p.x + 42.5, 85.0) - 42.5;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = floor(clamp(mix(2.2, 9.0, uRain) * uDpr * 42.0 / max(1.0, -mv.z), 1.0, 5.0) + 0.5);
            vFade = (1.0 - smoothstep(18.0, 90.0, -mv.z)) * 0.65;
          }
        `}
        fragmentShader={`
          uniform float uRain;
          varying float vFade;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float rain = step(abs(p.x), 0.17);
            float alpha = mix(1.0, rain, uRain) * vFade;
            gl_FragColor = vec4(mix(vec3(0.79, 0.85, 0.85), vec3(0.55, 0.65, 0.76), uRain), alpha);
          }
        `}
      />
    </points>
  );
}

function Stars({ dayPhase }: { dayPhase: DayPhase }) {
  const geometry = useMemo(() => {
    const random = seededRandom(44555);
    const positions: number[] = [];
    for (let i = 0; i < 60; i++) {
      const theta = random() * TAU;
      const height = 0.1 + random() * 0.9;
      const ring = Math.sqrt(1 - height * height);
      positions.push(Math.cos(theta) * ring * 145, height * 120 + 9, Math.sin(theta) * ring * 145);
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry} visible={dayPhase === "night"}>
      <pointsMaterial color="#d7edec" size={1.5} sizeAttenuation={false} transparent opacity={0.4} depthWrite={false} fog={false} />
    </points>
  );
}

function subscribeToPixelWidth(callback: () => void) {
  const query = window.matchMedia("(max-width: 699px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getPixelRatio() {
  return window.innerWidth < 700 ? 0.75 : 0.5;
}

function CameraRig({ active }: { active: boolean }) {
  const time = useRef(0);
  const { size } = useThree();
  useFrame(({ camera }, delta) => {
    if (active) time.current += Math.min(delta, 0.05);
    const phase = time.current * TAU / 140;
    const angle = 0.29 + Math.sin(phase) * 0.18;
    const mobile = size.width < 700;
    const distance = mobile ? 66 : 57;
    camera.position.set(Math.sin(angle) * distance - 3, 15.8 + Math.sin(phase * 0.5) * 0.45, Math.cos(angle) * distance);
    camera.lookAt(mobile ? -0.5 : -10.5, mobile ? 6 : 2.7, -1);
  }, -1);
  return null;
}

function Lifecycle({ onReady, onError }: Pick<RainierSceneProps, "onReady" | "onError">) {
  const ready = useRef(false);
  const frame = useRef<number | null>(null);
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onError?.("WebGL context lost");
    };
    canvas.addEventListener("webglcontextlost", lost);
    invalidate();
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [gl, invalidate, onError]);
  useFrame(() => {
    if (!ready.current) {
      ready.current = true;
      frame.current = requestAnimationFrame(onReady);
    }
  });
  return null;
}

export default function RainierScene({ dayPhase, weather, paused, onReady, onError }: RainierSceneProps) {
  const pixelRatio = useSyncExternalStore(subscribeToPixelWidth, getPixelRatio, () => 0.5);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    update();
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const active = !paused && visible;
  return (
    <Canvas
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      camera={{ position: [14, 16, 55], fov: 42, near: 0.2, far: 600 }}
      dpr={pixelRatio}
      frameloop={!visible ? "never" : paused ? "demand" : "always"}
      gl={{ antialias: false, alpha: false, powerPreference: "default", toneMapping: THREE.NoToneMapping }}
      fallback={<span>WebGL 2 unavailable</span>}
    >
      <color attach="background" args={[palettes[dayPhase].horizon]} />
      <Sky dayPhase={dayPhase} />
      <fogExp2 attach="fog" args={[palettes[dayPhase].fog, 0.004]} />
      <Stars dayPhase={dayPhase} />
      <Clouds active={active} dayPhase={dayPhase} />
      <CelestialBody dayPhase={dayPhase} />
      <LayeredFoothills dayPhase={dayPhase} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BASE - 0.2, 0]}>
        <planeGeometry args={[260, 260]} />
        <meshBasicMaterial color={palettes[dayPhase].ground} />
      </mesh>
      <Mountain active={active} dayPhase={dayPhase} />
      <Weather active={active} weather={weather} />
      <CameraRig active={active} />
      <Lifecycle onReady={onReady} onError={onError} />
    </Canvas>
  );
}
