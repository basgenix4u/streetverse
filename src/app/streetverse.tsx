"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import dynamic from "next/dynamic";
import type { ExploreQuality, EngineHandle as ExploreEngine } from "@/game/explore";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Award,
  Banknote,
  Bike,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CloudRain,
  Coins,
  Compass,
  Crown,
  Flame,
  Footprints,
  Gift,
  Gauge,
  Home,
  Joystick,
  KeyRound,
  Landmark,
  Map,
  MapPin,
  Moon,
  Navigation,
  PackageCheck,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Shirt,
  SkipForward,
  Sparkles,
  Star,
  Store,
  Sun,
  Target,
  Trophy,
  UserRound,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_EXTRAS,
  makeNotification,
  reputationTier,
  type GameNotification,
  type PlayerExtras,
  type SavedLook,
} from "@/game/types";

// three.js is heavy (~650 KB) — the game canvases load lazily so the shell
// hydrates fast and the 3D code only downloads when a game mode mounts.
const ExploreCanvas = dynamic(() => import("@/game/explore"), { ssr: false });
const StreetCanvas = dynamic(() => import("@/game/shift"), { ssr: false });

type GameMode = "ready" | "running" | "paused" | "over";
type AppMode = "explore" | "shift";
type ExplorePosition = { x: number; z: number; heading: number };
type ViewName = "city" | "hustle" | "wallet" | "map" | "style" | "home" | "garage";
type GameAction = { seq: number; direction: "left" | "right" | "dash" };
type Transaction = { id: string; label: string; amount: number; at: number; kind: "income" | "spend" | "transfer" };
type ScoreEntry = { score: number; earned: number; date: number; seconds: number };
type PlayerSave = {
  playerName: string;
  cash: number;
  bank: number;
  best: number;
  runs: number;
  totalEarned: number;
  missionProgress: number;
  missionClaims: number;
  outfit: string;
  skin: string;
  outfits: string[];
  district: string;
  districts: string[];
  property: string;
  vehicles: string[];
  vehicle: string;
  transactions: Transaction[];
  highScores: ScoreEntry[];
};

const SAVE_KEY = "streetverse.save.v1";
const EXTRAS_KEY = "streetverse.extras.v1";
const MISSION_GOAL = 1500;
const SKINS = ["#845139", "#a76545", "#ca8a65", "#e0ae83"];
const OUTFITS = [
  { id: "surulere", name: "Surulere blue", color: "#3c91db", price: 0, owned: true },
  { id: "sunset", name: "Eko sunset", color: "#f07845", price: 1500, owned: false },
  { id: "purple", name: "Yaba afterdark", color: "#a27cec", price: 2600, owned: false },
  { id: "lime", name: "Lekki lime", color: "#a4cf65", price: 4200, owned: false },
];
const DISTRICTS = [
  { id: "yaba", name: "Yaba Mainland", subtitle: "The night shift starts here", price: 0, tint: "#e87d49" },
  { id: "balogun", name: "Balogun Market", subtitle: "Market lights & market moves", price: 1800, tint: "#e5ac4c" },
  { id: "vi", name: "Victoria Island", subtitle: "Glass towers. Bigger plays.", price: 4200, tint: "#8c8af2" },
  { id: "lekki", name: "Lekki Phase 1", subtitle: "Palm-lined and wide awake", price: 7000, tint: "#62c8b0" },
];
const VEHICLES = [
  { id: "on-foot", name: "Your own two feet", detail: "The original hustle. No fare, all heart.", price: 0, bonus: "Standard pickup value", icon: Footprints },
  { id: "scooter", name: "Yaba courier scooter", detail: "A little more speed for every shift.", price: 6500, bonus: "+10% run earnings", icon: Bike },
  { id: "keke", name: "Yellow Keke Royale", detail: "The king of the short cut.", price: 14500, bonus: "+20% run earnings", icon: Navigation },
];
const BASE_SAVE: PlayerSave = {
  playerName: "Jola",
  cash: 3200,
  bank: 1800,
  best: 0,
  runs: 0,
  totalEarned: 0,
  missionProgress: 0,
  missionClaims: 0,
  outfit: "surulere",
  skin: SKINS[1],
  outfits: ["surulere"],
  district: "yaba",
  districts: ["yaba"],
  property: "room",
  vehicles: ["on-foot"],
  vehicle: "on-foot",
  transactions: [],
  highScores: [],
};
const NAV_ITEMS: { id: ViewName; label: string; icon: LucideIcon }[] = [
  { id: "city", label: "City", icon: Compass },
  { id: "hustle", label: "Hustle", icon: Flame },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "map", label: "Map", icon: Map },
  { id: "style", label: "Style", icon: Shirt },
  { id: "home", label: "Home", icon: Home },
  { id: "garage", label: "Garage", icon: Bike },
];
const PANEL_TITLES: Record<ViewName, { eyebrow: string; title: string; icon: LucideIcon }> = {
  city: { eyebrow: "YOUR NEIGHBOURHOOD", title: "Tonight in Lagos", icon: Compass },
  hustle: { eyebrow: "JOBS & MISSIONS", title: "The hustle board", icon: Flame },
  wallet: { eyebrow: "POCKETS & PROGRESS", title: "Your money", icon: Wallet },
  map: { eyebrow: "FIND YOUR WAY", title: "The city map", icon: Map },
  style: { eyebrow: "MAKE IT YOURS", title: "Fit check", icon: Shirt },
  home: { eyebrow: "YOUR SAFE PLACE", title: "Home base", icon: Home },
  garage: { eyebrow: "YOUR NEXT UPGRADE", title: "The motor park", icon: Bike },
};
const VIEW_COPY: Record<ViewName, string> = {
  city: "Your next story starts around the corner.",
  hustle: "Every run starts small. Every note counts.",
  wallet: "Fictional naira, for play in STREETVERSE only.",
  map: "Pick a neighbourhood and see what is out there.",
  style: "Wear your story. Every fit starts on the street.",
  home: "A little space to recharge between shifts.",
  garage: "Earn your keys one street at a time.",
};
const INTERACT_INFO: Record<string, { title: string; hint: string; icon: LucideIcon }> = {
  suya: { title: "Mama T's Suya", hint: "Work the grill · earn ₦350", icon: Flame },
  mart: { title: "Eko Night Mart", hint: "Grab a snack · ₦150", icon: Store },
  bank: { title: "Eko Trust Bank", hint: "Open your wallet & vault", icon: Landmark },
  buspark: { title: "Yaba Bus Park", hint: "Start a courier shift", icon: Navigation },
  home: { title: "Your Room", hint: "Rest · progress auto-saves", icon: Home },
  dealer: { title: "Motor Park", hint: "Browse rides & upgrades", icon: Bike },
};

