export type IdeaInput = {
  niche: string;
  tone: string;
  goals: string[];
  pillars: string[];
};

const SEED_HOOKS: Record<string, string[]> = {
  Fitness: [
    "I trained wrong for years — do this instead",
    "The 20-second warm-up that fixes your form",
    "Stop doing this if you want visible results",
  ],
  Parenting: [
    "Three toddler hacks I wish I knew sooner",
    "Why your bedtime routine keeps failing (fix in 30 secs)",
    "If your 3-year-old does this, try this instead",
  ],
};

function hashTagsFor(niche: string) {
  const base: Record<string, string[]> = {
    Fitness: ["fitness", "gymtok", "wellness"],
    Parenting: ["parentingtips", "toddlers", "momtok"],
  };
  const chosen = base[niche] || ["creator", "tips", "howto"];
  return ["#" + niche.toLowerCase().replace(/\s+/g, ""), ...chosen.map(t => "#" + t)].slice(0, 4);
}

export function ideaFactory(input: IdeaInput) {
  const { niche, tone, goals, pillars } = input;
  const hooks = SEED_HOOKS[niche] ?? [
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

  const ideas = Array.from({ length: 5 }).map((_, i) => {
    const hook = hooks[(i + Math.floor(Math.random() * hooks.length)) % hooks.length];
    return {
      hook,
      outline: beats,
      length: "20–30s",
      caption: `${hook} (${tone.toLowerCase()}) — save for later!`,
      hashtags: hashTagsFor(niche),
      cta: goals.includes("monetize") ? "Follow + link in bio for resources" : "Follow for more in this series",
      tips: [
        "Add on-screen text in first 1s",
        "Cut every 1.0–1.5s for pace",
        "Use captions; 70% watch muted",
      ],
      pillar: pillars.length ? ` • Pillar: ${pillars[Math.floor(Math.random() * pillars.length)]}` : "",
    };
  });

  return ideas;
}
