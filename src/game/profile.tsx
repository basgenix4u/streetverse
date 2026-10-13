"use client";

import {
  Award,
  Bike,
  Building2,
  Check,
  Crown,
  Flame,
  Home,
  KeyRound,
  MapPin,
  Moon,
  Shirt,
  Sparkles,
  Store,
  Users,
  X,
  Zap,
  Coins,
  type LucideIcon,
} from "lucide-react";
import { reputationTier, SKILL_META, type PlayerExtras, type SavedLook, type SkillId } from "./types";

export type ProfileProps = {
  playerName: string;
  outfit: string;
  skin: string;
  cash: number;
  bank: number;
  best: number;
  runs: number;
  totalEarned: number;
  property: string;
  vehicles: string[];
  vehicle: string;
  districts: string[];
  looks: SavedLook[];
  extras: PlayerExtras;
  onClose: () => void;
};

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  coins: Coins,
  zap: Zap,
  flame: Flame,
  crown: Crown,
  home: Home,
  bike: Bike,
  store: Store,
  map: MapPin,
  users: Users,
  moon: Moon,
};

const OUTFIT_NAMES: Record<string, string> = {
  surulere: "Surulere Blue",
  sunset: "Eko Sunset",
  purple: "Yaba Afterdark",
  lime: "Lekki Lime",
};