function formatMoney(value: number) {
  return `₦${Math.max(0, Math.floor(value)).toLocaleString("en-NG")}`;
}
function formatScore(value: number) {
  return Math.max(0, Math.floor(value)).toLocaleString("en-NG");
}
function formatRunTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
function formatTransactionTime(at: number) {
  try {
    return new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit" }).format(at);
  } catch {
    return "just now";
  }
}
function cleanPlayerSave(value: unknown): PlayerSave {
  if (!value || typeof value !== "object") return BASE_SAVE;
  const data = value as Partial<PlayerSave>;
  const numeric = (valueToCheck: unknown, fallback: number) =>
    typeof valueToCheck === "number" && Number.isFinite(valueToCheck) && valueToCheck >= 0 ? valueToCheck : fallback;
  const scores = Array.isArray(data.highScores)
    ? data.highScores
        .filter((entry): entry is ScoreEntry =>
          !!entry && Number.isFinite(entry.score) && Number.isFinite(entry.date),
        )
        .slice(0, 5)
    : [];
  const transactions = Array.isArray(data.transactions)
    ? data.transactions
        .filter((entry): entry is Transaction => !!entry && typeof entry.label === "string" && Number.isFinite(entry.amount))
        .slice(0, 16)
    : [];
  return {
    ...BASE_SAVE,
    ...data,
    playerName: typeof data.playerName === "string" ? data.playerName.slice(0, 16) : BASE_SAVE.playerName,
    cash: numeric(data.cash, BASE_SAVE.cash),
    bank: numeric(data.bank, BASE_SAVE.bank),
    best: numeric(data.best, 0),
    runs: numeric(data.runs, 0),
    totalEarned: numeric(data.totalEarned, 0),
    missionProgress: Math.min(MISSION_GOAL, numeric(data.missionProgress, 0)),
    missionClaims: numeric(data.missionClaims, 0),
    outfits: Array.isArray(data.outfits) ? data.outfits.filter((item): item is string => typeof item === "string") : ["surulere"],
    districts: Array.isArray(data.districts) ? data.districts.filter((item): item is string => typeof item === "string") : ["yaba"],
    vehicles: Array.isArray(data.vehicles) ? data.vehicles.filter((item): item is string => typeof item === "string") : ["on-foot"],
    transactions,
    highScores: scores,
  };
}
function makeTransaction(label: string, amount: number, kind: Transaction["kind"]): Transaction {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, label, amount, at: Date.now(), kind };
}
function cleanExtras(value: unknown): PlayerExtras {
  if (!value || typeof value !== "object") return DEFAULT_EXTRAS;
  const data = value as Partial<PlayerExtras>;
  const numeric = (check: unknown, fallback: number) =>
    typeof check === "number" && Number.isFinite(check) && check >= 0 ? check : fallback;
  const skills = data.skills && typeof data.skills === "object"
    ? { delivery: numeric(data.skills.delivery, 0), cooking: numeric(data.skills.cooking, 0), charisma: numeric(data.skills.charisma, 0), driving: numeric(data.skills.driving, 0) }
    : DEFAULT_EXTRAS.skills;
  const achievements = Array.isArray(data.achievements)
    ? DEFAULT_EXTRAS.achievements.map((def) => {
        const saved = data.achievements?.find((a) => a && a.id === def.id);
        return { ...def, unlockedAt: saved && typeof saved.unlockedAt === "number" ? saved.unlockedAt : null };
      })
    : DEFAULT_EXTRAS.achievements;
  const notifications = Array.isArray(data.notifications)
    ? data.notifications.filter((n) => n && typeof n.title === "string").slice(0, 20)
    : [];
  const friends = Array.isArray(data.friends) && data.friends.length > 0 ? data.friends : DEFAULT_EXTRAS.friends;
  const business = data.business && typeof data.business === "object"
    ? { owned: !!data.business.owned, name: typeof data.business.name === "string" ? data.business.name : "", kind: "suya-stand", stock: numeric(data.business.stock, 0), sales: numeric(data.business.sales, 0), workers: numeric(data.business.workers, 0), reputation: numeric(data.business.reputation, 0) }
    : DEFAULT_EXTRAS.business;
  const rent = data.rent && typeof data.rent === "object"
    ? { due: numeric(data.rent.due, 1200), lastPaid: numeric(data.rent.lastPaid, Date.now()) }
    : DEFAULT_EXTRAS.rent;
  const looks = Array.isArray(data.looks) ? data.looks.filter((l) => l && typeof l.id === "string").slice(0, 8) : [];
  return {
    ...DEFAULT_EXTRAS,
    ...data,
    skills,
    reputation: numeric(data.reputation, 0),
    achievements,
    notifications,
    friends,
    business,
    rent,
    looks,
    career: typeof data.career === "string" ? data.career : DEFAULT_EXTRAS.career,
    careerLevel: numeric(data.careerLevel, 1),
  };
}
function MapIllustration({ active, pos }: { active: string; pos?: ExplorePosition }) {
  const activeDistrict = DISTRICTS.find((item) => item.id === active) ?? DISTRICTS[0];
  const baseX = active === "lekki" ? 413 : active === "vi" ? 326 : active === "balogun" ? 230 : 116;
  const baseY = active === "lekki" ? 168 : active === "vi" ? 176 : active === "balogun" ? 154 : 133;
  const liveX = pos ? baseX + Math.max(-20, Math.min(20, (pos.x / 26) * 22)) : baseX;
  const liveY = pos ? baseY + Math.max(-14, Math.min(14, ((pos.z + 39) / 57) * 16)) : baseY;
  return (
    <div className="map-illustration" aria-label={`Map illustration of ${activeDistrict.name}`}>
      <svg viewBox="0 0 500 265" role="img" aria-hidden="true">
        <defs>
          <pattern id="mapDots" width="13" height="13" patternUnits="userSpaceOnUse">
            <circle cx="1.4" cy="1.4" r="0.8" fill="#64718a" opacity=".2" />
          </pattern>
        </defs>
        <rect width="500" height="265" rx="20" fill="#121b2a" />
        <rect width="500" height="265" fill="url(#mapDots)" />
        <path d="M-10 83 140 15 208 75l107-42 175 48M-15 189l115-61 81 64 98-74 226 86M176-10l26 100-21 180M381-10l-42 76 42 75-46 139" fill="none" stroke="#344459" strokeWidth="15" strokeLinejoin="round" />
        <path d="M-15 189l115-61 81 64 98-74 226 86" fill="none" stroke="#e79258" strokeWidth="3.5" strokeDasharray="7 8" />
        <path d="M-10 83 140 15 208 75l107-42 175 48M-15 189l115-61 81 64 98-74 226 86" fill="none" stroke="#91a1b7" strokeWidth="2" strokeLinejoin="round" opacity=".66" />
        <rect x="32" y="27" width="77" height="32" rx="8" fill="#1c2b3d" />
        <text x="70" y="48" fill="#dae4f0" fontSize="12" fontWeight="800" textAnchor="middle">YABA</text>
        <rect x="378" y="32" width="96" height="32" rx="8" fill="#1c2b3d" />
        <text x="426" y="53" fill="#dae4f0" fontSize="12" fontWeight="800" textAnchor="middle">IKOYI</text>
        <rect x="353" y="205" width="117" height="32" rx="8" fill="#1c2b3d" />
        <text x="411" y="226" fill="#dae4f0" fontSize="12" fontWeight="800" textAnchor="middle">VI ISLAND</text>
        <circle cx={liveX} cy={liveY} r="15" fill={activeDistrict.tint} opacity=".3" />
        <circle cx={liveX} cy={liveY} r="7" fill={activeDistrict.tint} stroke="#fff" strokeWidth="3" />
        <path d="M116 133 Q190 165 230 154 T326 176 Q365 186 413 168" fill="none" stroke="#ffbd6d" strokeWidth="2" strokeDasharray="4 8" opacity=".8" />
      </svg>
      <span className="map-live-tag"><span /> YOU ARE HERE · {activeDistrict.name.toUpperCase()}</span>
    </div>
  );
}

