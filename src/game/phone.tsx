"use client";

import { useState } from "react";
import {
  Banknote,
  Bike,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  Coins,
  Compass,
  Home,
  Landmark,
  Map as MapIcon,
  MessageSquare,
  Navigation,
  Phone as PhoneIcon,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { reputationTier, type BusinessState, type Friend, type GameNotification, type PlayerExtras, type SavedLook } from "./types";

export type PhoneProps = {
  playerName: string;
  cash: number;
  bank: number;
  district: string;
  timeLabel: string;
  isNight: boolean;
  extras: PlayerExtras;
  looks: SavedLook[];
  onClose: () => void;
  onStartShift: () => void;
  onOpenStudio: () => void;
  onOpenProfile: () => void;
  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number) => void;
  onBuyBusiness: () => void;
  onRestock: (amount: number) => void;
  onHireWorker: () => void;
  onGoDistrict: (id: string) => void;
  onAddLook: (name: string) => void;
  onMarkNotificationsRead: () => void;
};

type AppId = "home" | "jobs" | "messages" | "contacts" | "bank" | "map" | "business" | "property" | "transport" | "feed" | "settings";

const APPS: { id: AppId; label: string; icon: LucideIcon; color: string }[] = [
  { id: "home", label: "Home", icon: Home, color: "#f0a56a" },
  { id: "jobs", label: "Jobs", icon: Briefcase, color: "#8fd8b9" },
  { id: "messages", label: "Messages", icon: MessageSquare, color: "#9db6e8" },
  { id: "contacts", label: "Contacts", icon: Users, color: "#c9a2ef" },
  { id: "bank", label: "Bank", icon: Landmark, color: "#7cc7ef" },
  { id: "map", label: "Map", icon: MapIcon, color: "#e5ac4c" },
  { id: "business", label: "Business", icon: Store, color: "#f07845" },
  { id: "property", label: "Property", icon: Building2, color: "#a4cf65" },
  { id: "transport", label: "Transport", icon: Bike, color: "#83d5f1" },
  { id: "feed", label: "Feed", icon: Sparkles, color: "#e58bb1" },
  { id: "settings", label: "Settings", icon: Settings, color: "#8a93a3" },
];

const DISTRICT_PHONE = [
  { id: "yaba", name: "Yaba Mainland", vibe: "Street food · transport · starter jobs", price: 0 },
  { id: "balogun", name: "Balogun Market", vibe: "Textiles · trade · hustle", price: 1800 },
  { id: "vi", name: "Victoria Island", vibe: "Offices · banks · networking", price: 4200 },
  { id: "lekki", name: "Lekki Phase 1", vibe: "Luxury · shows · nightlife", price: 7000 },
];

const JOB_OFFERS = [
  { id: "j1", title: "Night courier run", pay: "₦100–250 / note", employer: "Yaba Bus Park", skill: "delivery", blurb: "Collect street notes, dodge danfos." },
  { id: "j2", title: "Suya grill shift", pay: "₦350 / shift", employer: "Mama T's Suya", skill: "cooking", blurb: "Work the grill at the corner." },
  { id: "j3", title: "Market runner", pay: "₦450 / run", employer: "Balogun Textiles", skill: "delivery", blurb: "Move bolts of cloth across the market." },
  { id: "j4", title: "Delivery partner", pay: "₦600 / run", employer: "Eko Night Mart", skill: "delivery", blurb: "For riders with a proven record." },
  { id: "j5", title: "Event host", pay: "₦800 / night", employer: "Lekki Shows", skill: "charisma", blurb: "Keep the crowd moving." },
];

const FEED_POSTS = [
  { id: "p1", author: "Tunde", text: "Just finished a 12-note courier run. These streets don't sleep.", likes: 14, tag: "hustle" },
  { id: "p2", author: "Zainab", text: "New ankara stock just landed at Balogun. Come see me.", likes: 31, tag: "market" },
  { id: "p3", author: "Adaeze", text: "Suya is ready. Late shift tonight at the grill.", likes: 22, tag: "food" },
  { id: "p4", author: "Streetverse", text: "Golden hour over the Mainland. Get out there.", likes: 88, tag: "city" },
];

const MESSAGE_THREADS = [
  { id: "m1", from: "Tunde", preview: "You free for a run later?", time: "2m", unread: true },
  { id: "m2", from: "Adaeze", preview: "I saved you a plate.", time: "1h", unread: true },
  { id: "m3", from: "Zainab", preview: "Ankara arrives Thursday.", time: "3h", unread: false },
];

