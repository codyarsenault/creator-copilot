import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ideaFactory } from "./ideaFactory.js";
import OpenAI from "openai";

const prisma = new PrismaClient();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// Optional OpenAI client (fallback to local generator if not configured)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function safeParseJson<T = unknown>(val: unknown): T | unknown {
  if (typeof val !== "string") return val as T;
  try {
    return JSON.parse(val) as T;
  } catch {
    return val as T;
  }
}

async function generateIdeasWithLLM(input: { niche: string; tone: string; goals: string[]; pillars: string[] }) {
  if (!openai) return ideaFactory(input);
  const { niche, tone, goals, pillars } = input;
  const prompt = `You are an expert short-form content strategist for creators. Generate 5 concise, high-signal video ideas tailored to the user's niche, tone, goals, and content pillars.

Return ONLY strict JSON with the following shape:
{
  "ideas": [
    {
      "hook": string,
      "outline": string[],
      "length": "20–30s",
      "caption": string,
      "hashtags": string[],
      "cta": string,
      "tips": string[],
      "pillar": string
    }
  ]
}

Rules:
- Exactly 5 items in ideas.
- outline must be 4–6 short beats.
- hashtags must be 3–6 items and each begins with #.
- pillar can be an empty string or one of the provided pillars.

Context:
- niche: ${niche}
- tone: ${tone}
- goals: ${goals.join(", ") || "—"}
- pillars: ${pillars.join(", ") || "—"}`;

  try {
    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 12000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You produce actionable content ideas and only respond with JSON when asked." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    }, { signal: controller.signal, timeout: timeoutMs });
    clearTimeout(timeout);
    const text = completion.choices?.[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(text);
    const ideas = Array.isArray(parsed) ? parsed : parsed.ideas;
    if (!Array.isArray(ideas)) throw new Error("Malformed LLM response");

    // Minimal normalization + schema safety
    console.log("[ideas] Using OpenAI LLM generation");
    return ideas.slice(0, 5).map((idea: any) => ({
      hook: String(idea.hook ?? "Here’s the underrated trick nobody told you"),
      outline: Array.isArray(idea.outline) ? idea.outline.map((b: any) => String(b)).slice(0, 8) : [
        "Hook (0–2s): pattern interrupt + promise",
        "Proof (2–6s): quick demo/receipts",
        "Steps (6–18s): 2–3 tight, visual steps",
        "Payoff (18–24s): show the result",
        "CTA (24–30s): save/follow for part 2",
      ],
      length: "20–30s",
      caption: String(idea.caption ?? "Save this for later!"),
      hashtags: (Array.isArray(idea.hashtags) ? idea.hashtags : []).map((t: any) => String(t)).filter(Boolean).slice(0, 6),
      cta: String(idea.cta ?? (goals.includes("monetize") ? "Follow + link in bio for resources" : "Follow for more in this series")),
      tips: (Array.isArray(idea.tips) ? idea.tips : [
        "Add on-screen text in first 1s",
        "Cut every 1.0–1.5s for pace",
        "Use captions; 70% watch muted",
      ]).map((t: any) => String(t)).slice(0, 6),
      pillar: String(idea.pillar ?? (pillars.length ? ` • Pillar: ${pillars[0]}` : ""))
    }));
  } catch (err) {
    // Fallback to local generator on any error
    const message = (err as any)?.name === 'AbortError' ? `timeout after ${process.env.OPENAI_TIMEOUT_MS || 12000}ms` : (err as Error)?.message ?? err;
    console.log("[ideas] LLM error or unavailable, falling back to local generator:", message);
    return ideaFactory(input);
  }
}

const IdeasBody = z.object({
  niche: z.string().min(1),
  tone: z.string().min(1),
  goals: z.array(z.string()).default([]),
  pillars: z.array(z.string()).default([]),
  userId: z.string().optional()
});

app.post("/api/ideas", async (req: Request, res: Response) => {
  const parsed = IdeasBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { niche, tone, goals, pillars, userId } = parsed.data;

  // Prefer LLM when available, otherwise fall back to local factory
  const ideas = await generateIdeasWithLLM({ niche, tone, goals, pillars });

  const records = await Promise.all(ideas.map(idea =>
    prisma.idea.create({
      data: {
        userId: userId ?? null,
        niche, tone,
        goals: JSON.stringify(goals),
        pillars: JSON.stringify(pillars),
        hook: idea.hook,
        caption: idea.caption,
        hashtags: JSON.stringify(idea.hashtags),
        outline: JSON.stringify(idea.outline),
        cta: idea.cta,
        tips: JSON.stringify(idea.tips)
      }
    })
  ));

  res.json({
    ideas: records.map(r => ({
      id: r.id,
      hook: r.hook,
      outline: JSON.parse(r.outline as unknown as string),
      length: "20–30s",
      caption: r.caption,
      hashtags: JSON.parse(r.hashtags as unknown as string),
      cta: r.cta,
      tips: JSON.parse(r.tips as unknown as string),
      pillar: pillars.length ? ` • Pillar: ${pillars[0]}` : ""
    }))
  });
});

app.get("/api/ideas", async (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || undefined;
  const where = userId ? { userId } : {};
  const ideas = await prisma.idea.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({
    ideas: ideas.map((r: any) => ({
      ...r,
      goals: safeParseJson(r.goals),
      pillars: safeParseJson(r.pillars),
      hashtags: safeParseJson(r.hashtags),
      outline: safeParseJson(r.outline),
      tips: safeParseJson(r.tips),
    }))
  });
});

// Dev login: creates a temporary user and returns a token (userId)
app.post("/api/auth/dev-login", async (_req: Request, res: Response) => {
  try {
    const user = await prisma.user.create({ data: { name: "Dev User" } });
    const token = user.id; // For dev, token is just the userId
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: "Failed to create dev user" });
  }
});

