"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildHuman, animateRig, OUTFIT_COLORS, SKIN_TONES_EXPORT, type HumanRig } from "./explore";
import { Check, RotateCw, Save, Shirt, UserRound, ZoomIn, ZoomOut } from "lucide-react";
import type { SavedLook } from "./types";

export type StudioProps = {
  skin: string;
  outfit: string;
  looks: SavedLook[];
  onEquip: (outfit: string, skin: string) => void;
  onSaveLook: (name: string, outfit: string, skin: string) => void;
  onClose: () => void;
};

const HAIR_NAMES = ["Low cut", "Natural afro", "Braided"];
const TROUSERS = ["#232c40", "#3a2f28", "#2b3a2f", "#40302a", "#2a2a2e"];

export default function CharacterStudio({ skin, outfit, looks, onEquip, onSaveLook, onClose }: StudioProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draftSkin, setDraftSkin] = useState(skin);
  const [draftOutfit, setDraftOutfit] = useState(outfit);
  const [draftHair, setDraftHair] = useState(0);
  const [draftTrousers, setDraftTrousers] = useState(TROUSERS[0]);
  const [lookName, setLookName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const rigRef = useRef<HumanRig | null>(null);
  const yawRef = useRef(0);
  const distRef = useRef(5.2);
  const draggingRef = useRef<{ id: number; x: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const isMobile = window.innerWidth <= 760;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 1.7, 5.2);
    camera.lookAt(0, 1.05, 0);

    const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x4a3a30, 1.6);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0dd, 2.4);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -2;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.1);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 40),
      new THREE.MeshStandardMaterial({ color: "#1a2230", roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.03, 8, 48),
      new THREE.MeshBasicMaterial({ color: "#f0a56a", toneMapped: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    const rig = buildHuman({ skin: draftSkin, shirt: OUTFIT_COLORS[draftOutfit] ?? "#3c91db", trousers: draftTrousers, hairStyle: draftHair });
    rig.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    scene.add(rig.group);
    rigRef.current = rig;

    const applyDraft = () => {
      const current = rigRef.current;
      if (!current) return;
      for (const m of current.skinMats) m.color.set(draftSkin);
      const shirtColor = OUTFIT_COLORS[draftOutfit] ?? "#3c91db";
      current.shirtMats[0].color.set(shirtColor);
      current.shirtMats[1].color.set(new THREE.Color(shirtColor).multiplyScalar(0.72));
    };
    applyDraftRef.current = applyDraft;

    let disposed = false;
    let animationId = 0;
    const clock = new THREE.Clock();
    const resize = () => {
      if (disposed) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const width = Math.max(1, parent.clientWidth);
      const height = Math.max(1, parent.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resize();

    const animate = () => {
      if (disposed) return;
      animationId = window.requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const current = rigRef.current;
      if (current) {
        animateRig(current, t * 2.2, 0, t);
        current.group.rotation.y = yawRef.current;
      }
      const targetDist = distRef.current;
      camera.position.x += (Math.sin(yawRef.current) * 0 - camera.position.x) * 0;
      camera.position.z += (targetDist - camera.position.z) * Math.min(1, dt * 6);
      camera.lookAt(0, 1.05, 0);
      renderer.render(scene, camera);
    };
    animationId = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationId);
      ro.disconnect();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            const withMap = m as THREE.Material & { map?: THREE.Texture | null };
            withMap.map?.dispose();
            m.dispose();
          }
        }
      });
      renderer.dispose();
    };
    // Studio scene is created once; drafts flow through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyDraftRef = useRef<() => void>(() => {});
  useEffect(() => {
    applyDraftRef.current();
  }, [draftSkin, draftOutfit, draftTrousers]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = { id: event.pointerId, x: event.clientX };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    drag.x = event.clientX;
    yawRef.current += dx * 0.012;
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current?.id === event.pointerId) draggingRef.current = null;
  };

  const saveLook = () => {
    const name = lookName.trim() || `Look ${looks.length + 1}`;
    onSaveLook(name, draftOutfit, draftSkin);
    setLookName("");
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const OUTFIT_OPTIONS = [
    { id: "surulere", name: "Surulere Blue" },
    { id: "sunset", name: "Eko Sunset" },
    { id: "purple", name: "Yaba Afterdark" },
    { id: "lime", name: "Lekki Lime" },
  ];

  return (
    <div className="studio-overlay" role="dialog" aria-label="Character studio">
      <div className="studio-card">
        <div className="studio-head">
          <div className="studio-title">
            <span className="studio-icon"><UserRound size={17} /></span>
            <div>
              <span>IDENTITY</span>
              <h2>Character Studio</h2>
            </div>
          </div>
          <button className="studio-close" onClick={onClose} aria-label="Close studio"><RotateCw size={0} /><span>DONE</span></button>
        </div>

        <div className="studio-body">
          <div
            className="studio-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} className="studio-canvas" aria-label="3D character preview" />
            <div className="studio-stage-hint"><RotateCw size={12} /> DRAG TO ROTATE</div>
            <div className="studio-zoom">
              <button onClick={() => { distRef.current = Math.max(3.4, distRef.current - 0.5); }} aria-label="Zoom in"><ZoomIn size={15} /></button>
              <button onClick={() => { distRef.current = Math.min(7.5, distRef.current + 0.5); }} aria-label="Zoom out"><ZoomOut size={15} /></button>
            </div>
          </div>

          <div className="studio-controls">
            <div className="studio-section">
              <span className="studio-label"><Shirt size={13} /> OUTFIT</span>
              <div className="studio-outfits">
                {OUTFIT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={`studio-outfit ${draftOutfit === option.id ? "studio-outfit-active" : ""}`}
                    onClick={() => setDraftOutfit(option.id)}
                  >
                    <i style={{ background: OUTFIT_COLORS[option.id] }} />
                    <span>{option.name}</span>
                    {draftOutfit === option.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-section">
              <span className="studio-label"><UserRound size={13} /> SKIN TONE</span>
              <div className="studio-swatches">
                {SKIN_TONES_EXPORT.map((tone) => (
                  <button
                    key={tone}
                    className={`studio-swatch ${draftSkin === tone ? "studio-swatch-active" : ""}`}
                    style={{ background: tone }}
                    onClick={() => setDraftSkin(tone)}
                    aria-label={`Skin tone ${tone}`}
                  >
                    {draftSkin === tone && <Check size={13} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-section">
              <span className="studio-label"><UserRound size={13} /> HAIRSTYLE</span>
              <div className="studio-hair">
                {HAIR_NAMES.map((name, index) => (
                  <button
                    key={name}
                    className={`studio-hair-btn ${draftHair === index ? "studio-hair-active" : ""}`}
                    onClick={() => setDraftHair(index)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-section">
              <span className="studio-label"><Shirt size={13} /> TROUSERS</span>
              <div className="studio-swatches">
                {TROUSERS.map((tone) => (
                  <button
                    key={tone}
                    className={`studio-swatch ${draftTrousers === tone ? "studio-swatch-active" : ""}`}
                    style={{ background: tone }}
                    onClick={() => setDraftTrousers(tone)}
                    aria-label={`Trouser colour ${tone}`}
                  >
                    {draftTrousers === tone && <Check size={13} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-actions">
              <button className="studio-equip" onClick={() => onEquip(draftOutfit, draftSkin)}>
                <Check size={15} /> WEAR THIS LOOK
              </button>
              <div className="studio-save-row">
                <input
                  value={lookName}
                  onChange={(event) => setLookName(event.target.value)}
                  placeholder="Name this look…"
                  maxLength={18}
                  aria-label="Look name"
                />
                <button className="studio-save" onClick={saveLook}><Save size={14} /> SAVE</button>
              </div>
              {savedFlash && <span className="studio-flash">Look saved to your profile</span>}
            </div>

            {looks.length > 0 && (
              <div className="studio-saved">
                <span className="studio-label">SAVED LOOKS</span>
                {looks.map((look) => (
                  <button
                    key={look.id}
                    className="studio-saved-look"
                    onClick={() => onEquip(look.outfit, look.skin)}
                  >
                    <i style={{ background: OUTFIT_COLORS[look.outfit] ?? "#3c91db" }} />
                    <span>{look.name}</span>
                    <small>{look.skin}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