export default function Phone({
  playerName, cash, bank, district, timeLabel, isNight, extras, looks,
  onClose, onStartShift, onOpenStudio, onOpenProfile,
  onDeposit, onWithdraw, onBuyBusiness, onRestock, onHireWorker,
  onGoDistrict, onAddLook, onMarkNotificationsRead,
}: PhoneProps) {
  const [app, setApp] = useState<AppId>("home");
  const [thread, setThread] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const unread = extras.notifications.filter((n) => !n.read).length;
  const tier = reputationTier(extras.reputation);

  const openApp = (id: AppId) => {
    setApp(id);
    setThread(null);
  };

  const renderApp = () => {
    switch (app) {
      case "home":
        return (
          <div className="phone-app">
            <div className="phone-greeting">
              <span>GOOD {isNight ? "NIGHT" : "EVENING"},</span>
              <h2>{playerName}</h2>
              <p>{timeLabel} · {district}</p>
            </div>
            <div className="phone-quick">
              <button className="phone-quick-shift" onClick={onStartShift}>
                <Zap size={16} fill="currentColor" /> START A SHIFT
              </button>
              <button className="phone-quick-look" onClick={onOpenStudio}>
                <Sparkles size={15} /> CHARACTER STUDIO
              </button>
            </div>
            <div className="phone-balance-row">
              <div className="phone-balance"><span>POCKET</span><b>₦{cash.toLocaleString()}</b></div>
              <div className="phone-balance"><span>VAULT</span><b>₦{bank.toLocaleString()}</b></div>
              <div className="phone-balance"><span>REP</span><b>{tier.tier}</b></div>
            </div>
            {unread > 0 && (
              <button className="phone-notices" onClick={() => openApp("messages")}>
                <span className="phone-notices-dot" /> {unread} unread message{unread === 1 ? "" : "s"} <ChevronRight size={13} />
              </button>
            )}
            <div className="phone-app-grid">
              {APPS.filter((a) => a.id !== "home").map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.id} className="phone-app-tile" onClick={() => openApp(a.id)}>
                    <span className="phone-tile-icon" style={{ background: `${a.color}22`, color: a.color }}><Icon size={18} /></span>
                    <span>{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      case "jobs":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>Jobs & Hustles</h3><p>Offers match your record</p></div>
            <div className="phone-jobs">
              {JOB_OFFERS.map((job) => (
                <div className="phone-job" key={job.id}>
                  <div className="phone-job-top">
                    <b>{job.title}</b>
                    <span>{job.pay}</span>
                  </div>
                  <p>{job.blurb}</p>
                  <div className="phone-job-foot">
                    <span>{job.employer}</span>
                    <button onClick={onStartShift}>ACCEPT <ChevronRight size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case "messages":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>Messages</h3><p>Friends & residents</p></div>
            {thread ? (
              <div className="phone-thread">
                <button className="phone-back" onClick={() => setThread(null)}>‹ Back</button>
                <div className="phone-thread-scroll">
                  <div className="phone-bubble phone-bubble-in">You free for a run later?</div>
                  <div className="phone-bubble phone-bubble-out">Depends — what&apos;s the job?</div>
                  <div className="phone-bubble phone-bubble-in">Courier run to Balogun. Good pay.</div>
                </div>
                <div className="phone-compose">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Reply…" aria-label="Message reply" />
                  <button aria-label="Send message"><Send size={14} /></button>
                </div>
              </div>
            ) : (
              <div className="phone-threads">
                {MESSAGE_THREADS.map((m) => (
                  <button className="phone-thread-row" key={m.id} onClick={() => setThread(m.id)}>
                    <span className="phone-thread-avatar">{m.from.charAt(0)}</span>
                    <span className="phone-thread-copy"><b>{m.from}</b><small>{m.preview}</small></span>
                    <span className="phone-thread-meta"><small>{m.time}</small>{m.unread && <i />}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      case "contacts":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>Contacts</h3><p>Who&apos;s around right now</p></div>
            <div className="phone-contacts">
              {extras.friends.map((friend) => (
                <div className="phone-contact" key={friend.id}>
                  <span className="phone-contact-avatar" style={{ background: friend.avatar === "T" ? "#f0a56a" : friend.avatar === "A" ? "#8fd8b9" : friend.avatar === "C" ? "#9db6e8" : friend.avatar === "Z" ? "#c9a2ef" : "#e5ac4c" }}>
                    {friend.avatar}
                    <i className={friend.online ? "phone-online" : "phone-offline"} />
                  </span>
                  <span className="phone-contact-copy"><b>{friend.name}</b><small>{friend.role}</small></span>
                  <span className="phone-contact-status"><small>{friend.activity}</small><b>{friend.district}</b></span>
                </div>
              ))}
            </div>
          </div>
        );
      case "bank":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>Eko Trust Bank</h3><p>Your money, protected</p></div>
            <div className="phone-bank-balance">
              <span>VAULT BALANCE</span>
              <b>₦{bank.toLocaleString()}</b>
              <small>Pocket: ₦{cash.toLocaleString()}</small>
            </div>
            <div className="phone-bank-actions">
              <button onClick={() => onDeposit(500)}><Plus size={14} /> SAVE ₦500</button>
              <button onClick={() => onWithdraw(500)}><Banknote size={14} /> WITHDRAW ₦500</button>
            </div>
            <div className="phone-bank-note"><ShieldCheck size={13} /> Server-authoritative. No real-money value.</div>
          </div>
        );
      case "map":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>City Map</h3><p>Pick a district to travel</p></div>
            <div className="phone-map-list">
              {DISTRICT_PHONE.map((d) => {
                const owned = extras.achievements.some((a) => a.id === "explorer") || d.id === district || d.price === 0;
                const active = d.id === district;
                return (
                  <button key={d.id} className={`phone-district ${active ? "phone-district-active" : ""}`} onClick={() => onGoDistrict(d.id)}>
                    <span className="phone-district-marker" />
                    <span className="phone-district-copy"><b>{d.name}</b><small>{d.vibe}</small></span>
                    <span className="phone-district-action">{active ? <Check size={14} /> : owned ? "GO" : `₦${d.price}`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      case "business":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>My Business</h3><p>{extras.business.owned ? extras.business.name : "Become your own boss"}</p></div>
            {extras.business.owned ? (
              <div className="phone-business">
                <div className="phone-business-stats">
                  <div className="phone-business-stat"><span>STOCK</span><b>{extras.business.stock}</b></div>
                  <div className="phone-business-stat"><span>SALES</span><b>{extras.business.sales}</b></div>
                  <div className="phone-business-stat"><span>WORKERS</span><b>{extras.business.workers}</b></div>
                </div>
                <button className="phone-business-action" onClick={() => onRestock(1000)}>RESTOCK · ₦1,000</button>
                <button className="phone-business-action" onClick={onHireWorker}>HIRE WORKER · ₦2,500</button>
                <p className="phone-business-hint">Workers sell while you&apos;re away. Restock keeps the shelves full.</p>
              </div>
            ) : (
              <div className="phone-business-cta">
                <div className="phone-business-hero"><Store size={26} /></div>
                <h4>Open a Suya Stand</h4>
                <p>Start a business in the Mainland. Stock it, hire help, and build a name.</p>
                <div className="phone-business-cost"><span>STARTUP</span><b>₦8,000</b></div>
                <button className="phone-business-buy" onClick={onBuyBusiness}>OPEN MY BUSINESS</button>
              </div>
            )}
          </div>
        );
      case "property":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>Property</h3><p>Homes & rentals</p></div>
            <div className="phone-property">
              <div className="phone-property-card">
                <span className="phone-property-icon"><Home size={18} /></span>
                <div><b>Surulere Starter Flat</b><small>₦18,000 · your own place</small></div>
              </div>
              <div className="phone-property-card">
                <span className="phone-property-icon"><Home size={18} /></span>
                <div><b>Shared Room · Yaba</b><small>₦1,200 / day rent</small></div>
              </div>
              <p className="phone-property-note">Rent is due daily. Pay on time to keep your record clean.</p>
            </div>
          </div>
        );
      case "transport":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>Transport</h3><p>Rides & the motor park</p></div>
            <div className="phone-transport">
              <div className="phone-transport-card">
                <span className="phone-transport-icon"><Navigation size={18} /></span>
                <div><b>Call a Keke</b><small>Hail a ride across the district</small></div>
              </div>
              <div className="phone-transport-card">
                <span className="phone-transport-icon"><Bike size={18} /></span>
                <div><b>Motor Park</b><small>Browse rides & upgrades</small></div>
              </div>
              <p className="phone-transport-note">Own a vehicle to earn better courier fares.</p>
            </div>
          </div>
        );
      case "feed":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>The Feed</h3><p>What the city is saying</p></div>
            <div className="phone-feed">
              {FEED_POSTS.map((post) => (
                <div className="phone-post" key={post.id}>
                  <span className="phone-post-avatar">{post.author.charAt(0)}</span>
                  <div className="phone-post-copy">
                    <b>{post.author} <small>#{post.tag}</small></b>
                    <p>{post.text}</p>
                    <small>♥ {post.likes}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case "settings":
        return (
          <div className="phone-app">
            <div className="phone-app-head"><h3>Settings</h3><p>Your account & privacy</p></div>
            <div className="phone-settings">
              <button className="phone-setting-row" onClick={onOpenProfile}><Users size={15} /> View public profile <ChevronRight size={14} /></button>
              <button className="phone-setting-row" onClick={onOpenStudio}><Sparkles size={15} /> Edit character <ChevronRight size={14} /></button>
              <div className="phone-setting-row"><ShieldCheck size={15} /> Privacy: friends only <b>ON</b></div>
              <div className="phone-setting-row"><PhoneIcon size={15} /> Sound & haptics <b>ON</b></div>
              <p className="phone-settings-note">STREETVERSE is a fictional world. Virtual naira has no real-world value.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="phone-overlay" role="dialog" aria-label="In-game smartphone">
      <div className="phone-frame">
        <div className="phone-notch" />
        <div className="phone-status">
          <span>{timeLabel}</span>
          <span className="phone-status-icons"><ShieldCheck size={11} /> 5G</span>
        </div>
        <div className="phone-screen">
          {renderApp()}
        </div>
        <div className="phone-dock">
          {APPS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                className={`phone-dock-app ${app === a.id ? "phone-dock-active" : ""}`}
                onClick={() => openApp(a.id)}
                aria-label={a.label}
              >
                <Icon size={17} />
                <small>{a.label}</small>
              </button>
            );
          })}
        </div>
        <button className="phone-home" onClick={onClose} aria-label="Close phone"><X size={18} /></button>
      </div>
    </div>
  );
}