// OAuth stub routes for TikTok only
const TIKTOK_CLIENT_ID = process.env.TIKTOK_CLIENT_ID || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || "http://localhost:4000";

async function ensureUser(prismaClient: PrismaClient, providedId?: string): Promise<string> {
  if (providedId) {
    const existing = await prismaClient.user.findUnique({ where: { id: providedId } });
    if (existing) return existing.id;
    try {
      const created = await prismaClient.user.create({ data: { id: providedId, name: "OAuth User" } });
      return created.id;
    } catch {
      const retry = await prismaClient.user.findUnique({ where: { id: providedId } });
      if (retry) return retry.id;
      // Last resort: create without fixed id
      const created = await prismaClient.user.create({ data: { name: "OAuth User" } });
      return created.id;
    }
  } else {
    const created = await prismaClient.user.create({ data: { name: "OAuth User" } });
    return created.id;
  }
}

function registerTikTokAuth() {
  const callbackUrl = `${SERVER_BASE_URL.replace(/\/$/, '')}/auth/tiktok/callback`;

  app.get(`/auth/tiktok/start`, (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || "";
    const requestedScope = typeof req.query.scope === 'string' && req.query.scope.trim().length > 0
      ? req.query.scope.trim()
      : undefined;
    // If we don't have real creds, simulate
    if (!TIKTOK_CLIENT_ID || !TIKTOK_CLIENT_SECRET) {
      const state = `stub-tiktok-${Date.now()}-${userId}`;
      return res.redirect(`/auth/tiktok/callback?code=stub_code&state=${encodeURIComponent(state)}`);
    }
    const scopeRaw = requestedScope ?? "user.info.basic,video.list";
    const scope = encodeURIComponent(scopeRaw);
    const state = encodeURIComponent(`uid:${userId}`);
    const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(TIKTOK_CLIENT_ID)}&scope=${scope}&response_type=code&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
    console.log("[tiktok] start", {
      clientIdTail: TIKTOK_CLIENT_ID.slice(-4),
      callbackUrl,
      scope: scopeRaw
    });
    res.redirect(url);
  });

  app.get(`/auth/tiktok/callback`, async (req: Request, res: Response) => {
    const code = (req.query.code as string) || "";
    const state = (req.query.state as string) || "";
    const userId = state.startsWith("uid:") ? state.slice(4) : state.split("-").pop() || "";

    if (!TIKTOK_CLIENT_ID || !TIKTOK_CLIENT_SECRET) {
      // Stub: persist a placeholder account for the user
      const ensuredUserId = await ensureUser(prisma, userId);
      const acct = await prisma.tikTokAccount.create({
        data: {
          userId: ensuredUserId,
          tiktokUserId: "stub_user",
          username: "stub_account",
          accessToken: `stub-token-${Date.now()}`,
          scope: "user.info.basic,video.list"
        }
      });
      return res.json({ ok: true, platform: "tiktok", connected: true, account: acct });
    }

    try {
      if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

      // Exchange code for tokens
      const tokenResp = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: TIKTOK_CLIENT_ID,
          client_secret: TIKTOK_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: callbackUrl
        })
      });
      const tokenJson: any = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok) {
        console.error("[tiktok] token exchange failed", { status: tokenResp.status, body: tokenJson });
        return res.status(502).json({ ok: false, error: "TikTok token exchange failed" });
      }

      const accessToken: string = tokenJson.access_token;
      const refreshToken: string | undefined = tokenJson.refresh_token;
      const expiresIn: number | undefined = tokenJson.expires_in;
      const openId: string = tokenJson.open_id || tokenJson.open_id_v2 || "";
      const scopeGranted: string = tokenJson.scope || "";
      if (!accessToken || !openId) {
        console.error("[tiktok] missing fields in token response", tokenJson);
        return res.status(502).json({ ok: false, error: "TikTok token response incomplete" });
      }

      // Optional: fetch basic user info for username
      let username: string | undefined = undefined;
      try {
        const infoResp = await fetch("https://open.tiktokapis.com/v2/user/info/", {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const infoJson: any = await infoResp.json().catch(() => ({}));
        if (infoResp.ok) {
          username = infoJson?.data?.user?.display_name || infoJson?.data?.user?.username;
        }
      } catch {}

      const ensuredUserId = await ensureUser(prisma, userId);
      const acct = await prisma.tikTokAccount.create({
        data: {
          userId: ensuredUserId,
          tiktokUserId: openId,
          username,
          accessToken,
          refreshToken,
          expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
          scope: scopeGranted
        }
      });
      res.json({ ok: true, platform: "tiktok", connected: true, account: acct });
    } catch (e) {
      console.error("[tiktok] callback failed", e);
      res.status(500).json({ ok: false, error: "Failed to connect TikTok" });
    }
  });

  // Recent videos endpoint (stubbed if no real creds)
  app.get("/api/tiktok/recent-videos", async (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || "";
    const acct = await prisma.tikTokAccount.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    if (!acct) return res.status(404).json({ error: "Not connected" });
    if (!TIKTOK_CLIENT_ID || !TIKTOK_CLIENT_SECRET) {
      return res.json({
        videos: [
          { id: "v1", views: 12456, likes: 1234, comments: 45, shares: 12, lengthSec: 23, caption: "Quick toddler hack that actually works" },
          { id: "v2", views: 8450, likes: 932, comments: 30, shares: 8, lengthSec: 27, caption: "3 bedtime routine tips in 30s" }
        ],
        stub: true
      });
    }
    // Require scope
    if (!String(acct.scope || "").includes("video.list")) {
      return res.status(400).json({ error: "missing_scope", needed: "video.list" });
    }

    try {
      const apiUrl = "https://open.tiktokapis.com/v2/video/list/";
      const requestedFields = "id,title,create_time,duration";
      const urlWithFields = `${apiUrl}?fields=${encodeURIComponent(requestedFields)}`;
      const resp = await fetch(urlWithFields, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${acct.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
          Accept: "application/json"
        },
        body: new URLSearchParams({ max_count: String(10) })
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error("[tiktok] video.list failed", { status: resp.status, body: data });
        return res.status(502).json({ error: "tiktok_api", status: resp.status });
      }

      const videosRaw: any[] = data?.data?.videos || data?.data?.items || [];
      const videos = videosRaw.map((v: any) => ({
        id: v.id || v.video_id,
        views: v.statistics?.play_count ?? v.stats?.views ?? 0,
        likes: v.statistics?.like_count ?? v.stats?.likes ?? 0,
        comments: v.statistics?.comment_count ?? v.stats?.comments ?? 0,
        shares: v.statistics?.share_count ?? v.stats?.shares ?? 0,
        lengthSec: v.duration || v.video_duration_sec || v.video?.duration || null,
        caption: v.title || v.description || v.caption || v.share_info?.share_title || ""
      }));
      return res.json({ videos });
    } catch (e) {
      console.error("[tiktok] recent-videos error", e);
      return res.status(500).json({ error: "unexpected" });
    }
  });

  // Analysis endpoint that summarizes recent performance and produces suggestions
  app.get("/api/tiktok/analysis", async (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || "";
    const acct = await prisma.tikTokAccount.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    if (!acct) return res.status(404).json({ error: "Not connected" });
    if (!TIKTOK_CLIENT_ID || !TIKTOK_CLIENT_SECRET) {
      return res.json({ error: "stub_mode" });
    }

    // Fetch recent videos via same API
    try {
      const apiUrl = "https://open.tiktokapis.com/v2/video/list/";
      const requestedFields = "id,title,create_time,duration";
      const urlWithFields = `${apiUrl}?fields=${encodeURIComponent(requestedFields)}`;
      const resp = await fetch(urlWithFields, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${acct.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
          Accept: "application/json"
        },
        body: new URLSearchParams({ max_count: String(20) })
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error("[tiktok] video.list for analysis failed", { status: resp.status, body: data });
        return res.status(502).json({ error: "tiktok_api", status: resp.status });
      }
      const videosRaw: any[] = data?.data?.videos || [];
      const videos = videosRaw.map((v: any) => ({
        id: v.id || v.video_id,
        title: v.title || v.description || "",
        createdAt: v.create_time ? new Date(Number(v.create_time) * 1000) : null,
        durationSec: v.duration || null,
      })).filter((v: any) => v.createdAt);

      const total = videos.length;
      const durations = videos.map(v => Number(v.durationSec || 0)).filter(n => n > 0).sort((a,b)=>a-b);
      const avgDurationSec = durations.length ? Math.round(durations.reduce((a,b)=>a+b,0)/durations.length) : 0;
      const medianDurationSec = durations.length ? durations[Math.floor(durations.length/2)] : 0;

      const days = videos.map(v => v.createdAt!.getTime()).sort((a,b)=>a-b);
      const daysCovered = days.length ? Math.max(1, Math.ceil((days[days.length-1]-days[0])/(1000*60*60*24))) : 0;
      const cadencePerWeek = daysCovered ? Number(((total / daysCovered) * 7).toFixed(2)) : 0;

      // Posting distributions
      const byWeekday: Record<string, number> = {"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0};
      const byHour: Record<string, number> = {};
      for (let i=0;i<24;i++) byHour[String(i)] = 0;
      videos.forEach(v => { byWeekday[String(v.createdAt!.getDay())]++; byHour[String(v.createdAt!.getHours())]++; });

      // Simple keywords
      const stop = new Set(["the","a","and","or","to","for","in","on","of","with","at","is","it","this","that","my","your","our","how","why","what","you"]);
      const counts: Record<string, number> = {};
      videos.forEach(v => {
        const words = String(v.title||"").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
        words.forEach(w => { if (!stop.has(w) && w.length >= 3) counts[w] = (counts[w]||0)+1; });
      });
      const keywords = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));

      // Heuristic suggestions
      const suggestions: string[] = [];
      if (medianDurationSec > 35) suggestions.push("Median video is long; test 20–30s cuts with faster first 3s.");
      if (medianDurationSec < 15) suggestions.push("Videos are very short; add one visual step to lift watch time.");
      const bestHours = Object.entries(byHour).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([h])=>Number(h));
      if (bestHours.length) suggestions.push(`Post when your audience is active: ~${bestHours.map(h=>`${h}:00`).join(', ')}.`);
      if (keywords.length) suggestions.push(`Lean into themes: ${keywords.slice(0,5).map(k=>k.word).join(', ')}.`);

      // Optional LLM refinement
      if (openai) {
        try {
          const prompt = `You are a short-form content coach. Given stats, propose 5 specific changes to improve TikTok performance. Keep each suggestion under 18 words.\n\nStats:\nTotal: ${total}\nMedian length: ${medianDurationSec}s\nAvg length: ${avgDurationSec}s\nCadence/week: ${cadencePerWeek}\nTop keywords: ${keywords.slice(0,8).map(k=>k.word+`(${k.count})`).join(', ')}\nTop hours: ${bestHours.join(', ')}\n`;
          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [ { role: "user", content: prompt } ],
            temperature: 0.5
          });
          const add = completion.choices?.[0]?.message?.content?.split(/\n|\r/).map(s=>s.trim()).filter(Boolean).slice(0,5) || [];
          suggestions.push(...add);
        } catch {}
      }

      return res.json({
        summary: { total, daysCovered, cadencePerWeek, avgDurationSec, medianDurationSec },
        postingTimes: { byWeekday, byHour },
        keywords,
        suggestions
      });
    } catch (e) {
      console.error("[tiktok] analysis error", e);
      return res.status(500).json({ error: "unexpected" });
    }
  });
}

registerTikTokAuth();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
