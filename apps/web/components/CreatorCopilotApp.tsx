"use client";

import React, { useMemo, useState } from "react";
import { Sparkles, Link as LinkIcon, Video as VideoIcon, Upload, Hash, Lightbulb, Check, Copy, AlertTriangle } from "lucide-react";

// Simple utility
const classNames = (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(" ");

type Idea = {
  id?: string | number;
  hook: string;
  outline: string[];
  length: string;
  caption: string;
  hashtags: string[];
  cta: string;
  tips: string[];
  pillar: string;
};

type Task = {
  id: string;
  title: string;
  priority: "high" | "med" | "low";
  reason: string;
  action: string;
};

type TrendItem = { tag?: string; score: number; title?: string; url?: string };

const NICHES = [
  "Fitness",
  "Parenting",
  "Beauty",
  "Fashion",
  "DIY / Home",
  "Gaming",
  "Finance",
  "Food",
  "Tech",
  "Travel",
  "Education",
];

const GOALS = [
  { id: "followers", label: "Grow followers" },
  { id: "engagement", label: "Boost engagement" },
  { id: "consistency", label: "Post consistently" },
  { id: "monetize", label: "Monetize" },
];

const TONES = ["Educational", "Entertaining", "Inspiring", "Relatable", "Authority"];

const seedHooks: Record<string, string[]> = {
  Fitness: [
    "I trained wrong for years — do this instead",
    "The 20‑second warm‑up that fixes your form",
    "Stop doing this if you want visible results",
  ],
  Parenting: [
    "Three toddler hacks I wish I knew sooner",
    "Why your bedtime routine keeps failing (fix in 30 secs)",
    "If your 3‑year‑old does this, try this instead",
  ],
  Beauty: [
    "This $10 product beats my luxury favorite",
    "You’re probably applying this wrong — quick fix",
    "Dewy skin in 25 seconds? Watch this",
  ],
  Fashion: [
    "Style this ONE piece 5 ways",
    "The silhouette trick most people miss",
    "3 outfit formulas that always work",
  ],
  "DIY / Home": [
    "The $12 fix that makes renters look pro",
    "Stop wasting time on this tool — use this",
    "I ruined my first project — here’s the fix",
  ],
  Gaming: [
    "Settings that instantly boost FPS",
    "3 movement tricks your lobby doesn’t know",
    "Tier list hot takes (don’t @ me)",
  ],
  Finance: [
    "The 30‑second budget rule I live by",
    "I stopped doing this and my savings jumped",
    "What I’d tell my 20‑year‑old self about money",
  ],
  Food: [
    "5‑ingredient dinner that slaps (and is cheap)",
    "You’re seasoning wrong — try this order",
    "Crispy every time — the science in 20s",
  ],
  Tech: [
    "I automated this in 60 seconds — here’s how",
    "Underrated tool that saves me hours",
    "Stop doing this in your workflow",
  ],
  Travel: [
    "Pack like a pro with this 1 hack",
    "I found $29 flights doing this",
    "Avoid these mistakes in [city]",
  ],
  Education: [
    "Learn X in 30 seconds (no fluff)",
    "You’re memorizing wrong — do this",
    "Explained like you’re 5: [topic]",
  ],
};

function hashTagsFor(niche: string) {
  const base: Record<string, string[]> = {
    Fitness: ["fitness", "gymtok", "wellness"],
    Parenting: ["parentingtips", "toddlers", "momtok"],
    Beauty: ["skincare", "makeuptips", "beautyhacks"],
    Fashion: ["outfitideas", "stylehack", "ootd"],
    "DIY / Home": ["diy", "homehacks", "rentertips"],
    Gaming: ["gaming", "fps", "gamertips"],
    Finance: ["moneymatters", "financetips", "sidehustle"],
    Food: ["easyrecipes", "foodtok", "homecooking"],
    Tech: ["productivity", "tech", "automation"],
    Travel: ["traveltips", "budgettravel", "carryon"],
    Education: ["learnontiktok", "studytok", "edutok"],
  };
  const chosen = base[niche] || ["creator", "tips", "howto"];
  return ["#" + niche.toLowerCase().split(" ").join(""), ...chosen.map((t) => "#" + t)];
}

function ideaFactory({ niche, tone, goals, pillars }: { niche: string; tone: string; goals: string[]; pillars: string[]; }): Idea[] {
  const hooks = seedHooks[niche] || [
    "Here’s the underrated trick nobody told you",
    "I wasted months until I tried this",
    "Do this once and thank me later",
  ];

  const beats = [
    "Hook (0–2s): pattern interrupt + promise",
    "Proof (2–6s): quick demo/receipts",
    "Steps (6–18s): 2–3 tight, visual steps",
    "Payoff (18–24s): show the result",
    "CTA (24–30s): save/follow for part 2",
  ];

  const pillar = pillars.length ? ` • Pillar: ${pillars[Math.floor(Math.random()*pillars.length)]}` : "";

  return Array.from({ length: 5 }).map((_, i): Idea => {
    const hook = hooks[(i + Math.floor(Math.random() * hooks.length)) % hooks.length];
    return {
      id: i + 1,
      hook,
      outline: beats,
      length: "20–30s",
      caption: `${hook} (${tone.toLowerCase()}) — save for later!`,
      hashtags: hashTagsFor(niche).slice(0, 4),
      cta: goals.includes("monetize") ? "Follow + link in bio for resources" : "Follow for more in this series",
      tips: [
        "Add on‑screen text in first 1s",
        "Cut every 1.0–1.5s for pace",
        "Use captions; 70% watch muted",
      ],
      pillar,
    };
  });
}

type ToggleProps = { label: string; checked: boolean; onChange: (next: boolean) => void };
const Toggle = ({ label, checked, onChange }: ToggleProps) => (
  <label className="flex items-center justify-between p-3 rounded-2xl border bg-white/70 backdrop-blur hover:bg-white transition cursor-pointer">
    <span className="text-sm font-medium">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={classNames(
        "relative inline-flex h-6 w-11 items-center rounded-full transition",
        checked ? "bg-indigo-600" : "bg-gray-300"
      )}
    >
      <span
        className={classNames(
          "inline-block h-4 w-4 transform rounded-full bg-white transition",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  </label>
);

type StatProps = { label: string; value: string | number; icon: React.ComponentType<{ size?: number }> };
const Stat = ({ label, value, icon: Icon }: StatProps) => (
  <div className="flex items-center gap-3 p-4 rounded-2xl border bg-white/70">
    <div className="p-2 rounded-xl border"><Icon size={18} /></div>
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  </div>
);

type IdeaCardProps = { idea: Idea; onCopy: (idea: Idea) => void };
const IdeaCard = ({ idea, onCopy }: IdeaCardProps) => (
  <div className="rounded-2xl border p-4 bg-white/80">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <Lightbulb size={18} />
        <h4 className="font-semibold">Idea: {idea.hook}</h4>
      </div>
      <button
        onClick={() => onCopy(idea)}
        className="text-sm px-3 py-1.5 rounded-xl border hover:bg-gray-50 flex items-center gap-1"
      >
        <Copy size={14} /> Copy
      </button>
    </div>
    <div className="mt-2 text-sm text-gray-700">{idea.pillar}</div>
    <ul className="mt-3 text-sm list-disc pl-5 space-y-1">
      {idea.outline.map((b: string, i: number) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="px-2 py-1 rounded-lg border">Length: {idea.length}</span>
      {idea.hashtags.map((t: string, i: number) => (
        <span key={i} className="px-2 py-1 rounded-lg border flex items-center gap-1"><Hash size={12} />{t}</span>
      ))}
    </div>
    <div className="mt-3 text-sm"><span className="font-medium">Caption:</span> {idea.caption}</div>
    <div className="mt-3 text-sm">
      <span className="font-medium">CTA:</span> {idea.cta}
    </div>
    <div className="mt-3 text-sm">
      <span className="font-medium">Execution tips:</span>
      <ul className="list-disc pl-5 mt-1 space-y-1">
        {idea.tips.map((t: string, i: number) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
    <div className="mt-3 text-xs">
      <a
        href={`https://www.tiktok.com/search?q=${encodeURIComponent(idea.hook)}`}
        target="_blank"
        rel="noreferrer"
        className="underline text-indigo-600 hover:text-indigo-700"
      >
        See similar on TikTok
      </a>
    </div>
  </div>
);

export default function CreatorCopilotApp() {
  const [platforms, setPlatforms] = useState<{ tiktok: boolean }>({ tiktok: true });
  const [niche, setNiche] = useState<string>("Parenting");
  const [customNiche, setCustomNiche] = useState<string>("");
  const [tone, setTone] = useState<string>("Relatable");
  const [goals, setGoals] = useState<string[]>(["followers", "engagement"]);
  const [pillars, setPillars] = useState<string[]>(["How‑to", "Myth‑busting", "Behind‑the‑scenes"]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [serverTried, setServerTried] = useState<boolean>(false);
  const [serverOK, setServerOK] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState<boolean>(false);
  const [deltas, setDeltas] = useState<{day:number;week:number;month:number} | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{ hashtags: TrendItem[]; sounds: TrendItem[]; date?: string } | null>(null);
  const [trendsLoading, setTrendsLoading] = useState<boolean>(false);

  const activeNiche = customNiche.trim() || niche;

  const DEFAULT_SERVER =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SERVER_URL) ||
    (typeof window !== "undefined" && (window as any).SERVER_URL) ||
    "http://localhost:4000"; // sane default for local dev
  const [serverUrl, setServerUrl] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem('cc_server_url') || DEFAULT_SERVER;
    }
    return DEFAULT_SERVER;
  });
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem('cc_server_url', serverUrl);
    }
  }, [serverUrl]);

  const DEV_TOKEN_KEY = "cc_dev_token";

  const ensureDevToken = async () => {
    if (!serverUrl) return null;
    try {
      let token = typeof window !== "undefined" ? window.localStorage.getItem(DEV_TOKEN_KEY) : null;
      if (!token) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (/ngrok/.test(serverUrl)) headers['ngrok-skip-browser-warning'] = 'true';
        const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/auth/dev-login`, { method: 'POST', headers });
        if (res.ok) {
          const data = await res.json();
          token = data?.token || null;
          if (token && typeof window !== "undefined") {
            window.localStorage.setItem(DEV_TOKEN_KEY, token);
          }
        }
      }
      return token;
    } catch {
      return null;
    }
  };

  const handleGoalToggle = (id: string) => {
    setGoals((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const handleTikTokToggle = (val: boolean) => setPlatforms({ tiktok: val });

  const generatedIdeas = useMemo<Idea[]>(() => ideas, [ideas]);

  const onGenerate = async () => {
    if (loading) return;
    setLoading(true);
    // Try server first
    if (serverUrl) {
      try {
        const token = await ensureDevToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (/ngrok/.test(serverUrl)) headers['ngrok-skip-browser-warning'] = 'true';
        const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/ideas`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ niche: activeNiche, tone, goals, pillars, userId: token || undefined })
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.ideas)) {
            setIdeas(data.ideas);
            setServerOK(true);
            setServerTried(true);
            setLoading(false);
            return;
          }
        }
        setServerOK(false);
        setServerTried(true);
      } catch (err) {
        setServerOK(false);
        setServerTried(true);
      }
    }
    // No local fallback; mark server as unreachable
    setServerOK(false);
    setLoading(false);
  };

  const onCopy = async (idea: Idea) => {
    const text = `HOOK: ${idea.hook}

OUTLINE:
- ${idea.outline.join("\\n- ")}

LENGTH: ${idea.length}

CAPTION: ${idea.caption}

HASHTAGS: ${idea.hashtags.join(" ")}

CTA: ${idea.cta}

TIPS:
- ${idea.tips.join("\\n- ")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId((idea.id as string | number) ?? null);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const refreshTasks = async () => {
    try {
      setTasksLoading(true);
      const token = await ensureDevToken();
      if (!serverUrl || !token) {
        setTasks([]);
        setTasksLoading(false);
        return;
      }
      const qs = new URLSearchParams({ userId: token });
      const headers: Record<string, string> = {};
      if (/ngrok/.test(serverUrl)) headers['ngrok-skip-browser-warning'] = 'true';
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/tasks?${qs.toString()}`, { headers });
      const data = await res.json();
      if (Array.isArray(data.tasks)) {
        setTasksError(null);
        setTasks(data.tasks);
        if (data?.deltas) setDeltas(data.deltas);
      } else {
        setTasks([]);
        setTasksError(data?.error ? String(data.error) : `Server returned status ${res.status}`);
      }
    } catch {
      setTasks([]);
      setTasksError("Failed to load tasks");
    } finally {
      setTasksLoading(false);
    }
  };

  const refreshTrends = async () => {
    try {
      setTrendsLoading(true);
      const headers: Record<string, string> = {};
      if (/ngrok/.test(serverUrl)) headers['ngrok-skip-browser-warning'] = 'true';
      const qs = new URLSearchParams({ niche: activeNiche });
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/trends?${qs.toString()}`, { headers });
      const data = await res.json();
      if (data?.hashtags && data?.sounds) setTrends({ hashtags: data.hashtags, sounds: data.sounds, date: data.date });
    } catch {
      setTrends(null);
    } finally {
      setTrendsLoading(false);
    }
  };

  React.useEffect(() => {
    // Autoload tasks when mounting or serverUrl changes
    refreshTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);


  // Primitive "video feedback" form (no real video analysis in-browser)
  const [vf, setVf] = useState({ length: 23, captions: true, trendingSound: false, firstTextSec: 1, cuts: 10 });
  const feedback = useMemo(() => {
    const scoreParts = [];
    let score = 50;
    if (vf.length >= 18 && vf.length <= 32) { score += 10; scoreParts.push("Ideal length"); } else { scoreParts.push("Trim/extend to 20–30s"); }
    if (vf.captions) { score += 10; scoreParts.push("Captions on"); } else { scoreParts.push("Add captions (many watch muted)"); }
    if (vf.firstTextSec <= 1) { score += 10; scoreParts.push("Text in first second"); } else { scoreParts.push("Add text in first 1s for hook"); }
    if (vf.cuts >= 8) { score += 10; scoreParts.push("Good pacing"); } else { scoreParts.push("Increase cuts to ~1s"); }
    if (vf.trendingSound) { score += 5; scoreParts.push("Trending sound helps"); }

    const tips = [
      vf.firstTextSec > 1 ? "Overlay a 3–5 word promise at 0.2s" : "Keep first frame high‑contrast text",
      vf.cuts < 8 ? "Cut to a new angle/overlay every 0.8–1.2s" : "Hold payoff 1.5s then CTA",
      vf.length > 32 ? "Trim setup; jump cut the fluff" : vf.length < 18 ? "Add one visual step to increase watch time" : "Consider a micro‑tease for part 2",
    ];

    return { score: Math.min(100, score), scoreParts, tips };
  }, [vf]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Sparkles className="text-indigo-600" /> Creator Co‑Pilot</h1>
            <p className="text-sm text-gray-600">Know what to post, how to improve, and grow faster — personalized to your niche.</p>
            {serverTried && (
              <p className={classNames("mt-1 text-xs", serverOK ? "text-green-600" : "text-amber-600")}>{serverOK ? "Connected to server API" : "Server API not reachable"}</p>
            )}
          </div>
          <div className="hidden md:flex gap-3">
            <Stat label="Connected" value={(platforms.tiktok ? 1 : 0) + "/1"} icon={LinkIcon} />
            <Stat label="Ideas queued" value={generatedIdeas.length} icon={Lightbulb} />
          </div>
        </header>

        {/* Setup */}
        <section className="grid md:grid-cols-2 gap-5 mt-6">
          <div className="rounded-2xl border p-4 bg-white/70 backdrop-blur">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><LinkIcon size={18} /> Connect TikTok</h3>
            <div className="space-y-3">
              <Toggle label="TikTok" checked={platforms.tiktok} onChange={(v) => handleTikTokToggle(v)} />
              <div className="text-xs">
                <label className="flex items-center gap-2">
                  <span>Server URL</span>
                  <input value={serverUrl} onChange={(e)=>setServerUrl(e.target.value)} className="px-2 py-1 rounded-lg border w-full" placeholder="http://localhost:4000" />
                </label>
              </div>
              <button
                onClick={async () => {
                  const token = await ensureDevToken();
                  if (!serverUrl) return;
                  const base = `${serverUrl.replace(/\/$/, '')}/auth/tiktok/start`;
                  const qs = new URLSearchParams();
                  if (token) qs.set('userId', token);
                  // Request minimal permitted scope by default; add more once approved
                  qs.set('scope', 'user.info.basic');
                  const url = `${base}?${qs.toString()}`;
                  window.location.href = url;
                }}
                className="text-sm px-3 py-1.5 rounded-xl border hover:bg-gray-50"
              >
                Start TikTok OAuth
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">This toggle simulates a TikTok connection for now. In production, wire to TikTok OAuth.</p>
            <p className="text-xs text-gray-500">Optional: set <code>window.SERVER_URL = "http://localhost:4000"</code> in dev to hit the local API.</p>
          </div>

          <div className="rounded-2xl border p-4 bg-white/70 backdrop-blur">
            <h3 className="font-semibold mb-3">Your profile</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Niche</label>
                <select value={niche} onChange={(e) => setNiche(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border bg-white">
                  {NICHES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Custom niche (optional)</label>
                <input value={customNiche} onChange={(e) => setCustomNiche(e.target.value)} placeholder="e.g., Montessori parenting" className="w-full mt-1 px-3 py-2 rounded-xl border bg-white" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Tone</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border bg-white">
                  {TONES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Content pillars (comma‑sep)</label>
                <input
                  value={pillars.join(', ')}
                  onChange={(e) => setPillars(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border bg-white"
                />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xs text-gray-600 mb-1">Goals</div>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleGoalToggle(g.id)}
                    className={classNames(
                      "text-sm px-3 py-1.5 rounded-xl border",
                      goals.includes(g.id) ? "bg-indigo-600 text-white border-indigo-600" : "hover:bg-gray-50"
                    )}
                  >
                    {goals.includes(g.id) ? <Check size={14} className="inline mr-1" /> : null}
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <section className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={onGenerate}
            disabled={loading}
            className={classNames(
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white shadow-sm",
              loading ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
            )}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={18} /> Generate 5 ideas
              </>
            )}
          </button>
          <span className="text-xs text-gray-600">Personalized to {activeNiche} · Tone: {tone} · Goals: {goals.join(', ') || '—'}</span>
        </section>

        {/* Ideas */}
        <section className="mt-4 grid lg:grid-cols-2 gap-4">
          {generatedIdeas.length === 0 ? (
            <div className="col-span-full rounded-2xl border p-6 bg-white/70 text-center text-gray-600">
              <p className="flex items-center justify-center gap-2"><Lightbulb size={18} /> No ideas yet. Click <span className="font-medium">Generate 5 ideas</span> to start.</p>
            </div>
          ) : (
            generatedIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} onCopy={onCopy} />
            ))
          )}
        </section>

        {/* Tasks */}
        <section className="mt-6 grid lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border p-4 bg-white/70">
            <h3 className="font-semibold mb-2">Tasks</h3>
            <div className="flex items-center gap-3 text-sm">
              <button onClick={refreshTasks} className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50">Refresh</button>
              {deltas ? (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>Δ1d: {deltas.day >=0 ? '+' : ''}{deltas.day}</span>
                  <span>Δ7d: {deltas.week >=0 ? '+' : ''}{deltas.week}</span>
                  <span>Δ30d: {deltas.month >=0 ? '+' : ''}{deltas.month}</span>
                </div>
              ) : null}
            </div>
            {tasksLoading ? (
              <p className="text-sm text-gray-600 mt-3">Loading tasks…</p>
            ) : tasksError ? (
              <p className="text-sm text-amber-700 mt-3">{tasksError === 'Not connected' ? 'Connect TikTok first, then Refresh.' : tasksError === 'tiktok_api' ? 'TikTok API error (check scopes and reconnect), then Refresh.' : tasksError}</p>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-gray-600 mt-3">No tasks yet. Click Refresh.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {tasks.map(t => (
                  <li key={t.id} className="rounded-xl border p-3 bg-white/80">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{t.title}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${t.priority==='high'?'bg-red-50 text-red-700 border-red-200':t.priority==='med'?'bg-amber-50 text-amber-700 border-amber-200':'bg-green-50 text-green-700 border-green-200'}`}>{t.priority}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Reason: {t.reason}</div>
                    <div className="text-xs mt-1"><span className="text-gray-600">Action:</span> {t.action}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border p-4 bg-white/70">
            <h3 className="font-semibold mb-2">Today’s trends</h3>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={refreshTrends} className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50">Refresh</button>
              {trends?.date ? <span className="text-xs text-gray-500">{trends.date}</span> : null}
            </div>
            {trendsLoading ? (
              <p className="text-sm text-gray-600 mt-3">Loading trends…</p>
            ) : !trends ? (
              <p className="text-sm text-gray-600 mt-3">Click Refresh to load niche hashtags and sounds.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="text-xs font-medium mb-1">Hashtags</div>
                  <ul className="space-y-1 text-sm">
                    {trends.hashtags.map((h, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <a href={`https://www.tiktok.com/tag/${encodeURIComponent(h.tag?.replace('#','') || '')}`} target="_blank" rel="noreferrer" className="underline">{h.tag}</a>
                        <span className="text-xs text-gray-500">{h.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Sounds</div>
                  <ul className="space-y-1 text-sm">
                    {trends.sounds.map((s, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span>{s.title}</span>
                        <span className="text-xs text-gray-500">{s.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Video feedback */}
        <section className="mt-6 grid lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border p-4 bg-white/70">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><VideoIcon size={18} /> Quick video feedback (simulator)</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex flex-col">
                <span className="text-xs text-gray-600">Length (seconds)</span>
                <input type="number" min={5} max={120} value={vf.length} onChange={(e) => setVf({ ...vf, length: Number(e.target.value) })} className="mt-1 px-3 py-2 rounded-xl border bg-white" />
              </label>
              <label className="flex flex-col">
                <span className="text-xs text-gray-600">First on‑screen text shown by… (sec)</span>
                <input type="number" min={0} max={10} value={vf.firstTextSec} onChange={(e) => setVf({ ...vf, firstTextSec: Number(e.target.value) })} className="mt-1 px-3 py-2 rounded-xl border bg-white" />
              </label>
              <label className="flex items-center gap-2 mt-1">
                <input type="checkbox" checked={vf.captions} onChange={(e) => setVf({ ...vf, captions: e.target.checked })} />
                <span>Captions enabled</span>
              </label>
              <label className="flex items-center gap-2 mt-1">
                <input type="checkbox" checked={vf.trendingSound} onChange={(e) => setVf({ ...vf, trendingSound: e.target.checked })} />
                <span>Using trending sound</span>
              </label>
              <label className="flex flex-col col-span-2">
                <span className="text-xs text-gray-600">Number of cuts/transitions</span>
                <input type="number" min={0} max={60} value={vf.cuts} onChange={(e) => setVf({ ...vf, cuts: Number(e.target.value) })} className="mt-1 px-3 py-2 rounded-xl border bg-white" />
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-3 flex items-center gap-1"><AlertTriangle size={14}/> This is a local simulator. In a real build, you’d upload a video and run server‑side analysis (captions, cut detection, hook frames).</p>
          </div>

          <div className="rounded-2xl border p-4 bg-white/70">
            <h3 className="font-semibold mb-2">Report</h3>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-2xl border grid place-items-center text-2xl font-bold">{feedback.score}</div>
              <div className="text-sm">
                <div className="text-gray-600">Heuristic score</div>
                <div className="text-xs text-gray-500">Based on length, captions, hook timing, pacing, and sound.</div>
              </div>
            </div>
            <div className="mt-3 text-sm">
              <div className="font-medium">What’s working</div>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {feedback.scoreParts.filter(p => ["Ideal length","Captions on","Text in first second","Good pacing","Trending sound helps"].includes(p)).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <div className="font-medium mt-3">What to improve</div>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {feedback.scoreParts.filter(p => !["Ideal length","Captions on","Text in first second","Good pacing","Trending sound helps"].includes(p)).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div className="mt-3 text-sm">
              <div className="font-medium">Actionable tips</div>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {feedback.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-10 text-xs text-gray-500">
          <div>🚀 Roadmap hooks: OAuth connections · Server AI ideas · Real video analysis (transcripts, cut detection) · Posting calendar.</div>
        </footer>
      </div>
    </div>
  );
}