export default function LifestyleProfile({
  playerName, outfit, skin, cash, bank, best, runs, totalEarned,
  property, vehicles, vehicle, districts, looks, extras, onClose,
}: ProfileProps) {
  const tier = reputationTier(extras.reputation);
  const unlocked = extras.achievements.filter((a) => a.unlockedAt).length;
  const skillTotal = (Object.keys(extras.skills) as SkillId[]).reduce((sum, key) => sum + extras.skills[key], 0);

  return (
    <div className="profile-overlay" role="dialog" aria-label="Lifestyle profile">
      <div className="profile-card-full">
        <div className="profile-full-head">
          <div className="profile-full-id">
            <div className="profile-full-avatar" style={{ background: `linear-gradient(145deg, ${outfit === "surulere" ? "#3c91db" : outfit === "sunset" ? "#f07845" : outfit === "purple" ? "#a27cec" : "#a4cf65"}, #192a43)` }}>
              <span>{playerName.charAt(0).toUpperCase()}</span>
              <i><Sparkles size={11} /></i>
            </div>
            <div>
              <span>LIFESTYLE PROFILE</span>
              <h2>{playerName}</h2>
              <p>{extras.career} · Level {extras.careerLevel}</p>
            </div>
          </div>
          <button className="profile-full-close" onClick={onClose} aria-label="Close profile"><X size={16} /></button>
        </div>

        <div className="profile-full-scroll">
          <div className="profile-hero">
            <div className="profile-hero-main">
              <span className="profile-hero-tier"><Crown size={13} /> {tier.tier.toUpperCase()}</span>
              <strong>{formatRep(extras.reputation)}</strong>
              <small>REPUTATION</small>
              <div className="profile-rep-bar"><i style={{ width: `${Math.min(100, (extras.reputation / tier.next) * 100)}%` }} /></div>
              <span className="profile-rep-next">{formatRep(tier.next - extras.reputation)} to {nextTierName(tier.tier)}</span>
            </div>
            <div className="profile-hero-stats">
              <div className="profile-stat"><span>BEST SHIFT</span><b>{best.toLocaleString()}</b></div>
              <div className="profile-stat"><span>SHIFTS</span><b>{runs}</b></div>
              <div className="profile-stat"><span>LIFETIME EARNED</span><b>₦{totalEarned.toLocaleString()}</b></div>
              <div className="profile-stat"><span>ACHIEVEMENTS</span><b>{unlocked}/{extras.achievements.length}</b></div>
            </div>
          </div>

          <div className="profile-section">
            <div className="profile-section-head"><span>CAREER & SKILLS</span><h3>What you&apos;re known for</h3></div>
            <div className="profile-career">
              <div className="profile-career-badge">
                <Flame size={16} />
                <div><b>{extras.career}</b><small>Level {extras.careerLevel} · {runs} shifts logged</small></div>
              </div>
              <div className="profile-skills">
                {(Object.keys(SKILL_META) as SkillId[]).map((skill) => (
                  <div className="profile-skill" key={skill}>
                    <div className="profile-skill-top">
                      <span>{SKILL_META[skill].label}</span>
                      <b>Lv {extras.skills[skill]}</b>
                    </div>
                    <div className="profile-skill-bar"><i style={{ width: `${Math.min(100, (extras.skills[skill] % 5) * 20 || (extras.skills[skill] > 0 ? 100 : 0))}%` }} /></div>
                    <small>{SKILL_META[skill].blurb}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="profile-section">
            <div className="profile-section-head"><span>YOUR ASSETS</span><h3>What you own</h3></div>
            <div className="profile-assets">
              <div className="profile-asset">
                <span className="profile-asset-icon"><Home size={16} /></span>
                <div><b>{property === "flat" ? "Surulere Starter Flat" : "Shared Room · Yaba"}</b><small>{property === "flat" ? "Owned home" : "Rented room"}</small></div>
                <KeyRound size={14} />
              </div>
              <div className="profile-asset">
                <span className="profile-asset-icon"><Bike size={16} /></span>
                <div><b>{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}</b><small>Active: {vehicle === "on-foot" ? "On foot" : vehicle}</small></div>
                <MapPin size={14} />
              </div>
              <div className="profile-asset">
                <span className="profile-asset-icon"><Store size={16} /></span>
                <div><b>{extras.business.owned ? extras.business.name : "No business yet"}</b><small>{extras.business.owned ? `${extras.business.stock} in stock · ${extras.business.sales} sales` : "Open one from the phone"}</small></div>
                <Building2 size={14} />
              </div>
              <div className="profile-asset">
                <span className="profile-asset-icon"><Shirt size={16} /></span>
                <div><b>{looks.length + 1} saved look{looks.length === 0 ? "" : "s"}</b><small>Wearing: {OUTFIT_NAMES[outfit] ?? "Surulere Blue"}</small></div>
                <Check size={14} />
              </div>
            </div>
          </div>

          <div className="profile-section">
            <div className="profile-section-head"><span>ACHIEVEMENTS</span><h3>Your record</h3></div>
            <div className="profile-achievements">
              {extras.achievements.map((achievement) => {
                const Icon = ACHIEVEMENT_ICONS[achievement.icon] ?? Award;
                const isUnlocked = !!achievement.unlockedAt;
                return (
                  <div className={`profile-achievement ${isUnlocked ? "profile-achievement-on" : ""}`} key={achievement.id}>
                    <span className="profile-achievement-icon"><Icon size={15} /></span>
                    <div><b>{achievement.title}</b><small>{achievement.hint}</small></div>
                    {isUnlocked ? <Check size={14} /> : <span className="profile-achievement-lock">LOCKED</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="profile-section">
            <div className="profile-section-head"><span>WALLET</span><h3>Your money</h3></div>
            <div className="profile-wallet">
              <div className="profile-wallet-cell"><span>POCKET</span><b>₦{cash.toLocaleString()}</b></div>
              <div className="profile-wallet-cell"><span>VAULT</span><b>₦{bank.toLocaleString()}</b></div>
              <div className="profile-wallet-cell"><span>DISTRICTS</span><b>{districts.length} unlocked</b></div>
              <div className="profile-wallet-cell"><span>SKILL XP</span><b>{skillTotal}</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRep(value: number) {
  return value.toLocaleString();
}
function nextTierName(current: string) {
  const order = ["Newcomer", "Familiar", "Known", "Respected", "Legend"];
  const index = order.indexOf(current);
  return order[Math.min(order.length - 1, index + 1)];
}
