"use client";

// The courier-shift runner, kept in its own module so three.js is loaded
// lazily (next/dynamic in the shell) instead of shipping in the landing chunk.

import { useEffect, useRef } from "react";
import * as THREE from "three";

type GameAction = { seq: number; direction: "left" | "right" | "dash" };

type GameCanvasProps = {
  running: boolean;
  resetToken: number;
  look: string;
  skin: string;
  district: string;
  action: GameAction | null;
  onCollect: (amount: number, kind: "note" | "parcel" | "dodge", combo: number) => void;
  onProgress: (elapsed: number, score: number, speed: number, dashReady: boolean, combo: number) => void;
  onEnd: (score: number, elapsed: number) => void;
  onImpact: () => void;
  onReady: () => void;
};

type EngineHandle = {
  reset: () => void;
  action: (direction: GameAction["direction"]) => void;
  setLook: (look: string, skin: string) => void;
  setDistrict: (district: string) => void;
};

type SpawnedObject = {
  group: THREE.Group;
  lane: number;
  kind: "note" | "parcel" | "danfo" | "barrier";
  resolved: boolean;
};

type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; total: number };


const PLAYER_Z = 3.25;
const LANE_GAP = 2.55;
// Keep in sync with the style panel in src/app/streetverse.tsx.
const OUTFIT_COLORS: Record<string, string> = {
  surulere: "#3c91db",
  sunset: "#f07845",
  purple: "#a27cec",
  lime: "#a4cf65",
};

function signTexture(title: string, color: string, renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 144;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = "#101726";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.fillRect(9, 9, canvas.width - 18, canvas.height - 18);
  context.fillStyle = "rgba(15,20,31,0.20)";
  context.fillRect(9, canvas.height - 37, canvas.width - 18, 28);
  context.fillStyle = "#fff8ea";
  context.font = "900 42px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(255,255,255,.2)";
  context.shadowBlur = 10;
  context.fillText(title, canvas.width / 2, canvas.height / 2 - 2, canvas.width - 36);
  context.shadowBlur = 0;
  context.fillStyle = "#ffe4b9";
  context.font = "800 13px Arial, sans-serif";
  context.letterSpacing = "4px";
  context.fillText("LAGOS · OPEN LATE", canvas.width / 2, canvas.height - 23);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}
