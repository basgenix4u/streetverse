"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type ExploreQuality = "low" | "medium" | "high";

export type ExploreCanvasProps = {
  active: boolean;
  paused: boolean;
  look: string;
  skin: string;
  district: string;
  quality: ExploreQuality;
  rain: boolean;
  dayNight: boolean;
  skipIntroToken: number;
  initialPosition?: { x: number; z: number };
  onCollect: (amount: number, kind: "note" | "parcel" | "dodge", combo: number) => void;
  onInteract: (id: string) => void;
  onNearby: (id: string | null) => void;
  onPosition: (x: number, z: number, heading: number) => void;
  onTime: (label: string, isNight: boolean, t: number) => void;
  onToast: (message: string) => void;
  onNpcGreet: (name: string, message: string) => void;
  engineRef?: { current: EngineHandle | null };
  onIntro: (active: boolean) => void;
  onReady: () => void;
  onError: (message: string) => void;
};

export type EngineHandle = {
  setLook: (look: string, skin: string) => void;
  setDistrict: (district: string) => void;
  setQuality: (quality: ExploreQuality) => void;
  setRain: (rain: boolean) => void;
  setDayNight: (enabled: boolean) => void;
  setJoystick: (x: number, y: number) => void;
  interact: () => void;
  sit: () => void;
  stand: () => void;
  skipIntro: () => void;
};

type Interactable = { id: string; x: number; z: number; radius: number; color: number };
type Collider = { minX: number; maxX: number; minZ: number; maxZ: number };

