// Shared STREETVERSE game types used across the shell, phone, studio and profile.

export type SkillId = "delivery" | "cooking" | "charisma" | "driving";

export type Skills = Record<SkillId, number>;

export type NotificationKind = "job" | "friend" | "business" | "system" | "achievement";

export type GameNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: number;
  read: boolean;
};

export type Friend = {
  id: string;
  name: string;
  role: string;
  online: boolean;
  activity: string;
  district: string;
  avatar: string;
};

export type BusinessState = {
  owned: boolean;
  name: string;
  kind: string;
  stock: number;
  sales: number;
  workers: number;
  reputation: number;
};

export type SavedLook = {
  id: string;
  name: string;
  outfit: string;
  skin: string;
};

export type Achievement = {
  id: string;
  title: string;
  hint: string;
  icon: string;
  unlockedAt: number | null;
};

export type RentState = {
  due: number;
  lastPaid: number;
};

export type PlayerExtras = {
  skills: Skills;
  reputation: number;
  achievements: Achievement[];
  notifications: GameNotification[];
  friends: Friend[];
  business: BusinessState;
  rent: RentState;
  looks: SavedLook[];
  career: string;
  careerLevel: number;
};

export const SKILL_META: Record<SkillId, { label: string; blurb: string }> = {
  delivery: { label: "Delivery", blurb: "Faster courier payouts" },
  cooking: { label: "Cooking", blurb: "Better suya grill earnings" },
  charisma: { label: "Charisma", blurb: "Friends & social rewards" },
  driving: { label: "Driving", blurb: "Ride fares & handling" },
};

export const ACHIEVEMENT_DEFS: Achievement[] = [
  { id: "first-note", title: "First Note", hint: "Pocket your first ₦100", icon: "coins", unlockedAt: null },
  { id: "streak-5", title: "On a Roll", hint: "Reach a 5-note streak", icon: "zap", unlockedAt: null },
  { id: "shift-1", title: "First Shift", hint: "Complete a courier shift", icon: "flame", unlockedAt: null },
  { id: "rich-10k", title: "Stacked", hint: "Hold ₦10,000 at once", icon: "crown", unlockedAt: null },
  { id: "homeowner", title: "Keys to the City", hint: "Buy your first home", icon: "home", unlockedAt: null },
  { id: "wheels", title: "Roll Out", hint: "Own a vehicle", icon: "bike", unlockedAt: null },
  { id: "boss", title: "Entrepreneur", hint: "Open a business", icon: "store", unlockedAt: null },
  { id: "explorer", title: "Explorer", hint: "Unlock a new district", icon: "map", unlockedAt: null },
  { id: "social", title: "People Person", hint: "Befriend a resident", icon: "users", unlockedAt: null },
  { id: "night-owl", title: "Night Owl", hint: "Be out after dark", icon: "moon", unlockedAt: null },
];

export const DEFAULT_EXTRAS: PlayerExtras = {
  skills: { delivery: 0, cooking: 0, charisma: 0, driving: 0 },
  reputation: 0,
  achievements: ACHIEVEMENT_DEFS.map((a) => ({ ...a })),
  notifications: [],
  friends: [
    { id: "f1", name: "Tunde", role: "Courier mate", online: true, activity: "Working a shift", district: "Yaba", avatar: "T" },
    { id: "f2", name: "Adaeze", role: "Suya trader", online: true, activity: "At the grill", district: "Yaba", avatar: "A" },
    { id: "f3", name: "Chidi", role: "Bus driver", online: false, activity: "Last seen 2h ago", district: "Mainland", avatar: "C" },
    { id: "f4", name: "Zainab", role: "Textile seller", online: true, activity: "Balogun Market", district: "Balogun", avatar: "Z" },
    { id: "f5", name: "Emeka", role: "Mechanic", online: false, activity: "Last seen 1d ago", district: "Motor Park", avatar: "E" },
  ],
  business: { owned: false, name: "", kind: "suya-stand", stock: 0, sales: 0, workers: 0, reputation: 0 },
  rent: { due: 1200, lastPaid: Date.now() },
  looks: [],
  career: "Street Runner",
  careerLevel: 1,
};

export function makeNotification(kind: NotificationKind, title: string, body: string): GameNotification {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, kind, title, body, at: Date.now(), read: false };
}

export function reputationTier(score: number): { tier: string; next: number } {
  if (score >= 5000) return { tier: "Legend", next: 10000 };
  if (score >= 2000) return { tier: "Respected", next: 5000 };
  if (score >= 800) return { tier: "Known", next: 2000 };
  if (score >= 250) return { tier: "Familiar", next: 800 };
  return { tier: "Newcomer", next: 250 };
}