export default function StreetverseGame() {
  const [save, setSave] = useState<PlayerSave>(BASE_SAVE);
  const saveRef = useRef<PlayerSave>(BASE_SAVE);
  const runStatsRef = useRef({ earned: 0, pickups: 0 });
  const [hydrated, setHydrated] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>("ready");
  const [activeView, setActiveView] = useState<ViewName>("city");
  const [runToken, setRunToken] = useState(0);
  const [action, setAction] = useState<GameAction | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [score, setScore] = useState(0);
  const [runEarnings, setRunEarnings] = useState(0);
  const [speed, setSpeed] = useState(17);
  const [dashReady, setDashReady] = useState(true);
  const [combo, setCombo] = useState(0);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState("");
  const [toastKey, setToastKey] = useState(0);
  const [finalRun, setFinalRun] = useState<{ score: number; earned: number; seconds: number; bonus: number } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(BASE_SAVE.playerName);
  const [appMode, setAppMode] = useState<AppMode>("explore");
  const [nearbySpot, setNearbySpot] = useState<string | null>(null);
  const [explorePos, setExplorePos] = useState<ExplorePosition>({ x: 0, z: 14, heading: 180 });
  const [timeLabel, setTimeLabel] = useState("Golden Hour");
  const [isNight, setIsNight] = useState(false);
  const [introActive, setIntroActive] = useState(true);
  const [skipIntroToken, setSkipIntroToken] = useState(0);
  const [exploreLoaded, setExploreLoaded] = useState(false);
  const [quality, setQuality] = useState<ExploreQuality>(() =>
    typeof window !== "undefined" && window.innerWidth < 760 ? "medium" : "high",
  );
  const [rainEnabled, setRainEnabled] = useState(false);
  const [dayNightEnabled, setDayNightEnabled] = useState(true);
  const [extras, setExtras] = useState<PlayerExtras>(DEFAULT_EXTRAS);
  const extrasRef = useRef<PlayerExtras>(DEFAULT_EXTRAS);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dialogue, setDialogue] = useState<{ name: string; message: string } | null>(null);
  const [benchPrompt, setBenchPrompt] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const workCooldownRef = useRef(0);
  const explorePosRef = useRef<ExplorePosition>({ x: 0, z: 14, heading: 180 });
  const exploreEngineRef = useRef<ExploreEngine | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const loaded = cleanPlayerSave(JSON.parse(raw));
        saveRef.current = loaded;
        setSave(loaded);
        setNameDraft(loaded.playerName);
      }
      const extrasRaw = window.localStorage.getItem(EXTRAS_KEY);
      if (extrasRaw) {
        const loadedExtras = cleanExtras(JSON.parse(extrasRaw));
        extrasRef.current = loadedExtras;
        setExtras(loadedExtras);
      }
    } catch (error) {
      console.warn("Could not read the local STREETVERSE save.", error);
    }
    setHydrated(true);
  }, []);

  const updateExtras = useCallback((updater: (current: PlayerExtras) => PlayerExtras) => {
    const next = cleanExtras(updater(extrasRef.current));
    extrasRef.current = next;
    setExtras(next);
    try {
      window.localStorage.setItem(EXTRAS_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not persist the local STREETVERSE extras.", error);
    }
  }, []);

  const pushNotification = useCallback((kind: GameNotification["kind"], title: string, body: string) => {
    const notification = makeNotification(kind, title, body);
    updateExtras((current) => ({
      ...current,
      notifications: [notification, ...current.notifications].slice(0, 20),
    }));
  }, [updateExtras]);

  const addReputation = useCallback((amount: number, reason: string) => {
    const before = reputationTier(extrasRef.current.reputation).tier;
    updateExtras((current) => ({ ...current, reputation: current.reputation + amount }));
    const after = reputationTier(extrasRef.current.reputation + amount).tier;
    if (after !== before) {
      pushNotification("achievement", "Reputation up", `You are now known as ${after}. ${reason}`);
    }
  }, [updateExtras, pushNotification]);

  const unlockAchievement = useCallback((id: string) => {
    const current = extrasRef.current;
    const achievement = current.achievements.find((a) => a.id === id);
    if (!achievement || achievement.unlockedAt) return;
    updateExtras((latest) => ({
      ...latest,
      achievements: latest.achievements.map((a) => (a.id === id ? { ...a, unlockedAt: Date.now() } : a)),
    }));
    pushNotification("achievement", "Achievement unlocked", achievement.title);
  }, [updateExtras, pushNotification]);

  const addSkillXp = useCallback((skill: "delivery" | "cooking" | "charisma" | "driving", amount: number) => {
    updateExtras((current) => ({
      ...current,
      skills: { ...current.skills, [skill]: current.skills[skill] + amount },
    }));
  }, [updateExtras]);

  const updateSave = useCallback((updater: (current: PlayerSave) => PlayerSave) => {
    const next = cleanPlayerSave(updater(saveRef.current));
    saveRef.current = next;
    setSave(next);
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not persist the local STREETVERSE save.", error);
    }
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setToastKey((current) => current + 1);
  }, []);

  const beginRun = useCallback(() => {
    runStatsRef.current = { earned: 0, pickups: 0 };
    setElapsed(0);
    setScore(0);
    setRunEarnings(0);
    setSpeed(17);
    setDashReady(true);
    setCombo(0);
    setFinalRun(null);
    setRunToken((current) => current + 1);
    setAppMode("shift");
    setGameMode("running");
    setActiveView("city");
  }, []);

  const handleCollect = useCallback((baseAmount: number, kind: "note" | "parcel" | "dodge", currentCombo: number) => {
    const current = saveRef.current;
    const rideMultiplier = current.vehicle === "keke" ? 1.2 : current.vehicle === "scooter" ? 1.1 : 1;
    const amount = Math.round(baseAmount * rideMultiplier);
    const label = kind === "parcel" ? "Courier delivery" : kind === "dodge" ? "Clean dash bonus" : "Street note collected";
    runStatsRef.current = {
      earned: runStatsRef.current.earned + amount,
      pickups: runStatsRef.current.pickups + (kind === "dodge" ? 0 : 1),
    };
    setRunEarnings(runStatsRef.current.earned);
    setCombo(currentCombo);
    const transaction = makeTransaction(label, amount, "income");
    updateSave((latest) => ({
      ...latest,
      cash: latest.cash + amount,
      totalEarned: latest.totalEarned + amount,
      missionProgress: kind === "dodge" ? latest.missionProgress : Math.min(MISSION_GOAL, latest.missionProgress + amount),
      transactions: [transaction, ...latest.transactions].slice(0, 12),
    }));
    const words = kind === "parcel" ? "DELIVERY COMPLETE" : kind === "dodge" ? "CLEAN DASH" : currentCombo > 1 ? `${currentCombo} NOTE STREAK` : "NICE PICKUP";
    showToast(`${words}  ·  +${formatMoney(amount)}`);
    if (appMode === "shift") {
      addSkillXp("delivery", kind === "dodge" ? 0 : 1);
      addReputation(1, "Courier work");
      unlockAchievement("first-note");
      if (currentCombo >= 5) unlockAchievement("streak-5");
      if (saveRef.current.cash + amount >= 10000) unlockAchievement("rich-10k");
    }
  }, [showToast, updateSave, appMode, addSkillXp, addReputation, unlockAchievement]);

  const handleProgress = useCallback((nextElapsed: number, nextScore: number, nextSpeed: number, canDash: boolean, nextCombo: number) => {
    setElapsed(nextElapsed);
    setScore(nextScore);
    setSpeed(nextSpeed);
    setDashReady(canDash);
    setCombo(nextCombo);
  }, []);

  const handleRunEnd = useCallback((nextScore: number, nextElapsed: number) => {
    const runRecord = runStatsRef.current;
    const survivalBonus = nextElapsed >= 30 ? 500 : 0;
    const record: ScoreEntry = { score: nextScore, earned: runRecord.earned + survivalBonus, date: Date.now(), seconds: nextElapsed };
    updateSave((latest) => ({
      ...latest,
      cash: latest.cash + survivalBonus,
      best: Math.max(latest.best, nextScore),
      runs: latest.runs + 1,
      highScores: [record, ...latest.highScores].sort((left, right) => right.score - left.score).slice(0, 5),
      transactions: survivalBonus
        ? [makeTransaction("30-second shift bonus", survivalBonus, "income"), ...latest.transactions].slice(0, 12)
        : latest.transactions,
    }));
    if (survivalBonus) runStatsRef.current.earned += survivalBonus;
    setRunEarnings(runStatsRef.current.earned);
    setFinalRun({ score: nextScore, earned: runRecord.earned + survivalBonus, seconds: nextElapsed, bonus: survivalBonus });
    setScore(nextScore);
    setElapsed(nextElapsed);
    setGameMode("over");
    addSkillXp("delivery", 2);
    addReputation(5, "Completed a courier shift");
    unlockAchievement("shift-1");
    if (isNight) unlockAchievement("night-owl");
  }, [updateSave, addSkillXp, addReputation, unlockAchievement, isNight]);

  const impact = useCallback(() => {
    setShake(false);
    window.setTimeout(() => setShake(true), 0);
    showToast("WATCH THE DANFO!  ·  SHIFT OVER");
  }, [showToast]);

  const triggerAction = useCallback((direction: GameAction["direction"]) => {
    setAction((current) => ({ seq: (current?.seq ?? 0) + 1, direction }));
  }, []);

  useEffect(() => {
    if (appMode !== "shift" || gameMode !== "running") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (typing) return;
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w"].includes(key)) event.preventDefault();
      if (key === "arrowleft" || key === "a") triggerAction("left");
      if (key === "arrowright" || key === "d") triggerAction("right");
      if (key === "arrowup" || key === "w" || key === " ") triggerAction("dash");
      if (key === "escape" || key === "p") setGameMode("paused");
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appMode, gameMode, triggerAction]);

  useEffect(() => {
    if (appMode !== "shift" || gameMode !== "paused") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key.toLowerCase() === "p") setGameMode("running");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appMode, gameMode]);

  useEffect(() => {
    if (appMode !== "shift" || (gameMode !== "ready" && gameMode !== "over")) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === "enter" || key === "r") {
        event.preventDefault();
        beginRun();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appMode, gameMode, beginRun]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast, toastKey]);
  useEffect(() => {
    if (!shake) return;
    const timeout = window.setTimeout(() => setShake(false), 390);
    return () => window.clearTimeout(timeout);
  }, [shake]);

  const selectView = (view: ViewName) => {
    setActiveView(view);
    if (appMode === "shift" && gameMode === "running") setGameMode("paused");
  };

  const transact = (label: string, amount: number, kind: "income" | "spend" | "transfer", apply?: (current: PlayerSave) => Partial<PlayerSave>) => {
    const current = saveRef.current;
    if (kind === "spend" && current.cash < amount) {
      showToast("NOT ENOUGH POCKET MONEY  ·  GO FOR A RUN");
      return false;
    }
    const transaction = makeTransaction(label, kind === "spend" ? -amount : amount, kind);
    updateSave((latest) => ({
      ...latest,
      ...(kind === "spend" ? { cash: latest.cash - amount } : kind === "income" ? { cash: latest.cash + amount } : {}),
      ...(apply ? apply(latest) : {}),
      transactions: [transaction, ...latest.transactions].slice(0, 12),
    }));
    showToast(kind === "spend" ? `${label.toUpperCase()}  ·  −${formatMoney(amount)}` : `${label.toUpperCase()}  ·  ${formatMoney(amount)}`);
    return true;
  };

  const moveMoney = (direction: "save" | "withdraw") => {
    const current = saveRef.current;
    const amount = Math.min(500, direction === "save" ? current.cash : current.bank);
    if (!amount) {
      showToast(direction === "save" ? "YOUR POCKET IS EMPTY" : "YOUR VAULT IS EMPTY");
      return;
    }
    const transaction = makeTransaction(direction === "save" ? "Saved to the vault" : "Vault withdrawal", amount, "transfer");
    updateSave((latest) => ({
      ...latest,
      cash: direction === "save" ? latest.cash - amount : latest.cash + amount,
      bank: direction === "save" ? latest.bank + amount : latest.bank - amount,
      transactions: [transaction, ...latest.transactions].slice(0, 12),
    }));
    showToast(direction === "save" ? `SAFE IN THE VAULT  ·  ${formatMoney(amount)}` : `BACK IN YOUR POCKET  ·  ${formatMoney(amount)}`);
  };

  const claimMission = () => {
    const current = saveRef.current;
    if (current.missionProgress < MISSION_GOAL) return;
    transact("Hustle board reward", 600, "income", (latest) => ({
      missionProgress: 0,
      missionClaims: latest.missionClaims + 1,
    }));
  };

  const selectDistrict = (id: string) => {
    const destination = DISTRICTS.find((item) => item.id === id);
    if (!destination) return;
    const current = saveRef.current;
    if (current.districts.includes(id)) {
      updateSave((latest) => ({ ...latest, district: id }));
      showToast(`ROUTE SET  ·  ${destination.name.toUpperCase()}`);
      return;
    }
    const bought = transact(`Route pass · ${destination.name}`, destination.price, "spend", (latest) => ({
      districts: [...latest.districts, id],
      district: id,
    }));
    if (bought) showToast(`DISTRICT UNLOCKED  ·  ${destination.name.toUpperCase()}`);
  };

  const buyOutfit = (id: string) => {
    const outfit = OUTFITS.find((item) => item.id === id);
    if (!outfit) return;
    if (saveRef.current.outfits.includes(id)) {
      updateSave((latest) => ({ ...latest, outfit: id }));
      showToast(`FIT EQUIPPED  ·  ${outfit.name.toUpperCase()}`);
      return;
    }
    const bought = transact(`Fresh fit · ${outfit.name}`, outfit.price, "spend", (latest) => ({
      outfits: [...latest.outfits, id],
      outfit: id,
    }));
    if (bought) showToast(`FRESH FIT UNLOCKED  ·  ${outfit.name.toUpperCase()}`);
  };

  const buyVehicle = (id: string) => {
    const vehicle = VEHICLES.find((item) => item.id === id);
    if (!vehicle) return;
    if (saveRef.current.vehicles.includes(id)) {
      updateSave((latest) => ({ ...latest, vehicle: id }));
      showToast(`RIDE SELECTED  ·  ${vehicle.name.toUpperCase()}`);
      return;
    }
    const bought = transact(`Ride upgrade · ${vehicle.name}`, vehicle.price, "spend", (latest) => ({
      vehicles: [...latest.vehicles, id],
      vehicle: id,
    }));
    if (bought) showToast(`NEW RIDE IN THE GARAGE  ·  ${vehicle.name.toUpperCase()}`);
  };

  const buyHome = () => {
    transact("Surulere starter flat", 18000, "spend", () => ({ property: "flat" }));
  };

  const editName = () => {
    const nextName = nameDraft.trim().slice(0, 16) || "Jola";
    updateSave((latest) => ({ ...latest, playerName: nextName }));
    setNameDraft(nextName);
    setEditingName(false);
    showToast(`THAT'S YOU, ${nextName.toUpperCase()}`);
  };

  const goExplore = useCallback(() => {
    setAppMode("explore");
    setGameMode("ready");
    setActiveView("city");
  }, []);

  const handleNpcGreet = useCallback((name: string, message: string) => {
    setDialogue({ name, message });
    addSkillXp("charisma", 1);
    addReputation(2, `You chatted with ${name}.`);
    unlockAchievement("social");
  }, [addSkillXp, addReputation, unlockAchievement]);

  const handleBenchNearby = useCallback((id: string | null) => {
    setNearbySpot(id);
    setBenchPrompt(id === "bench");
  }, []);

  const handleSit = useCallback(() => {
    exploreEngineRef.current?.sit();
    showToast("TAKE A SEAT  ·  ENJOY THE VIEW");
  }, [showToast]);

  const handleStand = useCallback(() => {
    exploreEngineRef.current?.stand();
  }, []);

  const handleExploreInteract = useCallback((id: string) => {
    const now = Date.now();
    if (id === "suya") {
      if (now - workCooldownRef.current < 15000) {
        showToast("CATCH YOUR BREATH  ·  THE GRILL NEEDS A MINUTE");
        return;
      }
      workCooldownRef.current = now;
      const transaction = makeTransaction("Suya grill shift", 350, "income");
      updateSave((latest) => ({
        ...latest,
        cash: latest.cash + 350,
        totalEarned: latest.totalEarned + 350,
        missionProgress: Math.min(MISSION_GOAL, latest.missionProgress + 350),
        transactions: [transaction, ...latest.transactions].slice(0, 12),
      }));
      showToast("SUYA SHIFT COMPLETE  ·  +₦350");
      return;
    }
    if (id === "mart") {
      if (saveRef.current.cash < 150) {
        showToast("NOT ENOUGH POCKET MONEY  ·  GRAB SOME NOTES FIRST");
        return;
      }
      const transaction = makeTransaction("Eko Night Mart snack", -150, "spend");
      updateSave((latest) => ({
        ...latest,
        cash: latest.cash - 150,
        transactions: [transaction, ...latest.transactions].slice(0, 12),
      }));
      showToast("TASTY!  ·  −₦150");
      return;
    }
    if (id === "buspark") {
      showToast("SHIFT BOARD  ·  GOOD LUCK OUT THERE");
      beginRun();
      return;
    }
    if (id === "bank") {
      selectView("wallet");
      return;
    }
    if (id === "home") {
      selectView("home");
      showToast("HOME SWEET HOME  ·  PROGRESS SAVED");
      return;
    }
    if (id === "dealer") {
      selectView("garage");
      return;
    }
    if (id === "bench") {
      handleSit();
    }
  }, [beginRun, showToast, updateSave, selectView, handleSit]);

  const handleExplorePosition = useCallback((x: number, z: number, heading: number) => {
    const rounded = { x: Math.round(x), z: Math.round(z), heading: Math.round(heading) };
    explorePosRef.current = rounded;
    setExplorePos(rounded);
  }, []);

  const handleExploreTime = useCallback((label: string, night: boolean) => {
    setTimeLabel(label);
    setIsNight(night);
  }, []);

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName !== "CANVAS") return;
    if (event.pointerType === "touch") pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };
  const onStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || appMode !== "shift" || gameMode !== "running") return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > 32 && Math.abs(deltaX) > Math.abs(deltaY)) triggerAction(deltaX < 0 ? "left" : "right");
    else if (deltaY < -34) triggerAction("dash");
  };

  const unlockedDistrict = DISTRICTS.find((item) => item.id === save.district) ?? DISTRICTS[0];
  const panel = PANEL_TITLES[activeView];
  const missionRatio = Math.min(100, (save.missionProgress / MISSION_GOAL) * 100);
  const currentOutfit = OUTFITS.find((item) => item.id === save.outfit) ?? OUTFITS[0];
  const recentScores = save.highScores.slice(0, 3);
  const activeVehicle = VEHICLES.find((item) => item.id === save.vehicle) ?? VEHICLES[0];
  const firstName = save.playerName.split(" ")[0] || "Player";

  return (
    <div className="streetverse-app">
      <header className="topbar">
        <div className="brand-lockup" aria-label="STREETVERSE">
          <div className="brand-mark"><span>S</span><span>V</span><i /></div>
          <div className="brand-wordmark"><strong>STREET<span>VERSE</span></strong><small>YOUR CITY. YOUR STORY.</small></div>
        </div>
        <div className="topbar-location">
          <span className="crumb-kicker">NIGERIA</span><span className="crumb-divider">/</span>
          <span className="topbar-district">{unlockedDistrict.name}</span>
          <span className="live-dot" />
        </div>
        <div className="topbar-actions">
          <div className="weather-chip">{isNight ? <Moon size={15} strokeWidth={1.8} /> : <Sun size={15} strokeWidth={1.8} />}<span>22°</span><i>{rainEnabled ? "RAIN" : timeLabel.toUpperCase()}</i></div>
          <button className="top-cash" onClick={() => selectView("wallet")} aria-label="Open your wallet">
            <span className="cash-icon"><Wallet size={17} /></span>
            <span><small>POCKET MONEY</small><strong>{formatMoney(save.cash)}</strong></span>
            <ChevronRight size={14} className="cash-chevron" />
          </button>
          <button className="player-chip" onClick={() => selectView("city")} title="Your player profile">
            <span className="player-avatar-mini" style={{ background: `linear-gradient(145deg, ${currentOutfit.color}, #192b42)` }}>{firstName.charAt(0).toUpperCase()}</span>
            <span className="player-chip-copy"><small>LEVEL {String(Math.min(30, Math.floor(save.runs / 3) + 1)).padStart(2, "0")}</small><strong>{save.playerName}</strong></span>
            <span className="online-mark" />
          </button>
        </div>
      </header>

      <div className="app-body">
        <nav className="side-rail" aria-label="Game navigation">
          <div className="rail-top-mark"><span>✳</span></div>
          <div className="rail-links">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`rail-button ${activeView === id ? "rail-button-active" : ""}`}
                onClick={() => selectView(id)}
                aria-label={label}
                title={label}
              >
                <span className="rail-icon"><Icon size={19} strokeWidth={1.85} /></span>
                <span className="rail-label">{label}</span>
                {id === "hustle" && save.missionProgress >= MISSION_GOAL && <i className="rail-dot" />}
              </button>
            ))}
          </div>
          <div className="rail-bottom">
            <span className="rail-safe-icon"><ShieldCheck size={15} /></span>
            <span>SOLO<br />SESSION</span>
          </div>
        </nav>

        <main className="game-main">
          <section className={`world-column ${shake ? "world-shake" : ""}`}>
            <div className="stage-shell" ref={stageRef} onPointerDown={onStagePointerDown} onPointerUp={onStagePointerUp}>
              {appMode === "explore" ? (
                <ExploreCanvas
                  active={appMode === "explore"}
                  paused={editingName || phoneOpen || studioOpen || profileOpen}
                  look={save.outfit}
                  skin={save.skin}
                  district={save.district}
                  quality={quality}
                  rain={rainEnabled}
                  dayNight={dayNightEnabled}
                  skipIntroToken={skipIntroToken}
                  initialPosition={explorePosRef.current}
                  onCollect={handleCollect}
                  onInteract={handleExploreInteract}
                  onNearby={handleBenchNearby}
                  onPosition={handleExplorePosition}
                  onTime={handleExploreTime}
                  onToast={showToast}
                  onNpcGreet={handleNpcGreet}
                  engineRef={exploreEngineRef}
                  onIntro={setIntroActive}
                  onReady={() => setExploreLoaded(true)}
                  onError={showToast}
                />
              ) : (
                <StreetCanvas
                  running={gameMode === "running"}
                  resetToken={runToken}
                  look={save.outfit}
                  skin={save.skin}
                  district={save.district}
                  action={action}
                  onCollect={handleCollect}
                  onProgress={handleProgress}
                  onEnd={handleRunEnd}
                  onImpact={impact}
                  onReady={() => setSceneLoaded(true)}
                />
              )}
              <div className="stage-vignette" />
              <div className="stage-topline">
                <div className="world-live-pill"><span className="live-dot" /> <span>STREETVERSE <b>LIVE</b></span><span className="pill-divider" /> <MapPin size={12} />{unlockedDistrict.name}</div>
                {appMode === "shift" && gameMode === "running" ? (
                  <button className="pause-button" onClick={() => setGameMode("paused")} aria-label="Pause game" title="Pause · Esc">
                    <Pause size={17} fill="currentColor" /> <span>PAUSE</span>
                  </button>
                ) : appMode === "explore" ? (
                  <div className="explore-topline-right">
                    <div className="weather-stage"><span>{timeLabel.toUpperCase()}</span><i />{isNight ? <Moon size={13} /> : <Sun size={13} />}{rainEnabled ? " RAIN" : isNight ? " NIGHT" : " DAY"}</div>
                    {!introActive && (
                      <button className="pause-button shift-shortcut" onClick={beginRun} aria-label="Start courier shift" title="Start a courier shift">
                        <Zap size={14} fill="currentColor" /> <span>SHIFT</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="weather-stage"><span>18:42</span><i /><Sun size={13} /> GOLDEN HOUR</div>
                )}
              </div>

              {appMode === "shift" && (gameMode === "running" || gameMode === "paused" || gameMode === "over") && (
                <div className="run-hud">
                  <div className="hud-score-card">
                    <div className="hud-score-label"><span className="hud-pulse" /> LIVE SHIFT <span className="hud-separator">·</span> {formatRunTime(elapsed)}</div>
                    <strong key={`score-${score}`} className="score-number">{formatScore(score)}</strong>
                    <span className="hud-score-foot"><Trophy size={12} /> BEST {formatScore(Math.max(save.best, score))}</span>
                  </div>
                  <div className="hud-right-stats">
                    <div className="hud-cash-chip"><CircleDollarSign size={16} /><span><small>IN THIS RUN</small><b>{formatMoney(runEarnings)}</b></span></div>
                    {combo > 1 && gameMode === "running" && <div className="combo-chip"><Zap size={13} fill="currentColor" /> {combo}× STREAK</div>}
                  </div>
                </div>
              )}

              {appMode === "shift" && gameMode === "running" && (
                <div className="stage-objective">
                  <span className="objective-icon"><Target size={15} /></span>
                  <div><b>COLLECT THE NOTES. MISS THE DANFOS.</b><span>₦100 pocketed · deliveries pay ₦250</span></div>
                  <span className="run-speed"><Gauge size={13} /> {Math.round(speed * 3.6)} <small>KM/H</small></span>
                </div>
              )}

              {appMode === "explore" && !introActive && (
                <div className="stage-objective explore-objective">
                  <span className="objective-icon"><Compass size={15} /></span>
                  <div><b>WALK THE CITY · FOLLOW THE GOLD MARKERS</b><span>WASD / stick to move · drag to look · E to interact</span></div>
                  {combo > 1 && <span className="combo-chip explore-combo"><Zap size={13} fill="currentColor" /> {combo}×</span>}
                </div>
              )}

              {appMode === "explore" && !introActive && (
                <div className="keyboard-hint explore-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>MOVE</span><i /><kbd>E</kbd><span>INTERACT</span><i /><kbd>SHIFT</kbd><span>RUN</span></div>
              )}

              {appMode === "shift" && gameMode === "running" && (
                <div className="touch-controls" aria-label="Touch game controls">
                  <button className="touch-control" onPointerDown={(event) => { event.preventDefault(); triggerAction("left"); }} aria-label="Move left"><ArrowLeft size={27} /></button>
                  <button className={`touch-control touch-dash ${dashReady ? "dash-available" : ""}`} onPointerDown={(event) => { event.preventDefault(); triggerAction("dash"); }} aria-label="Dash through traffic">
                    <Zap size={22} fill={dashReady ? "currentColor" : "none"} /><span>DASH</span>
                  </button>
                  <button className="touch-control" onPointerDown={(event) => { event.preventDefault(); triggerAction("right"); }} aria-label="Move right"><ArrowRight size={27} /></button>
                </div>
              )}

              {appMode === "shift" && gameMode === "running" && (
                <div className="keyboard-hint"><kbd>A</kbd><kbd>D</kbd><span>SWITCH LANES</span><i /> <kbd>SPACE</kbd><span>SLIDE</span></div>
              )}

              {((appMode === "shift" && !sceneLoaded) || (appMode === "explore" && !exploreLoaded)) && <div className="scene-loading"><span /><b>SETTING UP YOUR STREET...</b></div>}

              {appMode === "shift" && gameMode === "ready" && (
                <div className="game-curtain start-curtain">
                  <div className="start-card">
                    <div className="start-kicker"><span className="sunburst">✳</span> COURIER SHIFT <i /> YABA BUS PARK</div>
                    <h1>THE STREETS<br /><span>ARE YOURS.</span></h1>
                    <p>Dash through Lagos, scoop up naira and weave through the danfos. One good run can change everything.</p>
                    <button className="primary-cta" onClick={beginRun}>
                      <span className="cta-play"><Play size={16} fill="currentColor" /></span>
                      <span>START YOUR SHIFT<small>YOUR FIRST NOTE IS JUST A FEW STEPS AWAY</small></span>
                      <ChevronRight size={19} className="cta-arrow" />
                    </button>
                    <button className="text-cta start-back" onClick={goExplore}><Home size={14} /> BACK TO THE CITY</button>
                    <div className="start-card-foot">
                      <span><Trophy size={14} /> PERSONAL BEST <b>{formatScore(save.best)}</b></span>
                      <span><Activity size={14} /> {save.runs} {save.runs === 1 ? "SHIFT" : "SHIFTS"} COMPLETED</span>
                    </div>
                  </div>
                  <div className="start-world-mark"><span className="mark-spark">✳</span><span>MAINLAND<br /><b>AFTER DARK</b></span></div>
                  <div className="start-scroll-cue"><span /> A CITY THAT NEVER SIGHS</div>
                </div>
              )}

              {appMode === "shift" && gameMode === "paused" && (
                <div className="game-curtain pause-curtain">
                  <div className="pause-card">
                    <div className="modal-icon"><Pause size={21} fill="currentColor" /></div>
                    <div className="modal-eyebrow">TAKE YOUR TIME</div>
                    <h2>SHIFT ON<br /><span>PAUSE.</span></h2>
                    <p>Street traffic&apos;s frozen. Catch your breath, then get back out there.</p>
                    <button className="primary-cta modal-cta" onClick={() => setGameMode("running")}><span className="cta-play"><Play size={15} fill="currentColor" /></span><span>BACK TO THE STREETS<small>PRESS ESC OR P TO RESUME</small></span><ChevronRight size={18} /></button>
                    <button className="text-cta" onClick={beginRun}><RotateCcw size={14} /> START A FRESH SHIFT</button>
                  </div>
                </div>
              )}

              {appMode === "shift" && gameMode === "over" && finalRun && (
                <div className="game-curtain result-curtain">
                  <div className="result-card">
                    <div className="result-topline"><span className="result-badge"><Zap size={13} fill="currentColor" /> SHIFT COMPLETE</span><span>{formatRunTime(finalRun.seconds)} ON THE STREETS</span></div>
                    <h2>THE CITY<br /><span>NOTICED.</span></h2>
                    <div className="result-score"><small>YOUR SHIFT SCORE</small><strong>{formatScore(finalRun.score)}</strong><i><Trophy size={13} /> {finalRun.score >= save.best && finalRun.score > 0 ? "NEW PERSONAL BEST" : `YOUR BEST IS ${formatScore(save.best)}`}</i></div>
                    <div className="result-rewards"><span><Banknote size={15} /> POCKETED THIS SHIFT</span><strong>{formatMoney(finalRun.earned)}</strong></div>
                    {finalRun.bonus > 0 && <p className="survival-bonus"><Sparkles size={13} /> 30-second survivor bonus · +{formatMoney(finalRun.bonus)}</p>}
                    <button className="primary-cta result-restart" onClick={beginRun}><span className="cta-play"><RotateCcw size={16} /></span><span>RUN IT BACK<small>INSTANT RESTART · NO LOADING SCREEN</small></span><ChevronRight size={18} /></button>
                    <button className="text-cta" onClick={goExplore}><Home size={14} /> CATCH YOUR BREATH IN THE CITY</button>
                  </div>
                </div>
              )}

              {appMode === "explore" && nearbySpot && INTERACT_INFO[nearbySpot] && !introActive && (
                <div className="interact-prompt" role="status">
                  <span className="prompt-key">E</span>
                  {(() => {
                    const info = INTERACT_INFO[nearbySpot];
                    const PromptIcon = info.icon;
                    return (
                      <>
                        <span className="prompt-icon"><PromptIcon size={16} /></span>
                        <span className="prompt-copy"><b>{info.title}</b><small>{info.hint}</small></span>
                      </>
                    );
                  })()}
                </div>
              )}

              {appMode === "explore" && introActive && exploreLoaded && (
                <div className="cine-frame" aria-hidden="true">
                  <div className="cine-bar cine-top" />
                  <div className="cine-title">
                    <span>STREETVERSE · YABA MAINLAND</span>
                    <strong>Your city is waking up.</strong>
                  </div>
                  <button className="skip-cine" onClick={() => setSkipIntroToken((current) => current + 1)}>
                    <SkipForward size={14} /> SKIP INTRO
                  </button>
                  <div className="cine-bar cine-bottom" />
                </div>
              )}

              {toast && (appMode === "explore" || gameMode === "running") && <div key={toastKey} className="run-toast"><Sparkles size={14} /> {toast}</div>}
            </div>
            <div className="world-footbar">
              <div className="world-foot-left"><span className="foot-avatar" style={{ background: `linear-gradient(140deg, ${currentOutfit.color}, #19314a)` }}>{firstName.charAt(0).toUpperCase()}</span><span><b>{save.playerName.toUpperCase()}</b><small>LEVEL {String(Math.min(30, Math.floor(save.runs / 3) + 1)).padStart(2, "0")} · STREET RUNNER</small></span></div>
              <div className="foot-location"><MapPin size={14} /><span><small>CURRENTLY IN</small><b>{unlockedDistrict.name}</b></span>{appMode === "explore" && <span className="foot-coords">X {explorePos.x} · Z {explorePos.z}</span>}<span className="foot-heat"><i /><i /><i /><i /><i className="dim" /></span><small>HEAT</small></div>
              <div className="foot-weather">{isNight ? <Moon size={14} /> : <Sun size={14} />}<span>{timeLabel.toUpperCase()}</span><i /> <span>22°C</span></div>
              <span className="local-save"><ShieldCheck size={13} /> SAVED ON THIS DEVICE</span>
            </div>
          </section>

          <aside className="right-panel" aria-label={`${panel.title} panel`}>
            <div className="panel-header">
              <div className="panel-heading-icon"><panel.icon size={17} /></div>
              <div><span>{panel.eyebrow}</span><h2>{panel.title}</h2></div>
              <button className="panel-more" title="Switch to the city map" onClick={() => selectView("map")}><Navigation size={15} /></button>
            </div>
            <p className="panel-subtitle">{VIEW_COPY[activeView]}</p>

            {activeView === "city" && (
              <div className="panel-scroll city-scroll">
                <div className="profile-card">
                  <div className="profile-card-top"><span className="profile-status"><i /> ON THE MAINLAND</span><span className="profile-level">LVL {String(Math.min(30, Math.floor(save.runs / 3) + 1)).padStart(2, "0")}</span></div>
                  <div className="profile-main-row"><div className="profile-avatar-large" style={{ background: `linear-gradient(145deg, ${currentOutfit.color}, #192a43)` }}><span>{firstName.charAt(0).toUpperCase()}</span><i><Sparkles size={11} /></i></div><div className="profile-name-wrap">
                    {editingName ? <form className="name-edit-form" onSubmit={(event) => { event.preventDefault(); editName(); }}><input autoFocus value={nameDraft} maxLength={16} onChange={(event) => setNameDraft(event.target.value)} onBlur={editName} aria-label="Player name" /><button aria-label="Save player name"><Check size={14} /></button></form> : <div className="profile-name-line"><h3>{save.playerName}</h3><button className="name-edit" onClick={() => setEditingName(true)} title="Change player name"><Pencil size={12} /></button></div>}
                    <span>Street runner · {currentOutfit.name}</span>
                  </div></div>
                  <div className="profile-progress-head"><span>ROAD TO LEVEL {String(Math.min(30, Math.floor(save.runs / 3) + 2)).padStart(2, "0")}</span><b>{save.runs % 3}/3 SHIFTS</b></div>
                  <div className="tiny-progress"><i style={{ width: `${Math.max(8, (save.runs % 3) / 3 * 100)}%` }} /></div>
                </div>

                <div className="section-heading"><div><span>THE DAILY GRIND</span><h3>30-day hustle</h3></div><span className="day-tag">DAY {String(Math.min(30, save.runs + 1)).padStart(2, "0")} <b>/ 30</b></span></div>
                <div className="mission-card">
                  <div className="mission-card-top"><div className="mission-icon"><Target size={17} /></div><span className="mission-live"><i /> REPEATABLE</span></div>
                  <h4>Stack {formatMoney(MISSION_GOAL)}</h4>
                  <p>Pick up naira on the streets. Every note gets you closer.</p>
                  <div className="mission-progress-copy"><span>POCKETED</span><b>{formatMoney(save.missionProgress)} <i>/ {formatMoney(MISSION_GOAL)}</i></b></div>
                  <div className="mission-bar"><i style={{ width: `${missionRatio}%` }} /></div>
                  {save.missionProgress >= MISSION_GOAL ? <button className="mission-reward-button" onClick={claimMission}><Gift size={14} /> CLAIM {formatMoney(600)} REWARD <ChevronRight size={14} /></button> : <button className="mission-start-link" onClick={beginRun}>KEEP THE STREAK GOING <ArrowRight size={14} /></button>}
                </div>

                <div className="explore-guide-card">
                  <span className="guide-icon"><Joystick size={17} /></span>
                  <span className="guide-copy"><b>THE CITY IS OPEN</b><small>Walk with WASD or the touch stick. Glowing markers are open for business — grill suya, shop, bank, rest, or catch a shift at the bus park.</small></span>
                  {appMode === "shift" && <button className="guide-cta" onClick={goExplore}>BACK TO CITY <ChevronRight size={13} /></button>}
                </div>

                <div className="section-heading compact-heading"><div><span>WORLD & PERFORMANCE</span><h3>City settings</h3></div><Settings2 size={16} className="heading-muted-icon" /></div>
                <div className="settings-card">
                  <div className="settings-row">
                    <span><Gauge size={13} /> GRAPHICS</span>
                    <div className="quality-seg" role="group" aria-label="Graphics quality">
                      {(["low", "medium", "high"] as ExploreQuality[]).map((option) => (
                        <button key={option} className={quality === option ? "seg-active" : ""} onClick={() => setQuality(option)}>{option.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-row">
                    <span>{isNight ? <Moon size={13} /> : <Sun size={13} />} DAY & NIGHT</span>
                    <button className={`toggle-pill ${dayNightEnabled ? "toggle-on" : ""}`} onClick={() => setDayNightEnabled((current) => !current)} aria-pressed={dayNightEnabled}>{dayNightEnabled ? "ON" : "OFF"}</button>
                  </div>
                  <div className="settings-row">
                    <span><CloudRain size={13} /> RAIN</span>
                    <button className={`toggle-pill ${rainEnabled ? "toggle-on" : ""}`} onClick={() => setRainEnabled((current) => !current)} aria-pressed={rainEnabled}>{rainEnabled ? "ON" : "OFF"}</button>
                  </div>
                  <p className="settings-note">Lower the graphics if the city feels slow. Rain and shadows rest on Medium and High.</p>
                </div>

                <div className="stats-grid">
                  <div className="mini-stat"><span><Trophy size={13} /> PERSONAL BEST</span><strong>{formatScore(save.best)}</strong><small>points</small></div>
                  <div className="mini-stat"><span><Banknote size={13} /> ALL-TIME EARNED</span><strong>{formatMoney(save.totalEarned)}</strong><small>{save.runs} completed shifts</small></div>
                </div>

                <div className="section-heading compact-heading"><div><span>LOCAL LEADERBOARD</span><h3>Best on the block</h3></div><Trophy size={16} className="heading-muted-icon" /></div>
                <div className="leaderboard-card">
                  {recentScores.length ? recentScores.map((entry, index) => (
                    <div className="leader-row" key={`${entry.date}-${index}`}><span className={`leader-rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><span className="leader-name">{index === 0 ? save.playerName : `RUNNER ${index + 1}`}<small>{formatRunTime(entry.seconds)} · {formatMoney(entry.earned)} earned</small></span><b>{formatScore(entry.score)}</b></div>
                  )) : <div className="empty-leader"><div className="empty-trophy"><Trophy size={17} /></div><span>Your first run writes the record.</span><small>Scores stay on this device.</small></div>}
                  <div className="leader-local-note"><ShieldCheck size={12} /> YOUR PRIVATE, LOCAL TOP FIVE</div>
                </div>

                <button className="quick-job-card" onClick={beginRun}><span className="quick-job-icon"><PackageCheck size={18} /></span><span><small>NOW HIRING</small><b>Night courier run</b><i>Make every delivery count</i></span><span className="quick-go"><ChevronRight size={16} /></span></button>
              </div>
            )}

            {activeView === "hustle" && (
              <div className="panel-scroll">
                <div className="featured-job-card">
                  <div className="job-card-art"><div className="job-sun" /><span className="job-road-line" /><span className="job-road-line second" /><div className="job-van"><i /><i /><b /></div><div className="job-art-chip"><PackageCheck size={12} /> OPEN SHIFT</div></div>
                  <div className="job-details"><span className="job-type">COURIER · STARTER JOB</span><h3>Mainland night run</h3><p>Collect the loose notes and get the parcel home. Watch the danfos on the way.</p><div className="job-rewards"><span><Coins size={14} /> ₦100 / note</span><span><PackageCheck size={14} /> ₦250 / parcel</span></div><button className="job-start-button" onClick={beginRun}><Play size={14} fill="currentColor" /> START THE SHIFT <span>NO ENTRY FEE</span></button><p className="job-alt-hint"><MapPin size={12} /> Or walk to Yaba Bus Park in the city and press E.</p></div>
                </div>
                <div className="section-heading compact-heading"><div><span>THE 30-DAY CHALLENGE</span><h3>One run at a time</h3></div><Flame size={17} className="challenge-flame" /></div>
                <div className="challenge-card"><div className="challenge-title-row"><div className="challenge-mark"><Zap size={17} fill="currentColor" /></div><div><b>Build your street rep</b><span>Complete runs to level up</span></div></div><div className="challenge-days"><div className="challenge-progress-head"><span>SHIFTS COMPLETED</span><b>{Math.min(30, save.runs)} <i>/ 30</i></b></div><div className="challenge-progress"><i style={{ width: `${Math.min(100, (save.runs / 30) * 100)}%` }} /></div><div className="challenge-footer"><span>{save.runs >= 30 ? "CHALLENGE COMPLETE" : `NEXT UP · DAY ${String(Math.min(30, save.runs + 1)).padStart(2, "0")}`}</span><span><Gift size={12} /> {formatMoney(500)} at 30 shifts</span></div></div></div>
                <div className="job-tip"><div><Sparkles size={15} /></div><p><b>PRO TIP</b><br />A quick dash gets you through one lane of traffic. The blue dash ring refills before the next big wave.</p></div>
                <div className="shift-summary"><span>SHIFT PAYOUTS HIT YOUR POCKET INSTANTLY</span><strong>{formatMoney(runEarnings)}</strong><small>earned this run</small></div>
              </div>
            )}

            {activeView === "wallet" && (
              <div className="panel-scroll wallet-scroll">
                <div className="wallet-total-card"><span>YOUR STREETVERSE BALANCE</span><strong>{formatMoney(save.cash + save.bank)}</strong><small><span /> ALL CURRENCY IS FICTIONAL & FOR GAMEPLAY ONLY</small><div className="wallet-orbit"><Coins size={24} /></div></div>
                <div className="balance-pair"><div className="balance-card pocket-balance"><span><Wallet size={14} /> POCKET</span><b>{formatMoney(save.cash)}</b><small>ready to spend</small></div><div className="balance-card bank-balance"><span><Landmark size={14} /> VAULT</span><b>{formatMoney(save.bank)}</b><small>saved for later</small></div></div>
                <div className="transfer-actions"><button onClick={() => moveMoney("save")}><ArrowDownToLine size={15} /><span>SAVE ₦500<small>to your vault</small></span><ChevronRight size={13} /></button><button onClick={() => moveMoney("withdraw")}><Wallet size={15} /><span>WITHDRAW<small>from your vault</small></span><ChevronRight size={13} /></button></div>
                <div className="wallet-growth-card"><div className="growth-symbol"><Activity size={17} /></div><div><span>LIFETIME STREET EARNINGS</span><b>{formatMoney(save.totalEarned)}</b></div><div className="growth-mini"><i /><i /><i /><i /><i /><i /><i /></div></div>
                <div className="section-heading compact-heading"><div><span>YOUR MONEY MOVES</span><h3>Recent activity</h3></div><span className="transactions-tag">{save.transactions.length} ITEMS</span></div>
                <div className="transactions-list">
                  {save.transactions.length ? save.transactions.slice(0, 7).map((transaction) => (
                    <div className="transaction-row" key={transaction.id}><span className={`transaction-icon transaction-${transaction.kind}`}>{transaction.kind === "spend" ? <Store size={14} /> : transaction.kind === "transfer" ? <Landmark size={14} /> : <Coins size={14} />}</span><span className="transaction-copy"><b>{transaction.label}</b><small>{formatTransactionTime(transaction.at)}</small></span><strong className={transaction.amount < 0 ? "amount-negative" : transaction.kind === "transfer" ? "amount-transfer" : ""}>{transaction.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(transaction.amount))}</strong></div>
                  )) : <div className="empty-transactions"><Coins size={18} /><span>Your next hustle will show up here.</span></div>}
                </div>
                <div className="wallet-disclaimer"><ShieldCheck size={14} /><span>No real-money purchases. No cash-out. Just a game.</span></div>
              </div>
            )}

            {activeView === "map" && (
              <div className="panel-scroll map-scroll">
                <MapIllustration active={save.district} pos={appMode === "explore" ? explorePos : undefined} />
                {appMode === "explore" && (
                  <div className="map-coords-chip"><MapPin size={12} /><span>LIVE POSITION · X {explorePos.x} · Z {explorePos.z}</span><b>{timeLabel.toUpperCase()}</b></div>
                )}
                <div className="section-heading compact-heading"><div><span>FOUR STOPS. ONE BIG CITY.</span><h3>Pick your district</h3></div></div>
                <div className="district-list">
                  {DISTRICTS.map((district) => {
                    const unlocked = save.districts.includes(district.id);
                    const selected = district.id === save.district;
                    return <button key={district.id} className={`district-row ${selected ? "district-selected" : ""} ${!unlocked ? "district-locked" : ""}`} onClick={() => selectDistrict(district.id)}>
                      <span className="district-marker" style={{ background: district.tint }}><MapPin size={14} fill={selected ? "currentColor" : "none"} /></span><span className="district-details"><b>{district.name}</b><small>{district.subtitle}</small></span><span className="district-action">{selected ? <Check size={15} /> : unlocked ? <ChevronRight size={16} /> : <span>{formatMoney(district.price)}</span>}</span>
                    </button>;
                  })}
                </div>
                <div className="district-tip"><Navigation size={15} /><span>New areas cost virtual naira to unlock. Runs stay in the selected district.</span></div>
              </div>
            )}

            {activeView === "style" && (
              <div className="panel-scroll style-scroll">
                <div className="style-preview"><div className="style-orbit style-orbit-one" /><div className="style-orbit style-orbit-two" /><div className="style-avatar" style={{ background: `linear-gradient(147deg, ${currentOutfit.color}, #162239)` }}><span className="style-head" style={{ background: save.skin }} /><span className="style-hair" /><span className="style-body" style={{ background: currentOutfit.color }}><b>SV</b></span><span className="style-arm style-arm-left" style={{ background: save.skin }} /><span className="style-arm style-arm-right" style={{ background: save.skin }} /><span className="style-leg style-leg-left" /><span className="style-leg style-leg-right" /></div><div className="style-preview-info"><span>YOUR LOOK · LEVEL {String(Math.min(30, Math.floor(save.runs / 3) + 1)).padStart(2, "0")}</span><b>{save.playerName}</b><small>{currentOutfit.name}</small></div><span className="style-spark style-spark-a">✳</span><span className="style-spark style-spark-b">✦</span></div>
                <div className="section-heading compact-heading"><div><span>THE FITS</span><h3>Streetwear collection</h3></div><span className="transactions-tag">{save.outfits.length} OWNED</span></div>
                <div className="outfit-grid">{OUTFITS.map((outfit) => {
                  const owned = save.outfits.includes(outfit.id);
                  const selected = save.outfit === outfit.id;
                  return <button key={outfit.id} className={`outfit-card ${selected ? "outfit-selected" : ""}`} onClick={() => buyOutfit(outfit.id)}><span className="outfit-swatch" style={{ background: `linear-gradient(145deg, ${outfit.color}, #172032)` }}><i style={{ background: outfit.color }} /><i style={{ background: outfit.color }} /><span>SV</span>{selected && <b><Check size={11} /></b>}</span><strong>{outfit.name}</strong><small>{selected ? "WORN NOW" : owned ? "TAP TO EQUIP" : formatMoney(outfit.price)}</small></button>;
                })}</div>
                <div className="section-heading compact-heading skin-heading"><div><span>MAKE IT YOU</span><h3>Skin tone</h3></div></div>
                <div className="skin-swatches">{SKINS.map((skin) => <button key={skin} className={`skin-swatch ${save.skin === skin ? "skin-active" : ""}`} style={{ background: skin }} onClick={() => { updateSave((latest) => ({ ...latest, skin })); showToast("LOOKING GOOD. THAT'S YOU."); }} aria-label={`Select skin tone ${skin}`}>{save.skin === skin && <Check size={15} />}</button>)}</div>
                <div className="inventory-foot"><ShieldCheck size={14} /> A NEW FIT CHANGES YOUR RUNNER IN THE CITY</div>
              </div>
            )}

            {activeView === "home" && (
              <div className="panel-scroll home-scroll">
                <div className="home-art"><div className="home-moon" /><div className="home-building home-building-back"><i /><i /><i /><i /></div><div className="home-building home-building-front"><i /><i /><i /><i /><b /></div><div className="home-plant">✳</div><span className="home-art-label"><KeyRound size={13} /> YOUR KEYS, YOUR CORNER</span></div>
                <div className="property-owned-card"><div className="property-status"><span><span /> {save.property === "flat" ? "UPGRADED HOME" : "YOUR FIRST KEY"}</span><span><Home size={14} /></span></div><h3>{save.property === "flat" ? "Surulere starter flat" : "Shared room in Yaba"}</h3><p>{save.property === "flat" ? "A quiet corner above the street. Your own place to land after a long shift." : "It isn't fancy, but it's yours. A soft landing after the noise of the Mainland."}</p><div className="property-perks"><span><Check size={13} /> PERSONAL HOME BASE</span><span><Check size={13} /> OUTFIT CHANGES SAVED</span></div></div>
                {save.property !== "flat" ? <div className="property-upgrade-card"><span className="property-price-tag">FOR SALE</span><h4>Room to grow</h4><p>Trade the shared room for a place of your own in Surulere.</p><div><span><Building2 size={15} /> STARTER FLAT</span><b>{formatMoney(18000)}</b></div><button onClick={buyHome} disabled={save.cash < 18000}><KeyRound size={14} /> {save.cash < 18000 ? "STACK MORE NAIRA" : "BUY YOUR FIRST HOME"} <ChevronRight size={14} /></button></div> : <div className="home-owner-note"><Sparkles size={16} /><span><b>A place that&apos;s yours.</b><small>You&apos;re building a life here, one shift at a time.</small></span></div>}
                <div className="home-safe-note"><ShieldCheck size={14} /><span>Your local save remembers this home on this device.</span></div>
              </div>
            )}

            {activeView === "garage" && (
              <div className="panel-scroll garage-scroll">
                <div className="garage-feature"><div className="garage-sky"><span className="garage-neon">MOTOR<br />PARK<span>.</span></span><div className="garage-tire tire-back" /><div className="garage-tire tire-front" /><div className="garage-bike-shape"><span /><i /><b /></div><div className="garage-cone" /></div><div className="garage-feature-footer"><span><span /> {activeVehicle.name.toUpperCase()}</span><b>{save.vehicle === "on-foot" ? "OWNED" : "IN YOUR GARAGE"}</b></div></div>
                <div className="garage-benefit"><div><Gauge size={16} /></div><span><b>{activeVehicle.bonus}</b><small>Earned naira hits your wallet as you play.</small></span></div>
                <div className="section-heading compact-heading"><div><span>ROLL OUT IN STYLE</span><h3>Find your ride</h3></div></div>
                <div className="vehicle-list">{VEHICLES.map((vehicle) => {
                  const owned = save.vehicles.includes(vehicle.id);
                  const selected = save.vehicle === vehicle.id;
                  const Icon = vehicle.icon;
                  return <div className={`vehicle-card ${selected ? "vehicle-selected" : ""}`} key={vehicle.id}><span className="vehicle-icon"><Icon size={18} /></span><span className="vehicle-info"><b>{vehicle.name}</b><small>{vehicle.detail}</small><i>{vehicle.bonus}</i></span><button onClick={() => buyVehicle(vehicle.id)} disabled={!owned && save.cash < vehicle.price}>{selected ? <Check size={15} /> : owned ? "EQUIP" : formatMoney(vehicle.price)}</button></div>;
                })}</div>
                <div className="garage-note"><Sparkles size={14} /><span>Every ride stays in your garage. Your favourite one pays a little extra on each pickup.</span></div>
              </div>
            )}

            <div className="panel-bottom"><span><span className="panel-bottom-dot" /> YOUR STREET. YOUR PACE.</span><span>V1.0 · LAGOS BUILD</span></div>
          </aside>
        </main>
      </div>
      <div className="app-grain" aria-hidden="true" />
    </div>
  );
}