function labelTexture(text: string, fill: string, ink: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = fill;
    context.fillRect(0, 0, 256, 128);
    context.strokeStyle = "rgba(255,255,255,.55)";
    context.lineWidth = 8;
    context.strokeRect(6, 6, 244, 116);
    context.fillStyle = ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 66px Arial, sans-serif";
    context.fillText(text, 128, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function StreetCanvas({
  running,
  resetToken,
  look,
  skin,
  district,
  action,
  onCollect,
  onProgress,
  onEnd,
  onImpact,
  onReady,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const runningRef = useRef(running);
  const callbacksRef = useRef({ onCollect, onProgress, onEnd, onImpact, onReady });
  const lastActionRef = useRef(0);
  callbacksRef.current = { onCollect, onProgress, onEnd, onImpact, onReady };

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: window.innerWidth > 760,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      });
    } catch (error) {
      console.error("STREETVERSE could not create a WebGL renderer.", error);
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.65));
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#171b2a");
    scene.fog = new THREE.Fog("#171b2a", 43, 112);
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 145);
    camera.position.set(0, 8.1, 11.8);
    camera.lookAt(0, 1.0, -7.8);

    const hemi = new THREE.HemisphereLight(0xc5d6f6, 0x5c3d31, 2.05);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd4a6, 3.1);
    sun.position.set(-8, 14, 8);
    scene.add(sun);
    const skylineGlow = new THREE.PointLight(0xff9159, 23, 55, 2);
    skylineGlow.position.set(2.8, 8.5, -34);
    scene.add(skylineGlow);
    const coolFill = new THREE.PointLight(0x6687ff, 12, 33, 2);
    coolFill.position.set(-8, 4.5, -18);
    scene.add(coolFill);

    const mat = (color: number | string, options: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...options });
    const box = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.Material,
      rotation?: [number, number, number],
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      if (rotation) mesh.rotation.set(...rotation);
      parent.add(mesh);
      return mesh;
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 155), mat("#292b30", { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.17, -45);
    scene.add(ground);
    const road = new THREE.Mesh(new THREE.BoxGeometry(9.55, 0.18, 145), mat("#303238", { roughness: 0.94 }));
    road.position.set(0, -0.04, -47);
    scene.add(road);
    const roadEdgeMaterial = mat("#ead49e", { roughness: 0.8 });
    box(scene, [0.12, 0.12, 145], [-4.55, 0.07, -47], roadEdgeMaterial);
    box(scene, [0.12, 0.12, 145], [4.55, 0.07, -47], roadEdgeMaterial);
    const pavement = mat("#58534d", { roughness: 1 });
    const curb = mat("#94816c", { roughness: 0.9 });
    for (const side of [-1, 1]) {
      box(scene, [1.25, 0.24, 145], [side * 5.17, -0.04, -47], pavement);
      box(scene, [0.14, 0.27, 145], [side * 4.59, 0.055, -47], curb);
      const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 145), mat("#b5a18b"));
      gutter.position.set(side * 4.72, 0.07, -47);
      scene.add(gutter);
    }
    const dashMaterial = new THREE.MeshBasicMaterial({ color: "#d6d2bd", transparent: true, opacity: 0.54 });
    const centerMarkMaterial = new THREE.MeshBasicMaterial({ color: "#e1a64c", transparent: true, opacity: 0.92 });
    const roadDashes: THREE.Group[] = [];
    for (let index = 0; index < 18; index++) {
      const stripe = new THREE.Group();
      const z = -114 + index * 8;
      for (const x of [-1.55, 1.55]) {
        const laneDash = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.025, 2.65), dashMaterial);
        laneDash.position.set(x, 0.071, 0);
        stripe.add(laneDash);
      }
      for (const x of [-0.075, 0.075]) {
        const centerDash = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.024, 2.8), centerMarkMaterial);
        centerDash.position.set(x, 0.074, 0);
        stripe.add(centerDash);
      }
      stripe.position.z = z;
      scene.add(stripe);
      roadDashes.push(stripe);
    }

    const shopNames = ["MAMA T'S SUYA", "LASGIDI STORES", "BISI'S KITCHEN", "EKO NIGHT MART", "IJORA FRESH", "YABA RECORDS", "SWEET ZOBO", "BALOGUN TEXTILES"];
    const signColors = ["#c95840", "#bf813a", "#387e70", "#644c91", "#c56d43", "#3c718e"];
    const architecture = ["#c0a184", "#a88070", "#b19a78", "#a9a6a0", "#beaa8a", "#8f8880", "#c39a78"];
    const windows = ["#263548", "#354355", "#253849", "#3b4050"];
    const buildingGroups: THREE.Group[] = [];
    const signMaterials: THREE.MeshBasicMaterial[] = [];
    for (let section = 0; section < 12; section++) {
      const street = new THREE.Group();
      street.position.z = -110 + section * 12;
      const name = shopNames[section % shopNames.length];
      for (const side of [-1, 1]) {
        const height = 6.3 + ((section * 7 + (side > 0 ? 3 : 1)) % 5) * 1.25;
        const buildingColor = architecture[(section + (side > 0 ? 2 : 0)) % architecture.length];
        const structureMat = mat(buildingColor, { roughness: 0.95 });
        const buildingX = side * 8.35;
        box(street, [4.8, height, 9.5], [buildingX, height / 2 - 0.05, 0], structureMat);
        const frontX = side * 5.92;
        const facing = -side * Math.PI / 2;
        const floorCount = Math.floor((height - 2.5) / 1.8);
        const windowMat = mat(windows[(section + (side > 0 ? 1 : 0)) % windows.length], {
          roughness: 0.35,
          metalness: 0.11,
          emissive: section % 3 === 0 ? "#241d20" : "#111d2b",
          emissiveIntensity: 0.35,
        });
        for (let floor = 0; floor < floorCount; floor++) {
          for (const z of [-3.45, -1.15, 1.15, 3.45]) {
            const lit = (section * 3 + floor + Math.round(z)) % 8 === 0;
            const pane = box(
              street,
              [0.075, 0.68, 0.77],
              [frontX, 2.15 + floor * 1.75, z],
              lit ? mat("#e4a564", { emissive: "#ffb261", emissiveIntensity: 1.05, roughness: 0.5 }) : windowMat,
            );
            pane.rotation.y = 0;
          }
        }
        const signPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(2.85, 0.8),
          new THREE.MeshBasicMaterial({ map: signTexture(name, signColors[section % signColors.length], renderer), toneMapped: false }),
        );
        signPlane.position.set(frontX - side * 0.045, 1.57, 0);
        signPlane.rotation.y = facing;
        street.add(signPlane);
        const signBacking = box(street, [0.13, 0.91, 3.02], [frontX, 1.57, 0], mat("#142033", { roughness: 0.7 }));
        signBacking.rotation.y = 0;
        const awningColors = ["#cb513f", "#e3a644", "#43947f", "#5c68aa", "#d67450"];
        if (section % 2 === (side > 0 ? 0 : 1)) {
          const stallX = side * 5.44;
          const stallMat = mat("#674b3f", { roughness: 0.95 });
          box(street, [0.86, 1.13, 2.15], [stallX, 0.64, -4.4], stallMat);
          box(street, [1.08, 0.18, 2.54], [stallX, 1.35, -4.4], mat(awningColors[section % awningColors.length]));
          box(street, [0.08, 0.56, 2.17], [stallX - side * 0.45, 0.58, -4.4], mat("#d6b58f", { roughness: 0.8 }));
          for (const z of [-5.21, -3.62]) {
            const stallLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.35, 6), mat("#8e6549"));
            stallLeg.position.set(stallX + side * 0.39, 0.71, z);
            street.add(stallLeg);
          }
        }
        if (section % 2 === 0) {
          const poleX = side * 5.72;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.09, 3.65, 7), mat("#353941", { metalness: 0.32, roughness: 0.72 }));
          pole.position.set(poleX, 1.78, 3.4);
          street.add(pole);
          box(street, [0.58, 0.13, 0.15], [poleX - side * 0.19, 3.51, 3.4], mat("#3e4249", { metalness: 0.2 }));
          const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.12, 0.28),
            mat("#ffcf7b", { emissive: "#ffad55", emissiveIntensity: 2.1, roughness: 0.25 }),
          );
          lamp.position.set(poleX - side * 0.31, 3.43, 3.4);
          street.add(lamp);
        }
        if ((section + (side > 0 ? 1 : 0)) % 3 === 0) {
          const treeX = side * 11.2;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.27, 3.0, 7), mat("#77513b"));
          trunk.position.set(treeX, 1.45, -2.4);
          street.add(trunk);
          const crownMat = mat(section % 2 ? "#366c56" : "#427756", { roughness: 1 });
          for (let leaf = 0; leaf < 5; leaf++) {
            const palm = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.21, 5), crownMat);
            palm.position.set(treeX + Math.cos((leaf / 5) * Math.PI * 2) * 0.75, 3.1, -2.4 + Math.sin((leaf / 5) * Math.PI * 2) * 0.75);
            palm.rotation.z = Math.cos((leaf / 5) * Math.PI * 2) * 0.48;
            palm.rotation.x = Math.sin((leaf / 5) * Math.PI * 2) * 0.48;
            street.add(palm);
          }
        }
        if (section === 5 && side === 1) {
          const banner = box(street, [0.22, 0.67, 9.0], [side * 6.75, 5.6, 3.6], mat("#d3703f", { emissive: "#6f261d", emissiveIntensity: 0.24 }));
          banner.rotation.z = 0;
          const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 8.7, 5), mat("#ecd8b2"));
          thread.rotation.z = Math.PI / 2;
          thread.position.set(0, 6.35, 3.6);
          street.add(thread);
        }
      }
      scene.add(street);
      buildingGroups.push(street);
    }

    const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#090d13", transparent: true, opacity: 0.38, depthWrite: false });
    const playerShadow = new THREE.Mesh(new THREE.CircleGeometry(0.68, 24), shadowMaterial);
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.position.set(0, 0.055, PLAYER_Z);
    scene.add(playerShadow);
    const avatar = new THREE.Group();
    avatar.position.set(0, 0, PLAYER_Z);
    scene.add(avatar);
    const avatarMotion = new THREE.Group();
    avatar.add(avatarMotion);
    const skinMaterial = mat("#a76545", { roughness: 0.87 });
    const shirtMaterial = mat("#3c91db", { roughness: 0.78 });
    const trousersMaterial = mat("#202a3e", { roughness: 0.9 });
    const shoeMaterial = mat("#e8b271", { roughness: 0.7 });
    const blackMaterial = mat("#252331", { roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.82, 0.45), shirtMaterial);
    torso.position.y = 1.28;
    avatarMotion.add(torso);
    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.19, 0.39), trousersMaterial);
    waist.position.y = 0.81;
    avatarMotion.add(waist);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 14), skinMaterial);
    head.position.set(0, 2.02, 0.015);
    avatarMotion.add(head);
    const ears = new THREE.SphereGeometry(0.075, 8, 8);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(ears, skinMaterial);
      ear.position.set(side * 0.29, 2, 0.01);
      avatarMotion.add(ear);
    }
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.325, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.49), blackMaterial);
    hair.position.set(0, 2.12, -0.01);
    avatarMotion.add(hair);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#211d21" });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMaterial);
      eye.position.set(side * 0.11, 2.04, 0.29);
      avatarMotion.add(eye);
    }
    const limbs: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.2, 0.76, 0);
      avatarMotion.add(leg);
      box(leg, [0.235, 0.63, 0.28], [0, -0.3, 0], trousersMaterial);
      box(leg, [0.3, 0.17, 0.42], [0, -0.63, 0.075], shoeMaterial);
      limbs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(side * 0.48, 1.56, 0);
      avatarMotion.add(arm);
      box(arm, [0.22, 0.59, 0.27], [0, -0.29, 0], shirtMaterial, [side * 0.07, 0, side * 0.05]);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skinMaterial);
      hand.position.set(0, -0.6, 0.015);
      arm.add(hand);
      limbs.push(arm);
    }
    const emblem = new THREE.Mesh(
      new THREE.PlaneGeometry(0.37, 0.32),
      new THREE.MeshBasicMaterial({ map: labelTexture("SV", "#fff1d1", "#182233"), transparent: false, toneMapped: false }),
    );
    emblem.position.set(0, 1.33, 0.231);
    avatarMotion.add(emblem);
    const dashAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.05, 7, 28),
      new THREE.MeshBasicMaterial({ color: "#73dfff", transparent: true, opacity: 0, depthWrite: false }),
    );
    dashAura.rotation.x = Math.PI / 2;
    dashAura.position.set(0, 0.17, 0);
    avatar.add(dashAura);

    const spawned: SpawnedObject[] = [];
    const particles: Particle[] = [];
    let lane = 0;
    let laneX = 0;
    let elapsed = 0;
    let pickupScore = 0;
    let runSpeed = 17;
    let lastHud = 0;
    let nextWave = 2;
    let lastPickupAt = 0;
    let combo = 0;
    let dashReadyAt = 0;
    let dashUntil = 0;
    let runHasEnded = false;
    let lastFrame = performance.now();
    let shakeUntil = 0;
    let hudCombo = 0;
    let currentDistrict = district;
    let animationId = 0;
    let canvasReady = false;

    function disposeObject(root: THREE.Object3D) {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          const withMap = material as THREE.Material & { map?: THREE.Texture | null };
          withMap.map?.dispose();
          material.dispose();
        }
      });
    }
    function clearSpawned() {
      for (const item of spawned) {
        scene.remove(item.group);
        disposeObject(item.group);
      }
      spawned.length = 0;
      for (const particle of particles) {
        scene.remove(particle.mesh);
        disposeObject(particle.mesh);
      }
      particles.length = 0;
    }
    function burst(position: THREE.Vector3, color: string, count = 13) {
      for (let index = 0; index < count; index++) {
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.055 + Math.random() * 0.04, 0), material);
        mesh.position.copy(position);
        mesh.position.y += 0.45 + Math.random() * 0.8;
        scene.add(mesh);
        particles.push({
          mesh,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 6.2, Math.random() * 4.9 + 1.3, (Math.random() - 0.5) * 4.2),
          life: 0.72 + Math.random() * 0.5,
          total: 1.22,
        });
      }
    }
    function ringAt(parent: THREE.Group, color: number) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.54, 0.035, 7, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.095;
      parent.add(ring);
      return ring;
    }
    function spawnNote(targetLane: number, z: number, kind: "note" | "parcel" = "note") {
      const group = new THREE.Group();
      group.position.set(targetLane * LANE_GAP, 0, z);
      if (kind === "note") {
        const disk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.105, 24),
          mat("#f6bd50", { metalness: 0.55, roughness: 0.25, emissive: "#af6120", emissiveIntensity: 0.28 }),
        );
        disk.rotation.x = Math.PI / 2;
        disk.position.y = 0.91;
        group.add(disk);
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(0.45, 0.45),
          new THREE.MeshBasicMaterial({ map: labelTexture("₦", "#ffdf89", "#7a411d"), transparent: true, toneMapped: false, side: THREE.DoubleSide }),
        );
        label.position.set(0, 0.91, 0.063);
        group.add(label);
        ringAt(group, 0xffbf59);
      } else {
        const boxMat = mat("#f07c4d", { roughness: 0.62, emissive: "#783d27", emissiveIntensity: 0.21 });
        box(group, [0.7, 0.68, 0.62], [0, 0.65, 0], boxMat);
        box(group, [0.13, 0.71, 0.65], [0, 0.65, 0], mat("#f5c367"));
        box(group, [0.73, 0.13, 0.65], [0, 0.65, 0], mat("#f5c367"));
        const seal = new THREE.Mesh(
          new THREE.PlaneGeometry(0.43, 0.34),
          new THREE.MeshBasicMaterial({ map: labelTexture("S", "#fff1d2", "#bf593a"), toneMapped: false }),
        );
        seal.position.set(0, 0.65, 0.314);
        group.add(seal);
        ringAt(group, 0x83dbbd);
      }
      scene.add(group);
      spawned.push({ group, lane: targetLane, kind, resolved: false });
    }
    function spawnHazard(targetLane: number, z: number, kind: "danfo" | "barrier" = "danfo") {
      const group = new THREE.Group();
      group.position.set(targetLane * LANE_GAP, 0, z);
      if (kind === "danfo") {
        const bodyMat = mat("#e8b83b", { roughness: 0.53, metalness: 0.05 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.14, 2.24), bodyMat);
        body.position.y = 0.78;
        group.add(body);
        box(group, [1.49, 0.24, 2.28], [0, 1.41, 0], mat("#f3cc5d", { roughness: 0.55 }));
        box(group, [1.52, 0.2, 2.3], [0, 0.47, 0], mat("#30303a", { roughness: 0.58 }));
        box(group, [1.28, 0.49, 0.08], [0, 1.02, 1.14], mat("#283849", { roughness: 0.28, metalness: 0.14 }));
        box(group, [0.4, 0.17, 0.06], [0, 1.35, 1.19], mat("#f9e8bc", { roughness: 0.55 }));
        for (const side of [-1, 1]) {
          box(group, [0.31, 0.2, 0.08], [side * 0.52, 0.64, 1.16], mat("#ffbf61", { emissive: "#ff8e30", emissiveIntensity: 0.62 }));
          box(group, [0.48, 0.31, 0.09], [side * 0.49, 1.03, -0.72], mat("#293748", { roughness: 0.3 }));
          for (const zWheel of [-0.72, 0.74]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), mat("#20232a", { roughness: 0.9 }));
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(side * 0.73, 0.35, zWheel);
            group.add(wheel);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 10), mat("#9d9991", { metalness: 0.55, roughness: 0.45 }));
            hub.rotation.z = Math.PI / 2;
            hub.position.set(side * 0.745, 0.35, zWheel);
            group.add(hub);
          }
        }
        const route = new THREE.Mesh(
          new THREE.PlaneGeometry(0.82, 0.25),
          new THREE.MeshBasicMaterial({ map: labelTexture("YABA · 14", "#182536", "#f9c16b"), toneMapped: false }),
        );
        route.position.set(0, 1.19, 1.191);
        group.add(route);
      } else {
        box(group, [1.38, 0.85, 0.72], [0, 0.54, 0], mat("#de6949", { roughness: 0.72 }));
        box(group, [1.48, 0.14, 0.77], [0, 0.94, 0], mat("#f1bc64"));
        for (const side of [-1, 1]) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.83, 7), mat("#f2a258", { roughness: 0.65 }));
          cone.position.set(side * 0.9, 0.43, 0.09);
          group.add(cone);
          box(group, [0.16, 0.13, 0.72], [side * 0.9, 0.41, 0.09], mat("#fff0ca"));
        }
      }
      scene.add(group);
      spawned.push({ group, lane: targetLane, kind, resolved: false });
    }
    function setLook(nextLook: string, nextSkin: string) {
      shirtMaterial.color.set(OUTFIT_COLORS[nextLook] ?? OUTFIT_COLORS.surulere);
      skinMaterial.color.set(nextSkin);
    }
    function setDistrict(next: string) {
      currentDistrict = next;
      const atmosphere: Record<string, string> = {
        yaba: "#171b2a",
        balogun: "#211a25",
        vi: "#1b1b31",
        lekki: "#142626",
      };
      const hue = new THREE.Color(atmosphere[currentDistrict] ?? atmosphere.yaba);
      scene.background = hue;
      (scene.fog as THREE.Fog).color.copy(hue);
    }
    function applyAction(direction: GameAction["direction"]) {
      if (!runningRef.current || runHasEnded) return;
      if (direction === "left") lane = Math.max(-1, lane - 1);
      if (direction === "right") lane = Math.min(1, lane + 1);
      if (direction === "dash") {
        const now = performance.now();
        if (now >= dashReadyAt) {
          dashUntil = now + 710;
          dashReadyAt = now + 1470;
        }
      }
    }
    function resetRun() {
      clearSpawned();
      lane = 0;
      laneX = 0;
      elapsed = 0;
      pickupScore = 0;
      runSpeed = 17;
      lastHud = 0;
      nextWave = 2.2;
      lastPickupAt = 0;
      combo = 0;
      dashReadyAt = 0;
      dashUntil = 0;
      runHasEnded = false;
      spawned.length = 0;
      avatar.position.x = 0;
      avatarMotion.position.y = 0;
      spawnNote(0, -7, "note");
      spawnNote(0, -9.2, "note");
      spawnNote(0, -11.4, "note");
      spawnNote(0, -13.6, "note");
      spawnNote(-1, -20, "parcel");
      spawnHazard(1, -23, "danfo");
      spawnHazard(-1, -34, "barrier");
      callbacksRef.current.onProgress(0, 0, 17, true, 0);
    }

    setLook(look, skin);
    setDistrict(district);
    engineRef.current = { reset: resetRun, action: applyAction, setLook, setDistrict };
    resetRun();

    function resize() {
      const parent = canvasRef.current?.parentElement;
      if (!parent || disposed) return;
      const width = Math.max(1, parent.clientWidth);
      const height = Math.max(1, parent.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!canvasReady) {
        canvasReady = true;
        callbacksRef.current.onReady();
      }
    }
    let disposed = false;
    const resizeObserver = new ResizeObserver(resize);
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
    resize();
    window.addEventListener("resize", resize);

    function updateSpawned(delta: number, now: number) {
      for (let index = spawned.length - 1; index >= 0; index--) {
        const object = spawned[index];
        object.group.position.z += runSpeed * delta;
        if (!object.resolved && object.kind !== "danfo" && object.kind !== "barrier" && Math.abs(object.group.position.z - PLAYER_Z) < 0.85 && object.lane === lane) {
          object.resolved = true;
          const pickupKind = object.kind;
          const timeSinceLast = now - lastPickupAt;
          combo = timeSinceLast < 1500 ? combo + 1 : 1;
          lastPickupAt = now;
          const isParcel = pickupKind === "parcel";
          const reward = isParcel ? 250 : 100 + (combo > 0 && combo % 4 === 0 ? 50 : 0);
          pickupScore += isParcel ? 490 : 270;
          burst(object.group.position, isParcel ? "#78e2bd" : "#ffd47a", isParcel ? 18 : 13);
          callbacksRef.current.onCollect(reward, pickupKind, combo);
          if (navigator.vibrate) navigator.vibrate(isParcel ? 22 : 12);
          scene.remove(object.group);
          disposeObject(object.group);
          spawned.splice(index, 1);
          continue;
        }
        if (!object.resolved && (object.kind === "danfo" || object.kind === "barrier") && object.lane === lane && object.group.position.z >= PLAYER_Z - 0.65 && object.group.position.z < PLAYER_Z + 0.38) {
          if (now < dashUntil) {
            object.resolved = true;
            pickupScore += 360;
            burst(object.group.position, "#74d8ff", 21);
            callbacksRef.current.onCollect(50, "dodge", combo);
            continue;
          }
          runHasEnded = true;
          const finalScore = Math.floor(elapsed * 42 + pickupScore);
          callbacksRef.current.onImpact();
          if (navigator.vibrate) navigator.vibrate([70, 35, 100]);
          callbacksRef.current.onEnd(finalScore, elapsed);
          break;
        }
        if (object.group.position.z > PLAYER_Z + 4.5) {
          scene.remove(object.group);
          disposeObject(object.group);
          spawned.splice(index, 1);
        }
      }
    }

    function animate(now: number) {
      if (disposed) return;
      const delta = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      const isRunning = runningRef.current && !runHasEnded;
      if (isRunning) {
        elapsed += delta;
        runSpeed = Math.min(23.4, 17 + elapsed * 0.075);
        if (elapsed >= nextWave) {
          const eventNumber = Math.floor(elapsed / 1.62);
          const hazardLane = (eventNumber % 3) - 1;
          const safeLane = hazardLane === 0 ? 1 : 0;
          spawnHazard(hazardLane, -47 - Math.random() * 4, eventNumber % 4 === 0 ? "barrier" : "danfo");
          spawnNote(safeLane, -34 - Math.random() * 2, eventNumber % 3 === 0 ? "parcel" : "note");
          if (eventNumber % 2 === 1) spawnNote(-hazardLane, -40, "note");
          nextWave += 1.62;
        }
        updateSpawned(delta, now);
        if (now - lastHud > 125) {
          lastHud = now;
          const dashReady = now >= dashReadyAt;
          hudCombo = now - lastPickupAt < 1650 ? combo : 0;
          callbacksRef.current.onProgress(elapsed, Math.floor(elapsed * 42 + pickupScore), runSpeed, dashReady, hudCombo);
        }
        const sunlight = 0.48 + (Math.sin(elapsed * 0.018 - 0.9) + 1) * 0.23;
        sun.intensity = 2.35 + sunlight;
      }
      const scenerySpeed = isRunning ? runSpeed : runningRef.current ? 0 : 1.65;
      for (const block of buildingGroups) {
        block.position.z += scenerySpeed * delta;
        if (block.position.z > 26) block.position.z -= 144;
      }
      for (const stripe of roadDashes) {
        stripe.position.z += scenerySpeed * delta;
        if (stripe.position.z > 26) stripe.position.z -= 144;
      }
      laneX += (lane * LANE_GAP - laneX) * Math.min(1, delta * 12.5);
      avatar.position.x = laneX;
      playerShadow.position.x = laneX;
      const runnerPhase = now * 0.0138;
      const bob = isRunning ? Math.abs(Math.sin(runnerPhase)) * 0.105 : Math.sin(now * 0.0019) * 0.025;
      avatarMotion.position.y = bob;
      if (isRunning) {
        limbs[0].rotation.x = Math.sin(runnerPhase) * 0.74;
        limbs[1].rotation.x = Math.sin(runnerPhase + Math.PI) * 0.74;
        limbs[2].rotation.x = Math.sin(runnerPhase + Math.PI) * 0.61;
        limbs[3].rotation.x = Math.sin(runnerPhase) * 0.61;
        avatarMotion.rotation.z += (Math.sin(runnerPhase * 0.5) * 0.035 - avatarMotion.rotation.z) * delta * 6;
      } else {
        for (const limb of limbs) limb.rotation.x += (0 - limb.rotation.x) * Math.min(1, delta * 8);
        avatarMotion.rotation.z *= 0.9;
      }
      const dashing = now < dashUntil;
      avatarMotion.scale.y += ((dashing ? 0.78 : 1) - avatarMotion.scale.y) * Math.min(1, delta * 18);
      dashAura.material.opacity = dashing ? 0.88 : Math.max(0, dashAura.material.opacity - delta * 4);
      dashAura.scale.setScalar(dashing ? 1.12 + Math.sin(now * 0.025) * 0.06 : 1);
      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index];
        particle.life -= delta;
        particle.mesh.position.addScaledVector(particle.velocity, delta);
        particle.velocity.y -= 8.8 * delta;
        particle.velocity.multiplyScalar(1 - Math.min(0.25, delta * 0.56));
        (particle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, particle.life / particle.total);
        particle.mesh.rotation.x += delta * 6;
        particle.mesh.rotation.y += delta * 8;
        if (particle.life <= 0) {
          scene.remove(particle.mesh);
          disposeObject(particle.mesh);
          particles.splice(index, 1);
        }
      }
      camera.position.x += (laneX * 0.19 - camera.position.x) * Math.min(1, delta * 2.3);
      const inShake = now < shakeUntil;
      if (inShake) {
        camera.position.x += (Math.random() - 0.5) * 0.2;
        camera.position.y += (Math.random() - 0.5) * 0.16;
      } else {
        camera.position.y += (8.1 - camera.position.y) * Math.min(1, delta * 5);
      }
      camera.lookAt(laneX * 0.1, 1.0, -7.8);
      renderer.render(scene, camera);
      animationId = window.requestAnimationFrame(animate);
    }
    animationId = window.requestAnimationFrame(animate);
    const handles: EngineHandle = {
      reset: resetRun,
      action: applyAction,
      setLook,
      setDistrict,
    };
    engineRef.current = handles;

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      engineRef.current = null;
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            const mapped = material as THREE.Material & { map?: THREE.Texture | null };
            mapped.map?.dispose();
            material.dispose();
          }
        }
      });
      renderer.dispose();
    };
    // The scene is intentionally created once; live game callbacks are kept in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine && action && action.seq !== lastActionRef.current) {
      lastActionRef.current = action.seq;
      engine.action(action.direction);
    }
  }, [action]);
  useEffect(() => {
    if (resetToken > 0) engineRef.current?.reset();
  }, [resetToken]);
  useEffect(() => {
    engineRef.current?.setLook(look, skin);
  }, [look, skin]);
  useEffect(() => {
    engineRef.current?.setDistrict(district);
  }, [district]);

  return <canvas className="street-canvas" ref={canvasRef} aria-label="Interactive 3D Lagos street-run game" />;
}


export default StreetCanvas;