const WORLD = { minX: -26, maxX: 26, minZ: -96, maxZ: 18 };
const INTERACTABLES: Interactable[] = [
  { id: "suya", x: -5.1, z: 2.5, radius: 3.6, color: 0xff9d5c },
  { id: "mart", x: 5.1, z: -11.5, radius: 3.6, color: 0x7fd8c0 },
  { id: "bank", x: -5.1, z: -23.5, radius: 3.6, color: 0x9db6e8 },
  { id: "buspark", x: 8.6, z: 6.0, radius: 4.2, color: 0xf2c14e },
  { id: "home", x: -8.6, z: 12.0, radius: 3.8, color: 0xc9a2ef },
  { id: "dealer", x: 8.6, z: -45.5, radius: 4.2, color: 0x7cc7ef },
  { id: "bench", x: -4.2, z: 6.0, radius: 2.2, color: 0xd8d3c8 },
];
// Business hours in 24h [open, close] — suya runs late, mart/bank are daytime.
export const BUSINESS_HOURS: Record<string, [number, number]> = {
  suya: [17, 26],
  mart: [8, 20],
  bank: [9, 17],
  buspark: [5, 24],
  home: [0, 24],
  dealer: [9, 21],
  bench: [0, 24],
};
export function isSpotOpen(id: string, dayTime: number): boolean {
  const hours = BUSINESS_HOURS[id];
  if (!hours) return true;
  const hour = dayTime * 24;
  const [open, close] = hours;
  if (close > 24) return hour >= open || hour < close - 24;
  return hour >= open && hour < close;
}
export const OUTFIT_COLORS: Record<string, string> = {
  surulere: "#3c91db",
  sunset: "#f07845",
  purple: "#a27cec",
  lime: "#a4cf65",
};
export const SKIN_TONES_EXPORT = ["#845139", "#a76545", "#ca8a65", "#e0ae83", "#6e3f2c"];
const DAY_LENGTH = 150;
let exploreIntroSeen = false;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function groundTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#3a3733";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const shade = 48 + Math.random() * 26;
      ctx.fillStyle = `rgba(${shade + 8},${shade + 2},${shade - 4},${0.25 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    ctx.strokeStyle = "rgba(20,18,16,0.5)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, 256);
      ctx.moveTo(0, i * 64);
      ctx.lineTo(256, i * 64);
      ctx.stroke();
    }
  });
}

function roadTexture() {
  const texture = canvasTexture(256, 512, (ctx) => {
    ctx.fillStyle = "#2c2e33";
    ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 3200; i++) {
      const shade = 38 + Math.random() * 22;
      ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 5},${0.3 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
    }
    ctx.fillStyle = "#d8c890";
    ctx.fillRect(8, 0, 6, 512);
    ctx.fillRect(242, 0, 6, 512);
    ctx.fillStyle = "#ddd6bd";
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(83, y + 8, 5, 34);
      ctx.fillRect(168, y + 8, 5, 34);
    }
    ctx.fillStyle = "#c99a4e";
    ctx.fillRect(124, 0, 4, 512);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function facadeTextures(base: string, seed: number, floors: number, cols: number) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const lit: boolean[][] = [];
  for (let f = 0; f < floors; f++) {
    lit.push([]);
    for (let c = 0; c < cols; c++) lit[f].push(rand() > 0.45);
  }
  const map = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    const grime = ctx.createLinearGradient(0, 150, 0, 256);
    grime.addColorStop(0, "rgba(30,22,18,0)");
    grime.addColorStop(1, "rgba(30,22,18,0.35)");
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, 256, 256);
    const ww = 256 / cols;
    const wh = 200 / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const x = c * ww + ww * 0.22;
        const y = 14 + f * wh;
        ctx.fillStyle = "rgba(18,24,32,0.9)";
        ctx.fillRect(x - 3, y - 3, ww * 0.56 + 6, wh * 0.62 + 6);
        ctx.fillStyle = lit[f][c] ? "#5a4a38" : "#232f3d";
        ctx.fillRect(x, y, ww * 0.56, wh * 0.62);
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fillRect(x, y, ww * 0.56, 3);
        ctx.fillStyle = "rgba(15,20,28,0.9)";
        ctx.fillRect(x + ww * 0.26, y, 2, wh * 0.62);
      }
    }
    ctx.fillStyle = "rgba(24,20,18,0.85)";
    ctx.fillRect(0, 236, 256, 20);
  });
  const emissive = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 256, 256);
    const ww = 256 / cols;
    const wh = 200 / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (!lit[f][c]) continue;
        const x = c * ww + ww * 0.22;
        const y = 14 + f * wh;
        const warm = 0.55 + ((f * 7 + c * 3 + seed) % 5) * 0.09;
        ctx.fillStyle = `rgba(255,${Math.round(165 * warm + 40)},${Math.round(90 * warm + 30)},0.95)`;
        ctx.fillRect(x, y, ww * 0.56, wh * 0.62);
      }
    }
  });
  return { map, emissive };
}

function signTexture(title: string, sub: string, color: string) {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = "#0e141f";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.fillRect(8, 8, 496, 112);
    const sheen = ctx.createLinearGradient(0, 0, 0, 128);
    sheen.addColorStop(0, "rgba(255,255,255,0.22)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = sheen;
    ctx.fillRect(8, 8, 496, 112);
    ctx.fillStyle = "#fff6e6";
    ctx.font = "900 44px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 6;
    ctx.fillText(title, 256, 56, 470);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,246,230,0.85)";
    ctx.font = "800 19px Arial, sans-serif";
    ctx.fillText(sub, 256, 95, 470);
  });
}

function faceTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = "#2a1f1c";
    ctx.beginPath();
    ctx.ellipse(78, 88, 26, 9, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(178, 88, 26, 9, 0.1, 0, Math.PI * 2);
    ctx.fill();
    const eye = (x: number) => {
      ctx.fillStyle = "#f4ede2";
      ctx.beginPath();
      ctx.ellipse(x, 118, 21, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a251c";
      ctx.beginPath();
      ctx.arc(x, 119, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#120d0b";
      ctx.beginPath();
      ctx.arc(x, 119, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(x + 3, 116, 2, 0, Math.PI * 2);
      ctx.fill();
    };
    eye(78);
    eye(178);
    ctx.strokeStyle = "rgba(60,38,30,0.75)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(128, 140);
    ctx.quadraticCurveTo(124, 168, 118, 176);
    ctx.quadraticCurveTo(128, 182, 140, 176);
    ctx.stroke();
    ctx.fillStyle = "#5d2f28";
    ctx.beginPath();
    ctx.ellipse(128, 208, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.ellipse(128, 205, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.4)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function noteFaceTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = "#ffdf89";
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7a411d";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#7a411d";
    ctx.font = "900 64px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₦", 64, 68);
  });
}

export type HumanRig = {
  group: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  shirtMats: THREE.MeshStandardMaterial[];
  skinMats: THREE.MeshStandardMaterial[];
  baseHipY: number;
};

export function buildHuman(options: {
  skin: string;
  shirt: string;
  trousers: string;
  hairStyle: number;
  hairColor?: string;
  scale?: number;
}): HumanRig {
  const { skin, shirt, trousers } = options;
  const hairColor = options.hairColor ?? "#1c1a20";
  const scale = options.scale ?? 1;
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62, metalness: 0.02 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const shirtDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(shirt).multiplyScalar(0.72), roughness: 0.88 });
  const trousersMat = new THREE.MeshStandardMaterial({ color: trousers, roughness: 0.9 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.95 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: "#2b2622", roughness: 0.6 });
  const soleMat = new THREE.MeshStandardMaterial({ color: "#d8cfc0", roughness: 0.8 });

  const group = new THREE.Group();
  const hips = new THREE.Group();
  const baseHipY = 0.94;
  hips.position.y = baseHipY;
  group.add(hips);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), trousersMat);
  pelvis.position.y = 0.02;
  hips.add(pelvis);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.23), shoeMat);
  belt.position.y = 0.12;
  hips.add(belt);

  const torso = new THREE.Group();
  torso.position.y = 0.12;
  hips.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.155, 0.52, 12), shirtMat);
  chest.position.y = 0.32;
  torso.add(chest);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.24), shirtMat);
  shoulders.position.y = 0.56;
  torso.add(shoulders);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 14), shirtDark);
  collar.position.y = 0.62;
  collar.rotation.x = Math.PI / 2;
  torso.add(collar);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skinMat);
  neck.position.y = 0.66;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.82;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 16), skinMat);
  skull.scale.set(0.92, 1.12, 0.98);
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), skinMat);
  jaw.position.set(0, -0.1, 0.035);
  jaw.scale.set(0.85, 0.8, 0.9);
  head.add(jaw);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.19, 0.2),
    new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, toneMapped: false }),
  );
  face.position.set(0, 0.0, 0.132);
  face.rotation.x = -0.06;
  head.add(face);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), skinMat);
    ear.position.set(side * 0.135, -0.01, 0.01);
    head.add(ear);
  }
  const hairStyle = options.hairStyle % 3;
  if (hairStyle === 0) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.148, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
    cap.position.y = 0.012;
    cap.scale.set(0.94, 1.05, 1);
    head.add(cap);
  } else if (hairStyle === 1) {
    const afro = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 12), hairMat);
    afro.position.set(0, 0.05, -0.02);
    afro.scale.set(1, 0.95, 1);
    head.add(afro);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.146, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    cap.position.y = 0.012;
    head.add(cap);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), hairMat);
    bun.position.set(0, 0.1, -0.15);
    head.add(bun);
    for (let i = -1; i <= 1; i++) {
      const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.14, 3, 6), hairMat);
      braid.position.set(i * 0.05, -0.06, -0.15);
      braid.rotation.x = 0.25;
      head.add(braid);
    }
  }

  const buildArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 0.53, 0);
    torso.add(shoulder);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.1, 4, 10), shirtMat);
    sleeve.position.y = -0.07;
    shoulder.add(sleeve);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.16, 4, 10), skinMat);
    upper.position.y = -0.22;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 10), skinMat);
    fore.position.y = -0.13;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skinMat);
    hand.position.y = -0.28;
    hand.scale.set(0.85, 1.2, 0.9);
    elbow.add(hand);
    return { shoulder, elbow };
  };
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  const buildLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, -0.06, 0);
    hips.add(hip);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 10), trousersMat);
    thigh.position.y = -0.21;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.3, 4, 10), trousersMat);
    shin.position.y = -0.19;
    knee.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.27), shoeMat);
    shoe.position.set(0, -0.4, 0.045);
    knee.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.03, 0.28), soleMat);
    sole.position.set(0, -0.45, 0.045);
    knee.add(sole);
    return { hip, knee };
  };
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  group.scale.setScalar(scale);
  return {
    group,
    hips,
    torso,
    head,
    armL: leftArm.shoulder,
    armR: rightArm.shoulder,
    elbowL: leftArm.elbow,
    elbowR: rightArm.elbow,
    legL: leftLeg.hip,
    legR: rightLeg.hip,
    kneeL: leftLeg.knee,
    kneeR: rightLeg.knee,
    shirtMats: [shirtMat, shirtDark],
    skinMats: [skinMat],
    baseHipY,
  };
}

export function animateRig(rig: HumanRig, phase: number, speedNorm: number, time: number, wave = false) {
  const amp = Math.min(1, speedNorm);
  const swing = Math.sin(phase);
  const swingR = Math.sin(phase + Math.PI);
  rig.legL.rotation.x = swing * 0.68 * amp;
  rig.legR.rotation.x = swingR * 0.68 * amp;
  rig.kneeL.rotation.x = Math.max(0, Math.sin(phase - 1.1)) * 0.95 * amp;
  rig.kneeR.rotation.x = Math.max(0, Math.sin(phase + Math.PI - 1.1)) * 0.95 * amp;
  if (wave) {
    rig.armR.rotation.x = Math.PI * 0.85;
    rig.armR.rotation.z = Math.sin(time * 9) * 0.3;
    rig.elbowR.rotation.x = -0.4;
    rig.armL.rotation.x = swingR * 0.5 * amp + Math.sin(time * 1.8) * 0.03;
  } else {
    rig.armL.rotation.x = swingR * 0.52 * amp + Math.sin(time * 1.8) * 0.03;
    rig.armR.rotation.x = swing * 0.52 * amp - Math.sin(time * 1.8 + 1) * 0.03;
    rig.armR.rotation.z = 0.06;
  }
  rig.armL.rotation.z = -0.07;
  rig.elbowL.rotation.x = -0.28 - amp * 0.25;
  if (!wave) rig.elbowR.rotation.x = -0.28 - amp * 0.25;
  rig.hips.position.y = rig.baseHipY + Math.abs(Math.cos(phase)) * 0.045 * amp + Math.sin(time * 2.1) * 0.008;
  rig.hips.rotation.z = Math.sin(phase) * 0.035 * amp;
  rig.hips.rotation.y = Math.sin(phase) * 0.05 * amp;
  rig.torso.rotation.x = 0.05 * amp + Math.sin(time * 2.1) * 0.008;
  rig.torso.rotation.y = -Math.sin(phase) * 0.06 * amp;
  rig.head.rotation.y = Math.sin(time * 0.45) * (0.22 * (1 - amp) + 0.05);
  rig.head.rotation.x = -0.04 * amp + Math.sin(time * 0.7) * 0.03;
}

type DaySample = {
  sky: THREE.Color;
  fog: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  hemiIntensity: number;
  night: number;
  elevation: number;
  label: string;
};

const DAY_STOPS: { t: number; sky: string; fog: string; sun: string; sunI: number; hemiI: number; night: number; elev: number; label: string }[] = [
  { t: 0.0, sky: "#e8956b", fog: "#d99a78", sun: "#ffb37a", sunI: 2.0, hemiI: 1.2, night: 0.12, elev: 12, label: "Sunrise" },
  { t: 0.18, sky: "#9fc3e8", fog: "#b9c8d8", sun: "#fff2dc", sunI: 3.0, hemiI: 1.9, night: 0, elev: 55, label: "Morning" },
  { t: 0.4, sky: "#8fbde8", fog: "#b4c6d6", sun: "#ffffff", sunI: 3.2, hemiI: 2.0, night: 0, elev: 72, label: "Afternoon" },
  { t: 0.55, sky: "#f0a05e", fog: "#cf9a72", sun: "#ff9e57", sunI: 2.4, hemiI: 1.4, night: 0.08, elev: 16, label: "Golden Hour" },
  { t: 0.65, sky: "#5c5a8e", fog: "#5f5a78", sun: "#c97a5a", sunI: 0.9, hemiI: 0.8, night: 0.55, elev: 4, label: "Dusk" },
  { t: 0.74, sky: "#1c2338", fog: "#232a40", sun: "#8fa8d8", sunI: 0.35, hemiI: 0.5, night: 1, elev: -8, label: "Night" },
  { t: 0.92, sky: "#232c44", fog: "#2a3248", sun: "#9bb2dd", sunI: 0.4, hemiI: 0.55, night: 0.95, elev: -4, label: "Night" },
  { t: 1.0, sky: "#e8956b", fog: "#d99a78", sun: "#ffb37a", sunI: 2.0, hemiI: 1.2, night: 0.12, elev: 12, label: "Sunrise" },
];

function sampleDay(t: number): DaySample {
  const clamped = ((t % 1) + 1) % 1;
  let a = DAY_STOPS[0];
  let b = DAY_STOPS[DAY_STOPS.length - 1];
  for (let i = 0; i < DAY_STOPS.length - 1; i++) {
    if (clamped >= DAY_STOPS[i].t && clamped <= DAY_STOPS[i + 1].t) {
      a = DAY_STOPS[i];
      b = DAY_STOPS[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, b.t - a.t);
  const f = Math.min(1, Math.max(0, (clamped - a.t) / span));
  const smooth = f * f * (3 - 2 * f);
  return {
    sky: new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), smooth),
    fog: new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), smooth),
    sun: new THREE.Color(a.sun).lerp(new THREE.Color(b.sun), smooth),
    sunIntensity: a.sunI + (b.sunI - a.sunI) * smooth,
    hemiIntensity: a.hemiI + (b.hemiI - a.hemiI) * smooth,
    night: a.night + (b.night - a.night) * smooth,
    elevation: a.elev + (b.elev - a.elev) * smooth,
    label: smooth < 0.5 ? a.label : b.label,
  };
}

export default function ExploreCanvas(props: ExploreCanvasProps) {
  const {
    active, paused, look, skin, district, quality, rain, dayNight,
    skipIntroToken, initialPosition,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<EngineHandle | null>(null);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [introPlaying, setIntroPlaying] = useState(() => !exploreIntroSeen);
  const [failed, setFailed] = useState("");
  const propsRef = useRef(props);
  propsRef.current = {
    ...props,
    onNearby: (id: string | null) => {
      setNearbyId(id);
      props.onNearby(id);
    },
    onIntro: (isActive: boolean) => {
      setIntroPlaying(isActive);
      props.onIntro(isActive);
    },
  };
  const joyZoneRef = useRef<HTMLDivElement | null>(null);
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyKnobRef = useRef<HTMLDivElement | null>(null);
  const joyPointer = useRef<{ id: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        // MSAA is expensive on phone GPUs — keep it for large screens only.
        antialias: window.innerWidth > 760,
        powerPreference: "high-performance",
        stencil: false,
      });
    } catch (error) {
      console.error("STREETVERSE explore: WebGL unavailable", error);
      propsRef.current.onError("3D could not start on this device.");
      setFailed("3D could not start on this device.");
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e8956b");
    scene.fog = new THREE.Fog("#d99a78", 55, 150);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 320);
    camera.position.set(26, 20, 42);

    const hemi = new THREE.HemisphereLight(0xcfd8ec, 0x4a3a30, 1.4);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb37a, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    const streetGlowA = new THREE.PointLight(0xffb46a, 0, 30, 1.8);
    streetGlowA.position.set(0, 5, 2);
    scene.add(streetGlowA);
    const streetGlowB = new THREE.PointLight(0xffb46a, 0, 30, 1.8);
    streetGlowB.position.set(0, 5, -32);
    scene.add(streetGlowB);
    const streetGlowC = new THREE.PointLight(0x9db6ff, 0, 30, 1.8);
    streetGlowC.position.set(0, 5, -64);
    scene.add(streetGlowC);

    const glowTex = glowTexture();
    const mat = (color: string | number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...options });
    const colliders: Collider[] = [];
    const addCollider = (x: number, z: number, w: number, d: number) => {
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    };
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    // Ground, roads, sidewalks
    const groundTex = groundTexture();
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(18, 20);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(170, 190),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -40);
    ground.receiveShadow = true;
    scene.add(ground);

    const roadTex = roadTexture();
    roadTex.repeat.set(1, 14);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85, metalness: 0.02 });
    const avenue = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 122), roadMat);
    avenue.rotation.x = -Math.PI / 2;
    avenue.position.set(0, 0.015, -39);
    avenue.receiveShadow = true;
    scene.add(avenue);
    const crossTex = roadTexture();
    crossTex.repeat.set(1, 7);
    const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 58), new THREE.MeshStandardMaterial({ map: crossTex, roughness: 0.85 }));
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.rotation.z = Math.PI / 2;
    crossRoad.position.set(0, 0.013, -38);
    crossRoad.receiveShadow = true;
    scene.add(crossRoad);
    const zebraMat = new THREE.MeshBasicMaterial({ color: "#cfc9b4", transparent: true, opacity: 0.75 });
    for (const z of [-8, -38]) {
      for (let i = -3; i <= 3; i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 1.7), zebraMat);
        stripe.position.set(i * 0.95, 0.03, z);
        scene.add(stripe);
      }
    }
    const sideMat = mat("#5b564e", { roughness: 0.98 });
    const curbMat = mat("#8d7c66", { roughness: 0.9 });
    for (const side of [-1, 1]) {
      box(scene, 2.6, 0.16, 122, side * 5.1, 0.06, -39, sideMat).receiveShadow = true;
      box(scene, 0.16, 0.2, 122, side * 3.85, 0.07, -39, curbMat);
      const drain = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 122), mat("#22242a", { roughness: 1 }));
      drain.position.set(side * 6.15, 0.15, -39);
      scene.add(drain);
    }

    // Buildings
    const facadeMats: THREE.MeshStandardMaterial[] = [];
    const signGlows: THREE.Sprite[] = [];
    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);
    const palette = ["#c2a284", "#a9806e", "#b59a76", "#a9a49c", "#bd9a78", "#93887e", "#b98f6f"];
    const addBuilding = (x: number, z: number, w: number, d: number, h: number, color: string, seed: number, sign?: { title: string; sub: string; color: string }) => {
      const floors = Math.max(1, Math.floor((h - 1.6) / 2.1));
      const cols = Math.max(2, Math.floor(w / 2.2));
      const { map, emissive } = facadeTextures(color, seed, floors, cols);
      const wallMat = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.92 });
      facadeMats.push(wallMat);
      const sideMatInner = mat(color, { roughness: 0.95 });
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideMatInner, sideMatInner, sideMatInner, sideMatInner, wallMat, wallMat]);
      building.position.set(x, h / 2, z);
      building.castShadow = true;
      building.receiveShadow = true;
      buildingGroup.add(building);
      box(buildingGroup, w + 0.3, 0.3, d + 0.3, x, h + 0.1, z, mat("#4a423b", { roughness: 1 }));
      if (seed % 3 === 0) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10), mat("#3d4a55", { roughness: 0.7 }));
        tank.position.set(x + w * 0.22, h + 0.75, z - d * 0.15);
        tank.castShadow = true;
        buildingGroup.add(tank);
      }
      if (sign) {
        const facing = x > 0 ? -1 : 1;
        const signMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.min(4.6, w * 0.72), 1.05),
          new THREE.MeshBasicMaterial({ map: signTexture(sign.title, sign.sub, sign.color), toneMapped: false }),
        );
        signMesh.position.set(x + facing * (w / 2 + 0.06), 2.35, z);
        signMesh.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
        buildingGroup.add(signMesh);
        box(buildingGroup, 0.14, 1.2, Math.min(4.8, w * 0.74), x + facing * (w / 2), 2.35, z, mat("#141c2a"));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: sign.color, transparent: true, opacity: 0, depthWrite: false }));
        glow.position.set(x + facing * (w / 2 + 0.5), 2.35, z);
        glow.scale.set(6, 3, 1);
        buildingGroup.add(glow);
        signGlows.push(glow);
        const doorGlow = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 1.9),
          new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0.85, toneMapped: false }),
        );
        doorGlow.position.set(x + facing * (w / 2 + 0.04), 1.0, z + 1.6);
        doorGlow.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
        buildingGroup.add(doorGlow);
      }
      addCollider(x, z, w + 0.4, d + 0.4);
    };

    const avenueSlots = [-88, -77, -66, -55, -46, -33, -24, -13, -4, 4];
    avenueSlots.forEach((z, i) => {
      const tall = z < -50;
      addBuilding(-9.6, z, 5.6, 9.4, tall ? 11 + (i % 3) * 2.2 : 5.4 + (i % 3) * 1.4, palette[i % palette.length], 11 + i * 7,
        z === 4 ? { title: "MAMA T'S SUYA", sub: "OPEN LATE · YABA", color: "#c95840" }
        : z === -24 ? { title: "EKO TRUST BANK", sub: "ATM · 24 HOURS", color: "#3c5a8e" }
        : z === -55 ? { title: "BALOGUN TEXTILES", sub: "ANKARA · LACE · ASO-EBI", color: "#644c91" }
        : z === -77 ? { title: "YABA RECORDS", sub: "AFROBEATS · VINYL", color: "#3c718e" } : undefined);
      addBuilding(9.6, z, 5.6, 9.4, tall ? 12 + ((i + 1) % 3) * 2.4 : 5.8 + ((i + 1) % 3) * 1.5, palette[(i + 3) % palette.length], 31 + i * 5,
        z === -13 ? { title: "EKO NIGHT MART", sub: "SNACKS · DRINKS · AIRTIME", color: "#387e70" }
        : z === -46 ? { title: "MOTOR PARK", sub: "KEKE · BIKES · DEALS", color: "#bf813a" }
        : z === -66 ? { title: "IJORA FRESH", sub: "MARKET · DAILY", color: "#c56d43" }
        : undefined);
    });
    // Cross-street flats
    addBuilding(-14, -44.5, 8, 5, 7.5, "#b19a78", 77, { title: "SHITTA FLATS", sub: "AMALA · 2 MIN", color: "#8a5a3c" });
    addBuilding(14.5, -31.5, 8, 5, 8.2, "#a9a6a0", 78, { title: "OJO BLOCKS", sub: "EST. 1998", color: "#4c6a91" });
    addBuilding(-15, -31.5, 7, 5, 6.4, "#c0a184", 79);
    addBuilding(15, -44.5, 7, 5, 9.4, "#8f8880", 80, { title: "EKO PLAZA", sub: "OFFICES · SHOPS", color: "#3f6a5a" });

    // Home bungalow
    const homeGroup = new THREE.Group();
    homeGroup.position.set(-11, 0, 12);
    scene.add(homeGroup);
    box(homeGroup, 5.4, 2.9, 4.4, 0, 1.45, 0, mat("#c9b189", { roughness: 0.95 })).castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 1.7, 4), mat("#7a4a38", { roughness: 0.9 }));
    roof.position.y = 3.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    homeGroup.add(roof);
    box(homeGroup, 1.0, 1.9, 0.1, -0.8, 0.95, 2.22, mat("#4a3a2c"));
    const homeWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshBasicMaterial({ color: "#ffcf8e", toneMapped: false }));
    homeWindow.position.set(1.1, 1.6, 2.23);
    homeGroup.add(homeWindow);
    box(homeGroup, 7.4, 0.9, 0.14, 0, 0.45, 4.1, mat("#6b5a48"));
    addCollider(-11, 12, 5.8, 4.8);

    // Bus park lot
    const lotMat = mat("#4c4a45", { roughness: 1 });
    box(scene, 9, 0.06, 10, 12.5, 0.03, 6, lotMat).receiveShadow = true;
    for (const gx of [8.6, 12.5, 16.4]) {
      box(scene, 0.18, 2.6, 0.18, gx, 1.3, 1.4, mat("#3a3f47", { metalness: 0.3, roughness: 0.6 }));
    }
    box(scene, 8.4, 0.5, 0.24, 12.5, 2.7, 1.4, mat("#20304a"));
    const parkSign = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 1.0),
      new THREE.MeshBasicMaterial({ map: signTexture("YABA BUS PARK", "DANFO · KEKE · LAST BUS 11PM", "#bf813a"), toneMapped: false }),
    );
    parkSign.position.set(12.5, 2.0, 1.52);
    scene.add(parkSign);
    addCollider(12.5, 1.4, 8.6, 0.5);
    // Shelter
    for (const sx of [10.4, 14.6]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.5, 8), mat("#3a3f47", { metalness: 0.35, roughness: 0.55 }));
      pole.position.set(sx, 1.25, 8.6);
      pole.castShadow = true;
      scene.add(pole);
    }
    box(scene, 5.0, 0.14, 1.8, 12.5, 2.55, 8.6, mat("#b0563f", { roughness: 0.7 })).castShadow = true;
    box(scene, 4.4, 0.1, 0.5, 12.5, 0.75, 8.8, mat("#7a5a42"));
    addCollider(12.5, 8.7, 5.0, 1.2);
    // Bus-stop bench
    const benchMat = mat("#7a5a42", { roughness: 0.9 });
    box(scene, 2.2, 0.1, 0.6, -4.2, 0.55, 6.0, benchMat).castShadow = true;
    box(scene, 0.12, 0.55, 0.5, -5.1, 0.28, 6.0, benchMat);
    box(scene, 0.12, 0.55, 0.5, -3.3, 0.28, 6.0, benchMat);
    box(scene, 2.0, 0.5, 0.08, -4.2, 0.95, 5.75, benchMat);
    addCollider(-4.2, 6.0, 2.3, 0.7);

    // Street lamps
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: "#ffcf7b", emissive: "#ffad55", emissiveIntensity: 0.6, roughness: 0.3 });
    const lampGlows: THREE.Sprite[] = [];
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.1, 4.1, 7);
    const poleMat = mat("#33373e", { metalness: 0.35, roughness: 0.6 });
    for (let i = 0; i < 8; i++) {
      const z = 12 - i * 14;
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(side * 4.35, 2.0, z);
        pole.castShadow = true;
        scene.add(pole);
        box(scene, 0.7, 0.1, 0.16, side * 4.0, 4.0, z, poleMat);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.3), lampHeadMat);
        lamp.position.set(side * 3.8, 3.93, z);
        scene.add(lamp);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffc37a", transparent: true, opacity: 0.3, depthWrite: false }));
        glow.position.set(side * 3.8, 3.85, z);
        glow.scale.set(3.4, 3.4, 1);
        scene.add(glow);
        lampGlows.push(glow);
      }
    }

    // Palms
    const trunkMat = mat("#77513b", { roughness: 1 });
    const frondMat = mat("#3d7a5e", { roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (7.6 + (i % 3) * 1.1);
      const z = 10 - i * 11.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 3.4, 7), trunkMat);
      trunk.position.set(x, 1.7, z);
      trunk.castShadow = true;
      scene.add(trunk);
      for (let leaf = 0; leaf < 6; leaf++) {
        const palm = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.22, 5), frondMat);
        palm.position.set(x + Math.cos((leaf / 6) * Math.PI * 2) * 0.8, 3.5, z + Math.sin((leaf / 6) * Math.PI * 2) * 0.8);
        palm.rotation.z = Math.cos((leaf / 6) * Math.PI * 2) * 0.5;
        palm.rotation.x = Math.sin((leaf / 6) * Math.PI * 2) * 0.5;
        palm.castShadow = true;
        scene.add(palm);
      }
      addCollider(x, z, 0.7, 0.7);
    }

    // Market stalls + clutter
    const stallColors = ["#cb513f", "#e3a644", "#43947f"];
    const stallSpots: [number, number][] = [[-5.1, -6.5], [5.1, -19], [-5.1, -30]];
    stallSpots.forEach(([sx, sz], si) => {
      box(scene, 1.6, 1.0, 2.2, sx, 0.65, sz, mat("#6b4c3c", { roughness: 0.95 })).castShadow = true;
      box(scene, 1.9, 0.14, 2.6, sx, 1.75, sz, mat(stallColors[si % 3], { roughness: 0.75 })).castShadow = true;
      for (const [lx, lz] of [[-0.8, -1.1], [0.8, -1.1], [-0.8, 1.1], [0.8, 1.1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6), mat("#8e6549"));
        leg.position.set(sx + lx, 1.15, sz + lz);
        scene.add(leg);
      }
      const fruitMat = mat(si === 1 ? "#d8543c" : si === 2 ? "#e0a83e" : "#7fae56", { roughness: 0.6 });
      for (let f = 0; f < 7; f++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), fruitMat);
        fruit.position.set(sx - 0.55 + (f % 4) * 0.36, 1.25, sz - 0.5 + Math.floor(f / 4) * 0.5);
        scene.add(fruit);
      }
      addCollider(sx, sz, 2.0, 2.7);
    });
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const cx = side * (6.6 + (i % 2) * 0.5);
      const cz = 8 - i * 9.3;
      if (i % 3 === 0) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.85, 10), mat(i % 2 ? "#3f5a78" : "#7a5a3a", { roughness: 0.8 }));
        barrel.position.set(cx, 0.55, cz);
        barrel.castShadow = true;
        scene.add(barrel);
      } else {
        box(scene, 0.62, 0.62, 0.62, cx, 0.45, cz, mat("#8a6a48", { roughness: 0.95 })).castShadow = true;
      }
      addCollider(cx, cz, 0.8, 0.8);
    }

    // Billboards
    const billboard = (x: number, z: number, title: string, sub: string, color: string, facing: number) => {
      for (const px of [-1.6, 1.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.4, 8), poleMat);
        post.position.set(x + px, 2.7, z);
        post.castShadow = true;
        scene.add(post);
      }
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(5.2, 2.2),
        new THREE.MeshBasicMaterial({ map: signTexture(title, sub, color), toneMapped: false }),
      );
      board.position.set(x, 5.4, z + facing * 0.1);
      if (facing < 0) board.rotation.y = Math.PI;
      scene.add(board);
      box(scene, 5.5, 2.5, 0.18, x, 5.4, z, mat("#1a2230"));
      addCollider(x, z, 5.4, 0.6);
    };
    billboard(-8.2, -52, "STREETVERSE", "YOUR LIFE · YOUR HUSTLE · YOUR CITY", "#644c91", 1);
    billboard(8.4, -72, "EKO NIGHT MARKET", "EVERY FRIDAY · LEKKI GATE", "#c95840", -1);

    // Distant skyline
    const towerTex = facadeTextures("#2b3342", 999, 8, 5);
    const towerMat = new THREE.MeshStandardMaterial({ map: towerTex.map, emissiveMap: towerTex.emissive, emissive: "#ffffff", emissiveIntensity: 0, roughness: 1 });
    facadeMats.push(towerMat);
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(9, 16 + (i % 4) * 7, 9), towerMat);
      tower.position.set(side * (38 + (i % 3) * 12), 8, -110 + i * 12);
      scene.add(tower);
    }

    // Stars + moon
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      const radius = 200;
      starPositions[i * 3] = Math.cos(theta) * Math.cos(phi) * radius;
      starPositions[i * 3 + 1] = Math.sin(phi) * radius + 8;
      starPositions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * radius - 40;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: "#dfe8ff", size: 1.4, transparent: true, opacity: 0, fog: false, sizeAttenuation: false });
    scene.add(new THREE.Points(starGeo, starMat));
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#e8eeff", transparent: true, opacity: 0, fog: false, depthWrite: false }));
    moon.position.set(-60, 70, -140);
    moon.scale.set(22, 22, 1);
    scene.add(moon);

    // Interaction rings + markers
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);
    const ringMeshes: THREE.Mesh[] = [];
    const diamondMeshes: THREE.Mesh[] = [];
    for (const spot of INTERACTABLES) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.07, 8, 32),
        new THREE.MeshBasicMaterial({ color: spot.color, transparent: true, opacity: 0.9, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(spot.x, 0.12, spot.z);
      markerGroup.add(ring);
      ringMeshes.push(ring);
      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshBasicMaterial({ color: spot.color, toneMapped: false }),
      );
      diamond.position.set(spot.x, 2.6, spot.z);
      markerGroup.add(diamond);
      diamondMeshes.push(diamond);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: spot.color, transparent: true, opacity: 0.35, depthWrite: false }));
      glow.position.set(spot.x, 0.6, spot.z);
      glow.scale.set(3.6, 2.2, 1);
      markerGroup.add(glow);
    }

    // Vehicles
    type Vehicle = { group: THREE.Group; lane: number; dir: 1 | -1; speed: number; wheels: THREE.Object3D[]; cones: THREE.Mesh[]; kind: string };
    const vehicles: Vehicle[] = [];
    const headlightMat = new THREE.MeshBasicMaterial({ color: "#ffe9b8", toneMapped: false });
    const tailMat = new THREE.MeshBasicMaterial({ color: "#ff4d4d", toneMapped: false });
    const coneMat = new THREE.MeshBasicMaterial({ color: "#ffdf9e", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const addHeadlights = (group: THREE.Group, y: number, z: number, spread: number, dir: number) => {
      const cones: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), headlightMat);
        lampMesh.position.set(side * spread, y, z + dir * 0.06);
        group.add(lampMesh);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.2, 12, 1, true), coneMat);
        cone.rotation.x = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        cone.position.set(side * spread, y - 0.25, z + dir * 2.4);
        group.add(cone);
        cones.push(cone);
      }
      return cones;
    };
    const buildDanfo = () => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.35, 2.9), mat("#e0aa38", { roughness: 0.5, metalness: 0.08 }));
      body.position.y = 1.0;
      body.castShadow = true;
      group.add(body);
      box(group, 1.72, 0.28, 2.92, 0, 1.78, 0, mat("#f0c75c", { roughness: 0.55 }));
      box(group, 1.74, 0.22, 2.94, 0, 0.5, 0, mat("#2e2e36", { roughness: 0.6 }));
      const glassMat = mat("#223140", { roughness: 0.15, metalness: 0.35 });
      box(group, 1.5, 0.55, 0.08, 0, 1.25, 1.46, glassMat);
      for (const side of [-1, 1]) {
        box(group, 0.06, 0.45, 1.1, side * 0.86, 1.25, -0.5, glassMat);
        box(group, 0.06, 0.45, 0.7, side * 0.86, 1.25, 0.75, glassMat);
      }
      const route = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.28), new THREE.MeshBasicMaterial({ map: signTexture("YABA · CMS", "FARE ₦500", "#182536"), toneMapped: false }));
      route.position.set(0, 1.62, 1.47);
      group.add(route);
      const wheels: THREE.Object3D[] = [];
      for (const side of [-1, 1]) {
        for (const wz of [-0.95, 0.95]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12), mat("#1e2126", { roughness: 0.9 }));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(side * 0.85, 0.36, wz);
          wheel.castShadow = true;
          group.add(wheel);
          wheels.push(wheel);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 8), mat("#9d9991", { metalness: 0.5, roughness: 0.4 }));
          hub.rotation.z = Math.PI / 2;
          hub.position.set(side * 0.85, 0.36, wz);
          group.add(hub);
        }
      }
      for (const side of [-1, 1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.06), tailMat);
        tail.position.set(side * 0.6, 0.85, -1.47);
        group.add(tail);
      }
      return { group, wheels };
    };
    const buildKeke = () => {
      const group = new THREE.Group();
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.9, 1.9), mat("#e8b83b", { roughness: 0.55 }));
      cabin.position.y = 0.75;
      cabin.castShadow = true;
      group.add(cabin);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 2.0), mat("#2f6b58", { roughness: 0.7 }));
      canopy.position.y = 1.42;
      group.add(canopy);
      box(group, 1.1, 0.5, 0.08, 0, 1.0, 0.96, mat("#223140", { roughness: 0.2, metalness: 0.3 }));
      box(group, 0.5, 0.1, 0.3, 0, 0.95, 1.05, mat("#33373e"));
      const wheels: THREE.Object3D[] = [];
      const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.16, 10);
      const wheelMat = mat("#1e2126", { roughness: 0.9 });
      const positions: [number, number][] = [[0, 1.0], [-0.62, -0.6], [0.62, -0.6]];
      for (const [wx, wz] of positions) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.28, wz);
        group.add(wheel);
        wheels.push(wheel);
      }
      return { group, wheels };
    };
    const buildTaxi = () => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 3.4), mat("#e8c83e", { roughness: 0.4, metalness: 0.12 }));
      body.position.y = 0.62;
      body.castShadow = true;
      group.add(body);
      box(group, 1.5, 0.55, 1.7, 0, 1.15, -0.2, mat("#223140", { roughness: 0.18, metalness: 0.3 }));
      box(group, 0.7, 0.18, 0.4, 0, 1.5, -0.2, new THREE.MeshBasicMaterial({ color: "#fff3cf", toneMapped: false }));
      const wheels: THREE.Object3D[] = [];
      for (const side of [-1, 1]) {
        for (const wz of [-1.1, 1.1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 12), mat("#1e2126", { roughness: 0.9 }));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(side * 0.8, 0.34, wz);
          group.add(wheel);
          wheels.push(wheel);
        }
      }
      return { group, wheels };
    };
    const spawnVehicle = (kind: string, lane: number, dir: 1 | -1, z: number, speed: number) => {
      const built = kind === "danfo" ? buildDanfo() : kind === "keke" ? buildKeke() : buildTaxi();
      const front = dir > 0 ? 1.45 : -1.45;
      const cones = addHeadlights(built.group, kind === "keke" ? 0.8 : 0.72, front, kind === "keke" ? 0.3 : 0.55, dir);
      if (dir < 0) built.group.rotation.y = Math.PI;
      built.group.position.set(lane, 0, z);
      scene.add(built.group);
      vehicles.push({ group: built.group, lane, dir, speed, wheels: built.wheels, cones, kind });
    };
    spawnVehicle("danfo", -1.9, 1, -70, 8.5);
    spawnVehicle("danfo", 1.9, -1, -20, 9.2);
    spawnVehicle("keke", -1.9, 1, -10, 6.4);
    spawnVehicle("taxi", 1.9, -1, -78, 10.5);
    spawnVehicle("danfo", -1.9, 1, -40, 8.0);
    spawnVehicle("keke", 1.9, -1, -52, 6.8);
    spawnVehicle("taxi", -1.9, 1, -95, 10.0);
    // Parked danfos at the bus park
    const parked1 = buildDanfo();
    parked1.group.position.set(11.2, 0, 5.2);
    parked1.group.rotation.y = 0.35;
    scene.add(parked1.group);
    addCollider(11.2, 5.2, 2.4, 3.4);
    const parked2 = buildDanfo();
    parked2.group.position.set(14.2, 0, 4.4);
    parked2.group.rotation.y = -0.3;
    scene.add(parked2.group);
    addCollider(14.2, 4.4, 2.4, 3.4);
    const displayKeke = buildKeke();
    displayKeke.group.position.set(11.5, 0, -45.5);
    displayKeke.group.rotation.y = 0.5;
    scene.add(displayKeke.group);
    addCollider(11.5, -45.5, 1.8, 2.4);

    // Player + pedestrians
    const playerRig = buildHuman({ skin: propsRef.current.skin, shirt: OUTFIT_COLORS[propsRef.current.look] ?? "#3c91db", trousers: "#232c40", hairStyle: 0 });
    const startPos = propsRef.current.initialPosition ?? { x: 0, z: 14 };
    playerRig.group.position.set(THREE.MathUtils.clamp(startPos.x, WORLD.minX, WORLD.maxX), 0, THREE.MathUtils.clamp(startPos.z, WORLD.minZ, WORLD.maxZ));
    playerRig.group.rotation.y = Math.PI;
    scene.add(playerRig.group);
    playerRig.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    const blobMat = new THREE.MeshBasicMaterial({ color: "#090d13", transparent: true, opacity: 0.32, depthWrite: false });
    const playerBlob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), blobMat);
    playerBlob.rotation.x = -Math.PI / 2;
    playerBlob.position.y = 0.045;
    playerRig.group.add(playerBlob);

    const SKIN_TONES = ["#845139", "#a76545", "#ca8a65", "#e0ae83", "#6e3f2c"];
    const SHIRTS = ["#c9563f", "#3f7a6b", "#e0a83e", "#5a6fa8", "#d8d3c8", "#7a4a68", "#4a8a3f", "#c9c9c9"];
    const NPC_NAMES = ["Tunde", "Adaeze", "Chidi", "Zainab", "Emeka", "Ngozi", "Kelechi", "Funke", "Bola", "Sade"];
    const NPC_GREETINGS = ["How far?", "You dey alright?", "Wetin dey happen?", "Oga, good evening.", "The city dey busy today.", "Na you sabi.", "Wahala dey? No wahala.", "Come chop something."];
    type Pedestrian = { rig: HumanRig; x: number; z: number; dir: 1 | -1; speed: number; phase: number; trader: boolean; name: string; greeted: boolean };
    const pedestrians: Pedestrian[] = [];
    for (let i = 0; i < 10; i++) {
      const rig = buildHuman({
        skin: SKIN_TONES[i % SKIN_TONES.length],
        shirt: SHIRTS[(i * 3 + 1) % SHIRTS.length],
        trousers: i % 2 ? "#2b2f3a" : "#4a3a30",
        hairStyle: i % 3,
      });
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * 5.15;
      const z = 12 - i * 10.5;
      rig.group.position.set(x, 0, z);
      scene.add(rig.group);
      rig.group.traverse((child) => {
        if (child instanceof THREE.Mesh) child.castShadow = true;
      });
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.16;
      rig.group.add(blob);
      pedestrians.push({ rig, x, z, dir: i % 4 < 2 ? 1 : -1, speed: 1.1 + (i % 3) * 0.3, phase: Math.random() * 6, trader: false, name: NPC_NAMES[i % NPC_NAMES.length], greeted: false });
    }
    // Trader behind the first stall
    const traderRig = buildHuman({ skin: SKIN_TONES[1], shirt: "#e0a83e", trousers: "#3a2f28", hairStyle: 2 });
    traderRig.group.position.set(-5.1, 0.14, -7.9);
    traderRig.group.rotation.y = 0;
    scene.add(traderRig.group);
    pedestrians.push({ rig: traderRig, x: -5.1, z: -7.9, dir: 1, speed: 0, phase: 0, trader: true, name: "Adaeze", greeted: false });

    // Collectibles
    type Pickup = { group: THREE.Group; kind: "note" | "parcel"; x: number; z: number; taken: boolean; respawnAt: number; spin: number };
    const pickups: Pickup[] = [];
    const noteTex = noteFaceTexture();
    const pickupSpots: [number, number][] = [
      [-5.1, 8], [5.1, 2], [-5.1, -3], [5.1, -8], [-5.1, -14], [5.1, -16], [-5.1, -21],
      [5.1, -26], [-5.1, -34], [5.1, -36], [0, -44], [-5.1, -50], [5.1, -54], [-5.1, -62],
      [5.1, -68], [0, -74], [-5.1, -82], [12.5, 10], [-11, 8],
    ];
    const parcelSpots: [number, number][] = [[5.1, -42], [-11, 12], [12.5, -2]];
    const makeNote = (x: number, z: number, kind: "note" | "parcel") => {
      const group = new THREE.Group();
      group.position.set(x, 0.16, z);
      if (kind === "note") {
        const disk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.09, 20),
          new THREE.MeshStandardMaterial({ color: "#f6bd50", metalness: 0.55, roughness: 0.28, emissive: "#af6120", emissiveIntensity: 0.3 }),
        );
        disk.rotation.x = Math.PI / 2;
        disk.position.y = 0.85;
        group.add(disk);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: noteTex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
        label.position.set(0, 0.85, 0.055);
        group.add(label);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 7, 22), new THREE.MeshBasicMaterial({ color: "#ffbf59", transparent: true, opacity: 0.8, depthWrite: false }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        group.add(ring);
      } else {
        box(group, 0.72, 0.7, 0.64, 0, 0.55, 0, mat("#f07c4d", { roughness: 0.6 }));
        box(group, 0.14, 0.73, 0.67, 0, 0.55, 0, mat("#f5c367"));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 7, 22), new THREE.MeshBasicMaterial({ color: "#83dbbd", transparent: true, opacity: 0.85, depthWrite: false }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        group.add(ring);
      }
      scene.add(group);
      pickups.push({ group, kind, x, z, taken: false, respawnAt: 0, spin: Math.random() * 6 });
    };
    pickupSpots.forEach(([x, z]) => makeNote(x, z, "note"));
    parcelSpots.forEach(([x, z]) => makeNote(x, z, "parcel"));

    // Suya grill smoke
    const smokeSprites: { sprite: THREE.Sprite; t: number }[] = [];
    const grillX = -5.1;
    const grillZ = 1.2;
    box(scene, 1.3, 0.7, 0.8, grillX, 0.5, grillZ, mat("#2e2a26", { roughness: 0.9 })).castShadow = true;
    const coals = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.6), new THREE.MeshBasicMaterial({ color: "#ff7a3c", toneMapped: false }));
    coals.position.set(grillX, 0.9, grillZ);
    scene.add(coals);
    for (let i = 0; i < 6; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#9a9a9a", transparent: true, opacity: 0.22, depthWrite: false }));
      sprite.position.set(grillX, 1.2, grillZ);
      sprite.scale.set(0.7, 0.7, 1);
      scene.add(sprite);
      smokeSprites.push({ sprite, t: i / 6 });
    }

    // Rain
    const RAIN_COUNT = 700;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 36;
      rainPos[i * 3 + 1] = Math.random() * 20;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({ color: "#aebfd4", size: 0.14, transparent: true, opacity: 0.5, depthWrite: false });
    const rainPoints = new THREE.Points(rainGeo, rainMat);
    rainPoints.visible = false;
    rainPoints.frustumCulled = false;
    scene.add(rainPoints);

    // Particles (pickup bursts)
    type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number };
    const particles: Particle[] = [];
    const burst = (position: THREE.Vector3, color: string, count = 12) => {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.06 + Math.random() * 0.04, 0),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
        );
        mesh.position.copy(position);
        mesh.position.y += 0.7 + Math.random() * 0.6;
        scene.add(mesh);
        particles.push({
          mesh,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 1.5, (Math.random() - 0.5) * 6),
          life: 0.7 + Math.random() * 0.5,
        });
      }
    };

    // State
    const input = { forward: 0, strafe: 0, run: false, joyX: 0, joyY: 0 };
    const keys = new Set<string>();
    let camYaw = 0;
    let camPitch = 0.34;
    let camDist = 7.4;
    let playerHeading = Math.PI;
    let playerSpeed = 0;
    let walkPhase = 0;
    let dayTime = 0.52;
    let dayEnabled = propsRef.current.dayNight;
    let rainEnabled = propsRef.current.rain;
    let currentQuality: ExploreQuality = propsRef.current.quality;
    let currentDistrict = propsRef.current.district;
    let introActive = !exploreIntroSeen;
    exploreIntroSeen = true;
    let introT = 0;
    const INTRO_LENGTH = 8.5;
    let nearby: string | null = null;
    let sitting = false;
    let lastInteractAt = 0;
    let lastPickupAt = -10;
    let combo = 0;
    let hornCooldown = 0;
    let lastPosReport = 0;
    let lastTimeReport = 0;
    let disposed = false;
    let readyFired = false;
    const velocity = new THREE.Vector3();
    const camTarget = new THREE.Vector3();
    const desiredCam = new THREE.Vector3();
    const clock = new THREE.Clock();

    const districtTint: Record<string, THREE.Color> = {
      yaba: new THREE.Color("#ffffff"),
      balogun: new THREE.Color("#ffe6cf"),
      vi: new THREE.Color("#dfe4ff"),
      lekki: new THREE.Color("#d8ffe9"),
    };

    function applyQuality(q: ExploreQuality) {
      currentQuality = q;
      const isMobile = window.innerWidth < 760;
      const dpr = window.devicePixelRatio || 1;
      if (q === "low") {
        renderer.setPixelRatio(Math.min(dpr, 1));
        renderer.shadowMap.enabled = false;
        sun.castShadow = false;
      } else if (q === "medium") {
        renderer.setPixelRatio(Math.min(dpr, isMobile ? 1.25 : 1.5));
        renderer.shadowMap.enabled = true;
        // PCFSoft is noticeably more expensive than PCF — only pay for it on high.
        renderer.shadowMap.type = THREE.PCFShadowMap;
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
      } else {
        renderer.setPixelRatio(Math.min(dpr, isMobile ? 1.5 : 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
      }
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      const pedCount = q === "low" ? 4 : q === "medium" ? 7 : 10;
      pedestrians.forEach((ped, i) => {
        ped.rig.group.visible = ped.trader || i < pedCount;
      });
      const vehCount = q === "low" ? 3 : q === "medium" ? 5 : 7;
      vehicles.forEach((vehicle, i) => {
        vehicle.group.visible = i < vehCount;
      });
      rainPoints.visible = rainEnabled && q !== "low";
    }

    function resolveCollision(position: THREE.Vector3, radius: number) {
      for (const boxCollider of colliders) {
        const cx = THREE.MathUtils.clamp(position.x, boxCollider.minX, boxCollider.maxX);
        const cz = THREE.MathUtils.clamp(position.z, boxCollider.minZ, boxCollider.maxZ);
        const dx = position.x - cx;
        const dz = position.z - cz;
        const distSq = dx * dx + dz * dz;
        if (distSq < radius * radius) {
          if (distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            position.x = cx + (dx / dist) * radius;
            position.z = cz + (dz / dist) * radius;
          } else {
            const pushLeft = position.x - boxCollider.minX + radius;
            const pushRight = boxCollider.maxX - position.x + radius;
            const pushNear = position.z - boxCollider.minZ + radius;
            const pushFar = boxCollider.maxZ - position.z + radius;
            const min = Math.min(pushLeft, pushRight, pushNear, pushFar);
            if (min === pushLeft) position.x = boxCollider.minX - radius;
            else if (min === pushRight) position.x = boxCollider.maxX + radius;
            else if (min === pushNear) position.z = boxCollider.minZ - radius;
            else position.z = boxCollider.maxZ + radius;
          }
        }
      }
      position.x = THREE.MathUtils.clamp(position.x, WORLD.minX, WORLD.maxX);
      position.z = THREE.MathUtils.clamp(position.z, WORLD.minZ, WORLD.maxZ);
    }

    function tryInteract() {
      if (!propsRef.current.active || propsRef.current.paused || introActive) return;
      if (!nearby) return;
      const now = performance.now();
      if (now - lastInteractAt < 700) return;
      lastInteractAt = now;
      propsRef.current.onInteract(nearby);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      keys.add(key);
      if (key === "e" || key === "enter" || key === "f") tryInteract();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Camera drag + zoom on canvas
    let dragging = false;
    let dragPointer = -1;
    let lastDragX = 0;
    let lastDragY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" && event.clientX < window.innerWidth * 0.45) return;
      dragging = true;
      dragPointer = event.pointerId;
      lastDragX = event.clientX;
      lastDragY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== dragPointer) return;
      const dx = event.clientX - lastDragX;
      const dy = event.clientY - lastDragY;
      lastDragX = event.clientX;
      lastDragY = event.clientY;
      camYaw -= dx * 0.0052;
      camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.0035, 0.1, 1.05);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === dragPointer) {
        dragging = false;
        dragPointer = -1;
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camDist = THREE.MathUtils.clamp(camDist + event.deltaY * 0.008, 4.2, 11.5);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    function resize() {
      if (disposed) return;
      const parent = canvasRef.current?.parentElement;
      if (!parent) return;
      const width = Math.max(1, parent.clientWidth);
      const height = Math.max(1, parent.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!readyFired) {
        readyFired = true;
        propsRef.current.onReady();
      }
    }
    const resizeObserver = new ResizeObserver(resize);
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    applyQuality(propsRef.current.quality);
    resize();

    const handle: EngineHandle = {
      setLook: (nextLook, nextSkin) => {
        const color = OUTFIT_COLORS[nextLook] ?? OUTFIT_COLORS.surulere;
        playerRig.shirtMats[0].color.set(color);
        playerRig.shirtMats[1].color.set(new THREE.Color(color).multiplyScalar(0.72));
        for (const skinMat of playerRig.skinMats) skinMat.color.set(nextSkin);
      },
      setDistrict: (next) => {
        currentDistrict = next;
      },
      setQuality: (q) => applyQuality(q),
      setRain: (value) => {
        rainEnabled = value;
        rainPoints.visible = value && currentQuality !== "low";
      },
      setDayNight: (value) => {
        dayEnabled = value;
        if (!value) dayTime = 0.52;
      },
      setJoystick: (x, y) => {
        input.joyX = x;
        input.joyY = y;
      },
      interact: () => tryInteract(),
      sit: () => {
        sitting = true;
        const position = playerRig.group.position;
        position.set(-4.2, 0, 6.0);
        playerRig.group.rotation.y = Math.PI;
        playerHeading = Math.PI;
        velocity.set(0, 0, 0);
      },
      stand: () => {
        sitting = false;
      },
      skipIntro: () => {
        if (introActive) {
          introActive = false;
          propsRef.current.onIntro(false);
        }
      },
    };
    handleRef.current = handle;
    if (propsRef.current.engineRef) propsRef.current.engineRef.current = handle;
    handle.setLook(propsRef.current.look, propsRef.current.skin);
    propsRef.current.onIntro(introActive);

    const introKeys = [
      { pos: new THREE.Vector3(27, 21, 44), look: new THREE.Vector3(0, 2, -30) },
      { pos: new THREE.Vector3(-17, 12, 8), look: new THREE.Vector3(0, 2, -20) },
      { pos: new THREE.Vector3(7, 5.5, 22), look: new THREE.Vector3(0, 1.5, 8) },
    ];

    function updateIntro(dt: number) {
      introT += dt;
      const f = Math.min(1, introT / INTRO_LENGTH);
      const eased = f * f * (3 - 2 * f);
      const segment = Math.min(1.999, eased * 2);
      const index = Math.floor(segment);
      const local = segment - index;
      const a = introKeys[index];
      const b = introKeys[Math.min(2, index + 1)];
      camera.position.lerpVectors(a.pos, b.pos, local);
      const look = new THREE.Vector3().lerpVectors(a.look, b.look, local);
      camera.lookAt(look);
      if (f >= 1) {
        introActive = false;
        propsRef.current.onIntro(false);
      }
    }

    function updatePlayer(dt: number, time: number) {
      const active = propsRef.current.active && !propsRef.current.paused && !introActive;
      input.forward = 0;
      input.strafe = 0;
      input.run = false;
      if (active) {
        if (keys.has("w") || keys.has("arrowup")) input.forward += 1;
        if (keys.has("s") || keys.has("arrowdown")) input.forward -= 1;
        if (keys.has("a") || keys.has("arrowleft")) input.strafe -= 1;
        if (keys.has("d") || keys.has("arrowright")) input.strafe += 1;
        if (keys.has("shift")) input.run = true;
        input.forward += input.joyY;
        input.strafe += input.joyX;
        if (Math.hypot(input.joyX, input.joyY) > 0.92) input.run = true;
      }
      const mag = Math.hypot(input.forward, input.strafe);
      const clampedMag = Math.min(1, mag);
      const maxSpeed = input.run ? 7.0 : 4.2;
      const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const wish = new THREE.Vector3()
        .addScaledVector(fwd, input.forward)
        .addScaledVector(right, input.strafe);
      if (wish.lengthSq() > 0.0001) wish.normalize().multiplyScalar(clampedMag * maxSpeed);
      const accel = wish.lengthSq() > 0.01 ? 14 : 11;
      velocity.lerp(wish, Math.min(1, dt * (accel / Math.max(1, maxSpeed)) * 3.2));
      if (velocity.lengthSq() < 0.0004 && wish.lengthSq() < 0.01) velocity.set(0, 0, 0);
      const position = playerRig.group.position;
      position.addScaledVector(velocity, dt);
      resolveCollision(position, 0.45);
      playerSpeed = velocity.length();
      if (playerSpeed > 0.4) {
        const targetHeading = Math.atan2(velocity.x, velocity.z);
        let delta = targetHeading - playerHeading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        playerHeading += delta * Math.min(1, dt * 10);
        playerRig.group.rotation.y = playerHeading;
      }
      walkPhase += dt * (3.2 + playerSpeed * 1.35);
      const speedNorm = Math.min(1, playerSpeed / 7);
      if (sitting) {
        // Seated pose: hips lower, knees bent, arms relaxed.
        playerRig.hips.position.y = playerRig.baseHipY - 0.42;
        playerRig.legL.rotation.x = -1.35;
        playerRig.legR.rotation.x = -1.35;
        playerRig.kneeL.rotation.x = 1.5;
        playerRig.kneeR.rotation.x = 1.5;
        playerRig.armL.rotation.x = -0.15;
        playerRig.armR.rotation.x = -0.15;
        playerRig.elbowL.rotation.x = -0.5;
        playerRig.elbowR.rotation.x = -0.5;
        playerRig.torso.rotation.x = 0.08;
        playerRig.head.rotation.y = Math.sin(time * 0.5) * 0.15;
      } else {
        animateRig(playerRig, walkPhase, speedNorm, time);
      }
    }

    function updateCamera(dt: number) {
      if (introActive) {
        updateIntro(dt);
        return;
      }
      const playerPos = playerRig.group.position;
      camTarget.set(playerPos.x, playerPos.y + 1.65, playerPos.z);
      const horizontal = Math.cos(camPitch) * camDist;
      desiredCam.set(
        camTarget.x + Math.sin(camYaw) * horizontal,
        camTarget.y + Math.sin(camPitch) * camDist,
        camTarget.z + Math.cos(camYaw) * horizontal,
      );
      desiredCam.y = Math.max(0.7, desiredCam.y);
      // Pull the camera in when a building blocks the view.
      const steps = new THREE.Vector3().subVectors(desiredCam, camTarget);
      const length = steps.length();
      const direction = steps.normalize();
      let allowed = length;
      for (const boxCollider of colliders) {
        for (let d = length; d > 1.6; d -= 0.6) {
          const px = camTarget.x + direction.x * d;
          const pz = camTarget.z + direction.z * d;
          const py = camTarget.y + direction.y * d;
          if (py < 0.5 || py > 14) continue;
          if (px > boxCollider.minX - 0.3 && px < boxCollider.maxX + 0.3 && pz > boxCollider.minZ - 0.3 && pz < boxCollider.maxZ + 0.3) {
            allowed = Math.min(allowed, Math.max(1.8, d - 0.7));
          }
        }
      }
      desiredCam.copy(camTarget).addScaledVector(direction, allowed);
      desiredCam.y = Math.max(0.7, desiredCam.y);
      camera.position.lerp(desiredCam, Math.min(1, dt * 7));
      camera.lookAt(camTarget);
    }

    function updateTraffic(dt: number, time: number) {
      hornCooldown = Math.max(0, hornCooldown - dt);
      const playerPos = playerRig.group.position;
      vehicles.forEach((vehicle, index) => {
        if (!vehicle.group.visible) return;
        let speed = vehicle.speed;
        // Slow down when the player is directly ahead.
        const dz = (playerPos.z - vehicle.group.position.z) * vehicle.dir;
        const dx = Math.abs(playerPos.x - vehicle.lane);
        if (dz > 0 && dz < 7 && dx < 1.5) {
          speed *= 0.25;
          if (hornCooldown <= 0 && dz < 5.5) {
            hornCooldown = 7;
            propsRef.current.onToast("DANFO HORN!  ·  MIND THE ROAD");
          }
        }
        vehicle.group.position.z += vehicle.dir * speed * dt;
        if (vehicle.group.position.z > 24) vehicle.group.position.z = -100;
        if (vehicle.group.position.z < -102) vehicle.group.position.z = 22;
        for (const wheel of vehicle.wheels) wheel.rotation.x += dt * speed * 2.4;
        vehicle.group.position.y = Math.abs(Math.sin(time * 7 + index * 2)) * 0.03;
        // Gentle nudge if the player stands inside the vehicle.
        const ndx = playerPos.x - vehicle.group.position.x;
        const ndz = playerPos.z - vehicle.group.position.z;
        if (Math.abs(ndx) < 1.35 && Math.abs(ndz) < (vehicle.kind === "taxi" ? 2.0 : 1.8)) {
          playerPos.x += (ndx >= 0 ? 1 : -1) * dt * 3.2;
          playerPos.z += (ndz >= 0 ? 1 : -1) * dt * 1.4;
          resolveCollision(playerPos, 0.45);
        }
      });
    }

    function updatePedestrians(dt: number, time: number) {
      const playerPos = playerRig.group.position;
      for (const ped of pedestrians) {
        if (!ped.rig.group.visible) continue;
        const dist = playerPos.distanceTo(ped.rig.group.position);
        if (!ped.greeted && dist < 2.6) {
          ped.greeted = true;
          propsRef.current.onNpcGreet(ped.name, NPC_GREETINGS[Math.floor(Math.random() * NPC_GREETINGS.length)]);
        }
        if (ped.trader) {
          const near = dist < 4.5;
          animateRig(ped.rig, 0, 0, time, near);
          ped.rig.group.rotation.y += ((near ? 0.2 : 0) - ped.rig.group.rotation.y) * Math.min(1, dt * 3);
          continue;
        }
        ped.z += ped.dir * ped.speed * dt;
        if (ped.z > 15) {
          ped.z = 15;
          ped.dir = -1;
        }
        if (ped.z < -90) {
          ped.z = -90;
          ped.dir = 1;
        }
        ped.phase += dt * (2.4 + ped.speed * 1.6);
        ped.rig.group.position.set(ped.x, 0.14, ped.z);
        const targetRot = ped.dir > 0 ? 0 : Math.PI;
        let delta = targetRot - ped.rig.group.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        ped.rig.group.rotation.y += delta * Math.min(1, dt * 6);
        animateRig(ped.rig, ped.phase, ped.speed / 4, time);
        // Keep pedestrians out of the player's space.
        const dx = ped.rig.group.position.x - playerPos.x;
        const dz = ped.rig.group.position.z - playerPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 0.64 && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          ped.rig.group.position.x += (dx / dist) * dt * 1.6;
          ped.x = ped.rig.group.position.x;
        }
      }
    }

    function updatePickups(time: number) {
      const playerPos = playerRig.group.position;
      for (const pickup of pickups) {
        if (pickup.taken) {
          if (time > pickup.respawnAt) {
            pickup.taken = false;
            pickup.group.visible = true;
          }
          continue;
        }
        pickup.group.rotation.y = time * 1.4 + pickup.spin;
        pickup.group.position.y = 0.16 + Math.sin(time * 2.2 + pickup.spin) * 0.08;
        const dx = playerPos.x - pickup.x;
        const dz = playerPos.z - pickup.z;
        if (dx * dx + dz * dz < 1.7) {
          pickup.taken = true;
          pickup.group.visible = false;
          pickup.respawnAt = time + 26;
          combo = time - lastPickupAt < 2.5 ? combo + 1 : 1;
          lastPickupAt = time;
          const reward = pickup.kind === "parcel" ? 250 : 100 + (combo > 0 && combo % 4 === 0 ? 50 : 0);
          burst(pickup.group.position, pickup.kind === "parcel" ? "#78e2bd" : "#ffd47a", pickup.kind === "parcel" ? 16 : 11);
          propsRef.current.onCollect(reward, pickup.kind, combo);
          if ("vibrate" in navigator && navigator.vibrate) navigator.vibrate(pickup.kind === "parcel" ? 22 : 10);
        }
      }
    }

    function updateInteractables(time: number) {
      const playerPos = playerRig.group.position;
      let best: string | null = null;
      let bestDist = Infinity;
      INTERACTABLES.forEach((spot, index) => {
        const ring = ringMeshes[index];
        const diamond = diamondMeshes[index];
        const pulse = 1 + Math.sin(time * 2.4 + index) * 0.08;
        ring.scale.set(pulse, pulse, 1);
        diamond.rotation.y = time * 1.8 + index;
        diamond.position.y = 2.6 + Math.sin(time * 2 + index * 1.3) * 0.18;
        const dx = playerPos.x - spot.x;
        const dz = playerPos.z - spot.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < spot.radius && dist < bestDist) {
          best = spot.id;
          bestDist = dist;
        }
      });
      if (best !== nearby) {
        nearby = best;
        propsRef.current.onNearby(nearby);
        if (nearby && "vibrate" in navigator && navigator.vibrate) navigator.vibrate(8);
      }
    }

    function updateDayNight(dt: number, time: number) {
      if (dayEnabled) {
        dayTime = (dayTime + dt / DAY_LENGTH) % 1;
      }
      const sample = sampleDay(dayTime);
      const tint = districtTint[currentDistrict] ?? districtTint.yaba;
      (scene.background as THREE.Color).copy(sample.sky).lerp(tint, 0.08);
      (scene.fog as THREE.Fog).color.copy(sample.fog).lerp(tint, 0.06);
      sun.color.copy(sample.sun);
      sun.intensity = sample.sunIntensity;
      hemi.intensity = sample.hemiIntensity;
      const angle = dayTime * Math.PI * 2 - Math.PI / 2;
      const elevation = THREE.MathUtils.degToRad(Math.max(4, sample.elevation));
      const playerPos = playerRig.group.position;
      sun.position.set(
        playerPos.x + Math.cos(angle) * 42,
        Math.sin(elevation) * 60 + 6,
        playerPos.z + Math.sin(angle) * 42,
      );
      sun.target.position.copy(playerPos);
      sun.target.updateMatrixWorld();
      const night = sample.night;
      for (const facadeMat of facadeMats) facadeMat.emissiveIntensity = night * 0.9;
      lampHeadMat.emissiveIntensity = 0.5 + night * 2.4;
      for (const glow of lampGlows) glow.material.opacity = 0.18 + night * 0.65;
      for (const glow of signGlows) glow.material.opacity = night * 0.5;
      streetGlowA.intensity = night * 14;
      streetGlowB.intensity = night * 14;
      streetGlowC.intensity = night * 10;
      coneMat.opacity = night * 0.3;
      starMat.opacity = night * 0.9;
      moon.material.opacity = night * 0.85;
      if (time - lastTimeReport > 0.6) {
        lastTimeReport = time;
        propsRef.current.onTime(sample.label, night > 0.5, dayTime);
      }
    }

    function updateAmbient(dt: number, time: number) {
      for (const smoke of smokeSprites) {
        smoke.t += dt * 0.35;
        if (smoke.t > 1) smoke.t = 0;
        smoke.sprite.position.y = 1.2 + smoke.t * 2.2;
        smoke.sprite.position.x = grillX + Math.sin((smoke.t + time * 0.1) * 4) * 0.3;
        smoke.sprite.material.opacity = 0.22 * (1 - smoke.t);
        const scale = 0.6 + smoke.t * 1.1;
        smoke.sprite.scale.set(scale, scale, 1);
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.life -= dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.velocity.y -= 9 * dt;
        (particle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, particle.life);
        particle.mesh.rotation.x += dt * 6;
        if (particle.life <= 0) {
          scene.remove(particle.mesh);
          particle.mesh.geometry.dispose();
          (particle.mesh.material as THREE.Material).dispose();
          particles.splice(i, 1);
        }
      }
      if (rainPoints.visible) {
        const positions = rainGeo.attributes.position as THREE.BufferAttribute;
        const target = playerRig.group.position;
        for (let i = 0; i < RAIN_COUNT; i++) {
          let y = positions.getY(i) - dt * 24;
          if (y < 0) {
            y = 20;
            positions.setX(i, target.x + (Math.random() - 0.5) * 36);
            positions.setZ(i, target.z + (Math.random() - 0.5) * 36);
          }
          positions.setY(i, y);
        }
        positions.needsUpdate = true;
        roadMat.roughness += (0.32 - roadMat.roughness) * Math.min(1, dt * 2);
        roadMat.metalness += (0.22 - roadMat.metalness) * Math.min(1, dt * 2);
      } else {
        roadMat.roughness += (0.85 - roadMat.roughness) * Math.min(1, dt * 2);
        roadMat.metalness += (0.02 - roadMat.metalness) * Math.min(1, dt * 2);
      }
      if (time - lastPosReport > 0.25) {
        lastPosReport = time;
        const position = playerRig.group.position;
        const heading = ((THREE.MathUtils.radToDeg(playerHeading) % 360) + 360) % 360;
        propsRef.current.onPosition(position.x, position.z, heading);
      }
    }

    let animationId = 0;
    const animate = () => {
      if (disposed) return;
      animationId = window.requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;
      if (propsRef.current.active) {
        updatePlayer(dt, time);
        updateCamera(dt);
        updateTraffic(dt, time);
        updatePedestrians(dt, time);
        updatePickups(time);
        updateInteractables(time);
        updateDayNight(dt, time);
        updateAmbient(dt, time);
        // Skip the render while the world is paused behind a modal — the
        // intro camera flight still needs frames, everything else does not.
        if (!propsRef.current.paused || introActive) renderer.render(scene, camera);
      }
    };
    animationId = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("wheel", onWheel);
      resizeObserver.disconnect();
      handleRef.current = null;
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Sprite) {
          child.geometry?.dispose?.();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            const withMap = material as THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null };
            withMap.map?.dispose();
            withMap.emissiveMap?.dispose();
            material.dispose();
          }
        }
      });
      renderer.dispose();
    };
    // The explore world is created once; live props flow through refs and handles.
     
  }, []);

  useEffect(() => {
    handleRef.current?.setLook(look, skin);
  }, [look, skin]);
  useEffect(() => {
    handleRef.current?.setDistrict(district);
  }, [district]);
  useEffect(() => {
    handleRef.current?.setQuality(quality);
  }, [quality]);
  useEffect(() => {
    handleRef.current?.setRain(rain);
  }, [rain]);
  useEffect(() => {
    handleRef.current?.setDayNight(dayNight);
  }, [dayNight]);
  useEffect(() => {
    if (skipIntroToken > 0) {
      handleRef.current?.skipIntro();
      setIntroPlaying(false);
    }
  }, [skipIntroToken]);

  const setJoystickVisual = (dx: number, dy: number) => {
    if (joyKnobRef.current) joyKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  return (
    <div className="explore-wrap">
      <canvas ref={canvasRef} className="street-canvas explore-canvas" aria-label="Explorable 3D Lagos district" />
      {failed && (
        <div className="explore-fallback" role="alert">
          <strong>{failed}</strong>
          <span>Try the courier shifts or a device with WebGL enabled.</span>
        </div>
      )}
      <div
        ref={joyZoneRef}
        className="joystick-zone"
        aria-hidden="true"
        onPointerDown={(event) => {
          if (event.pointerType !== "touch") return;
          const zone = joyZoneRef.current;
          const base = joyBaseRef.current;
          if (!zone || !base) return;
          const rect = zone.getBoundingClientRect();
          const ox = event.clientX - rect.left;
          const oy = event.clientY - rect.top;
          joyPointer.current = { id: event.pointerId, ox, oy };
          base.style.opacity = "1";
          base.style.left = `${ox}px`;
          base.style.top = `${oy}px`;
          setJoystickVisual(0, 0);
          zone.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const pointer = joyPointer.current;
          if (!pointer || event.pointerId !== pointer.id) return;
          const zone = joyZoneRef.current;
          if (!zone) return;
          const rect = zone.getBoundingClientRect();
          const dx = event.clientX - rect.left - pointer.ox;
          const dy = event.clientY - rect.top - pointer.oy;
          const max = 46;
          const length = Math.hypot(dx, dy) || 1;
          const clamped = Math.min(length, max);
          const nx = (dx / length) * clamped;
          const ny = (dy / length) * clamped;
          setJoystickVisual(nx, ny);
          handleRef.current?.setJoystick(nx / max, -ny / max);
        }}
        onPointerUp={(event) => {
          if (joyPointer.current?.id !== event.pointerId) return;
          joyPointer.current = null;
          handleRef.current?.setJoystick(0, 0);
          setJoystickVisual(0, 0);
          if (joyBaseRef.current) joyBaseRef.current.style.opacity = "0";
        }}
        onPointerCancel={() => {
          joyPointer.current = null;
          handleRef.current?.setJoystick(0, 0);
          setJoystickVisual(0, 0);
          if (joyBaseRef.current) joyBaseRef.current.style.opacity = "0";
        }}
      >
        <div ref={joyBaseRef} className="joystick-base">
          <div ref={joyKnobRef} className="joystick-knob" />
        </div>
      </div>
      {nearbyId && !introPlaying && (
        <button
          className="explore-action-button"
          onPointerDown={(event) => {
            event.preventDefault();
            handleRef.current?.interact();
          }}
          aria-label="Interact with nearby place"
        >
          <span>E</span>
          <small>INTERACT</small>
        </button>
      )}
    </div>
  );
}
