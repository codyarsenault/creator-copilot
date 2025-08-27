import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import OpenAI from "openai";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import Tesseract from "tesseract.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const prisma = new PrismaClient();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());
// Configure ffmpeg binaries
// @ts-ignore
ffmpeg.setFfmpegPath(ffmpegStatic as any);
// @ts-ignore
ffmpeg.setFfprobePath((ffprobeStatic as any)?.path);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname) || '.mp4'}`)
  }),
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_MB || "200", 10)) * 1024 * 1024 }
});

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
  if (!openai) throw new Error("LLM not configured");
  const { niche, tone, goals, pillars } = input;
  const goalDirectives: Record<string, string[]> = {
    followers: [
      "Hook must be broad/relatable; prioritize shareability",
      "Clear CTA to follow for part 2 or series",
    ],
    engagement: [
      "Include a comment bait or question",
      "Prompt stitches/duets where relevant",
    ],
    consistency: [
      "Ideas should be easy to batch and film in under 30 minutes",
      "Prefer repeatable formats/templates",
    ],
    monetize: [
      "Each idea must include a clear revenue path (product, service, affiliate, lead magnet, newsletter, course)",
      "CTA must reference link in bio or specific offer",
      "If no product, propose a free lead magnet to capture emails",
    ],
  };
  const activeDirectives = goals.flatMap(g => goalDirectives[g] ?? []);
  const directivesText = activeDirectives.length ? `\nGoal directives:\n- ${activeDirectives.join("\n- ")}` : "";

  const prompt = `You are an expert short-form content strategist for creators. Generate 5 concise, high-signal video ideas tailored to the user's niche, tone, goals, and content pillars.${directivesText}

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
 - If goals include "monetize": each idea must include a monetization angle in the hook or caption, and the CTA must reference a revenue path (product, service, affiliate, sponsor, lead magnet, course, or newsletter sign-up).

Context:
- niche: ${niche}
- tone: ${tone}
- goals: ${goals.join(", ") || "—"}
- pillars: ${pillars.join(", ") || "—"}`;

  try {
    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You produce actionable content ideas and only respond with JSON when asked." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    }, { signal: controller.signal, timeout: timeoutMs });
    clearTimeout(timeout);
    const text = completion.choices?.[0]?.message?.content?.trim() || "";
    // Be defensive: strip code fences or surrounding text, extract JSON object/array
    let raw = text;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) raw = fenced[1].trim();
    if (!fenced) {
      const start = raw.search(/[\[{]/);
      const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
      if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[ideas] JSON parse failed", { preview: raw.slice(0, 200) });
      throw e;
    }
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
    })).map((i: any) => {
      if (goals.includes("monetize")) {
        const monetized = /(link in bio|shop|buy|free|download|guide|newsletter|course|join|apply|book|signup|sign up|promo|code|store|merch|patreon|sponsor)/i.test(i.cta || "");
        if (!monetized) {
          i.cta = "Check link in bio for free guide/product; follow for part 2";
        }
      }
      return i;
    });
  } catch (err) {
    const message = (err as any)?.name === 'AbortError' ? `timeout after ${process.env.OPENAI_TIMEOUT_MS || 30000}ms` : (err as Error)?.message ?? err;
    console.log("[ideas] LLM error:", message);
    throw err;
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

  if (!openai) return res.status(503).json({ error: "llm_unavailable" });
  let ideas: any[];
  try {
    ideas = await generateIdeasWithLLM({ niche, tone, goals, pillars });
  } catch (e) {
    return res.status(502).json({ error: "llm_failed" });
  }
  // De-duplicate by hook
  const seen = new Set<string>();
  ideas = ideas.filter(i => {
    const k = (i.hook || "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

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

      // Optional: fetch basic user info for username + followerCount
      let username: string | undefined = undefined;
      let followerCount: number | undefined = undefined;
      try {
        const infoResp = await fetch("https://open.tiktokapis.com/v2/user/info/", {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const infoJson: any = await infoResp.json().catch(() => ({}));
        if (infoResp.ok) {
          username = infoJson?.data?.user?.display_name || infoJson?.data?.user?.username;
          followerCount = infoJson?.data?.user?.follower_count ?? undefined;
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
      if (typeof followerCount === 'number') {
        await prisma.tikTokSnapshot.create({ data: { userId: ensuredUserId, followerCount } });
      }
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
      // Try to ask for public performance fields; API will ignore unknowns
      const requestedFields = "id,title,create_time,duration,play_count,like_count,comment_count,share_count";
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
      const videos: Array<{id:any; title:string; createdAt: Date|null; durationSec: number|null; views?: number|null; likes?: number|null}> = videosRaw.map((v: any) => ({
        id: v.id || v.video_id,
        title: v.title || v.description || "",
        createdAt: v.create_time ? new Date(Number(v.create_time) * 1000) : null,
        durationSec: v.duration || null,
        views: v.play_count ?? v.statistics?.play_count ?? null,
        likes: v.like_count ?? v.statistics?.like_count ?? null,
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

  // Task suggestions derived from recent performance and optional follower delta
  app.get("/api/tasks", async (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || "";
    // Auto compute deltas from snapshots if available
    const snaps = await prisma.tikTokSnapshot.findMany({ where: { userId }, orderBy: { capturedAt: "desc" }, take: 90 });
    const latest = snaps[0]?.followerCount ?? null;
    const dayAgo = snaps.find((s: any) => (Date.now() - new Date(s.capturedAt).getTime()) >= 24*60*60*1000)?.followerCount ?? latest;
    const weekAgo = snaps.find((s: any) => (Date.now() - new Date(s.capturedAt).getTime()) >= 7*24*60*60*1000)?.followerCount ?? latest;
    const monthAgo = snaps.find((s: any) => (Date.now() - new Date(s.capturedAt).getTime()) >= 30*24*60*60*1000)?.followerCount ?? latest;
    const followerDeltaDay = latest !== null && dayAgo !== null ? latest - dayAgo : 0;
    const followerDeltaWeek = latest !== null && weekAgo !== null ? latest - weekAgo : 0;
    const followerDeltaMonth = latest !== null && monthAgo !== null ? latest - monthAgo : 0;
    const acct = await prisma.tikTokAccount.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    if (!acct) return res.status(404).json({ error: "Not connected" });
    if (!TIKTOK_CLIENT_ID || !TIKTOK_CLIENT_SECRET) {
      return res.json({ tasks: [
        { id: "stub-1", title: "Post 3 videos this week", priority: "high", reason: "Build consistency", action: "Block two 30‑minute batching sessions" },
        { id: "stub-2", title: "Tighten hooks to 3–5 words on screen by 0.2s", priority: "med", reason: "Improve hook retention", action: "Add high‑contrast text preset" }
      ]});
    }

    try {
      // Reuse analysis data
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
        console.error("[tiktok] video.list for tasks failed", { status: resp.status, body: data });
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
      const medianDurationSec = durations.length ? durations[Math.floor(durations.length/2)] : 0;
      const days = videos.map(v => v.createdAt!.getTime()).sort((a,b)=>a-b);
      const daysCovered = days.length ? Math.max(1, Math.ceil((days[days.length-1]-days[0])/(1000*60*60*24))) : 0;
      const cadencePerWeek = daysCovered ? Number(((total / daysCovered) * 7).toFixed(2)) : 0;
      const byHour: Record<string, number> = {}; for (let i=0;i<24;i++) byHour[String(i)] = 0; videos.forEach(v=>{ byHour[String(v.createdAt!.getHours())]++; });
      const bestHours = Object.entries(byHour).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([h])=>Number(h));

      // Build tasks
      const tasks: Array<{id:string; title:string; priority:"high"|"med"|"low"; reason:string; action:string}> = [];
      // Cadence tasks
      if (cadencePerWeek < 3) tasks.push({ id: "cadence", title: "Post at least 3 times per week", priority: "high", reason: `Current cadence ~${cadencePerWeek}/week`, action: "Batch record 2 sessions (30 min) and schedule" });
      else if (cadencePerWeek >= 5) tasks.push({ id: "cadence-opt", title: "Keep cadence; add 1 series this week", priority: "low", reason: `Cadence ${cadencePerWeek}/week`, action: "Create a 3‑part series on your best theme" });

      // Length tasks
      if (medianDurationSec > 35) tasks.push({ id: "length-down", title: "Trim videos toward 20–30s", priority: "med", reason: `Median length ${medianDurationSec}s`, action: "Cut set‑up; show payoff by 5–7s" });
      if (medianDurationSec > 0 && medianDurationSec < 15) tasks.push({ id: "length-up", title: "Add one visual step to increase watch time", priority: "med", reason: `Median ${medianDurationSec}s`, action: "Insert a quick demo between hook and payoff" });

      // Timing tasks
      if (bestHours.length) tasks.push({ id: "timing", title: `Schedule posts around ${bestHours.map(h=>`${h}:00`).join(', ')}`, priority: "low", reason: "Audience active windows", action: "Use reminders to post at peak hours" });

      // Performance-based tasks (if we have views/likes)
      const viewVals = (videos as Array<{views?: number|null}>).map(v => Number(v.views || 0)).filter(n=>n>0).sort((a,b)=>a-b);
      const p75 = viewVals.length ? viewVals[Math.floor(viewVals.length*0.75)] : 0;
      const winners = p75 ? (videos as Array<{views?: number|null}>).filter(v => (v.views||0) >= p75) : [];
      if (winners.length) tasks.push({ id: "double-down", title: "Double‑down on winning theme", priority: "high", reason: `${winners.length} recent posts ≥ 75th percentile views`, action: "Make a 2‑part follow‑up with a sharper hook" });

      // Follower trend tasks
      if (followerDeltaWeek < 0) tasks.push({ id: "followers-down", title: "Run 3 hook experiments this week", priority: "high", reason: `Followers −${Math.abs(followerDeltaWeek)} (7d)`, action: "Test question hook, contrarian take, and transformation promise" });
      if (followerDeltaWeek > 0 && followerDeltaWeek < 50) tasks.push({ id: "followers-flat", title: "Double‑down on best theme with 2‑part series", priority: "med", reason: `Followers +${followerDeltaWeek} (7d)`, action: "Re‑use top format and vary topic angle" });

      return res.json({ tasks, deltas: { day: followerDeltaDay, week: followerDeltaWeek, month: followerDeltaMonth } });
    } catch (e) {
      console.error("[tasks] error", e);
      return res.status(500).json({ error: "unexpected" });
    }
  });

  // Trends stub: return niche-based hashtags and sounds for inspiration
  app.get("/api/trends", async (req: Request, res: Response) => {
    const niche = String((req.query.niche as string) || "General");
    const today = new Date().toISOString().slice(0, 10);

    const BASE: Record<string, { hashtags: string[]; sounds: Array<{ title: string; url?: string }> }> = {
      Parenting: {
        hashtags: ["parentingtips", "toddlers", "momtok", "dadsoftiktok", "bedtimeroutine"],
        sounds: [
          { title: "Calm bedtime piano loop" },
          { title: "Daily routine trending beat" },
        ],
      },
      Fitness: {
        hashtags: ["fitness", "gymtok", "wellness", "legday", "formcheck"],
        sounds: [
          { title: "Upbeat HIIT 120bpm" },
          { title: "Motivation chorus clip" },
        ],
      },
      General: {
        hashtags: ["fyp", "learnontiktok", "howto", "tips", "behindthescenes"],
        sounds: [
          { title: "Chill vlog background" },
          { title: "Quick cuts percussion" },
        ],
      },
    };

    const data = BASE[niche] || BASE.General;
    const makeScored = (arr: string[]) => arr.map((t, i) => ({ tag: `#${t}`, score: 100 - i * 7 }));
    const makeSoundScored = (arr: Array<{ title: string; url?: string }>) => arr.map((s, i) => ({ ...s, score: 100 - i * 8 }));

    res.json({
      date: today,
      niche,
      hashtags: makeScored(data.hashtags),
      sounds: makeSoundScored(data.sounds),
    });
  });

  // Video analysis: accept a short mp4/mov, return length and naive cut estimates
  app.post("/api/video/analyze", upload.single("video"), async (req: Request, res: Response) => {
    try {
      const file = (req as any).file as any;
      if (!file) return res.status(400).json({ error: "missing_file" });
      const niche = String((req.body?.niche as string) || 'General');
      const tone = String((req.body?.tone as string) || 'Relatable');
      const goals = String((req.body?.goals as string) || '').split(',').filter(Boolean);
      const pillars = String((req.body?.pillars as string) || '').split(',').filter(Boolean);
      // Working directory for intermediate files
      const workDir = await (await import("node:fs/promises")).mkdtemp(path.join(os.tmpdir(), "vid-"));
      // Input path: from multer disk storage or memory buffer fallback
      let inputPath = (file && file.path) ? file.path : path.join(workDir, "upload.mp4");
      if (!file.path && file.buffer) {
        await (await import("node:fs/promises")).writeFile(inputPath, file.buffer);
      }

      // Probe duration and stream info
      const probe = await new Promise<any>((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err: any, data: any) => err ? reject(err) : resolve(data));
      });
      const durationSec = Math.round(Number(probe?.format?.duration || 0));

      // Scene change detection helper
      async function detectCuts(threshold: number): Promise<number[]> {
        return await new Promise((resolve) => {
          const times: number[] = [];
          ffmpeg(inputPath)
            .outputOptions([
              '-v', 'info',
              // Downscale for speed, select scene changes, and print pts_time via showinfo
              '-vf', `scale=320:-1,select=gt(scene\,${threshold}),showinfo`,
              '-an',
              '-f', 'null'
            ])
            .on('stderr', (line: any) => {
              // showinfo prints ... pts_time:X ...
              let m = line.match(/pts_time:([0-9\.]+)/);
              if (m) times.push(Number(m[1]));
              // metadata=print alternative: lavfi.scene_score with n: and pts_time sometimes
              const m2 = line.match(/scene_score=([0-9\.]+)/);
              const t2 = line.match(/pts_time:([0-9\.]+)/);
              if (m2 && t2) times.push(Number(t2[1]));
            })
            .on('end', () => resolve(times))
            .on('error', () => resolve(times))
            .saveToFile('/dev/null');
        });
      }
      // First pass (stricter), second pass (looser) if needed
      let cutTimestamps: number[] = await detectCuts(0.32);
      if (cutTimestamps.length === 0) {
        const loose = await detectCuts(0.15);
        cutTimestamps = Array.from(new Set([...cutTimestamps, ...loose])).sort((a,b)=>a-b);
      }

      // Silence/beat detection: use ffmpeg to extract silent segments
      const silences: Array<{start:number; end:number}> = await new Promise((resolve) => {
        const out: Array<{start:number; end:number}> = [];
        ffmpeg(inputPath)
          .outputOptions(['-af', 'silencedetect=noise=-30dB:d=0.3', '-f', 'null'])
          .on('stderr', (line: any) => {
            let m = line.match(/silence_start: ([0-9\.]+)/);
            if (m) out.push({ start: Number(m[1]), end: Number(m[1]) });
            m = line.match(/silence_end: ([0-9\.]+) \|/);
            if (m && out.length) out[out.length-1].end = Number(m[1]);
          })
          .on('end', () => resolve(out))
          .on('error', () => resolve(out))
          .saveToFile('/dev/null');
      });

      // OCR first frame(s) to detect hook text timing
      const firstFramePath = `${workDir}/firstframe.jpg`;
      await new Promise((resolve) => {
        ffmpeg(inputPath).screenshots({ timestamps: [0.0, 0.5, 1.0], filename: 'frame-at-%s.jpg', folder: workDir, size: '720x?' })
          .on('end', resolve)
          .on('error', resolve);
      });
      let hookText = '';
      try {
        const frames = [0, 0.5, 1.0].map(t => `${workDir}/frame-at-${t}.jpg`);
        for (const f of frames) {
          const resOcr: any = await Tesseract.recognize(f, 'eng');
          const text = (resOcr?.data?.text || '').trim();
          if (text) { hookText = text.replace(/\s+/g, ' ').slice(0, 80); break; }
        }
      } catch {}

      // Caption presence check (SRT/VTT not supported yet on upload). Approximate by OCR lower third
      const captionsPresent = !!hookText;

      await (await import("node:fs/promises")).rm(workDir, { recursive: true, force: true });
      if (file && file.path) { try { await (await import("node:fs/promises")).unlink(file.path); } catch {} }

      // Compute naive metrics
      // Fallback: if scene detection found nothing, approximate cuts from silence boundaries
      let cuts = cutTimestamps.length;
      if (cuts === 0 && silences.length > 1) {
        const gaps = silences.filter(s => (s.end - s.start) >= 0.25).length;
        cuts = Math.max(0, gaps - 1);
      }
      // Second fallback: sample frames and compare file size deltas as a proxy for visual change
      if (cuts === 0) {
        await new Promise((resolve) => {
          ffmpeg(inputPath)
            .outputOptions(['-vf', 'fps=4,scale=320:-1', '-qscale:v', '3'])
            .save(path.join(workDir, 'cut-sample-%03d.jpg'))
            .on('end', resolve)
            .on('error', resolve);
        });
        try {
          const files = (await (await import('node:fs/promises')).readdir(workDir))
            .filter(n => n.startsWith('cut-sample-') && n.endsWith('.jpg'))
            .sort();
          const stats = await Promise.all(files.map(async f => (await (await import('node:fs/promises')).stat(path.join(workDir, f))).size));
          let inferredCuts = 0;
          for (let i = 1; i < stats.length; i++) {
            const a = stats[i-1];
            const b = stats[i];
            if (a === 0 || b === 0) continue;
            const diff = Math.abs(b - a) / Math.max(a, b);
            if (diff >= 0.15) inferredCuts++;
          }
          if (inferredCuts > 0) {
            cuts = inferredCuts;
            cutTimestamps = [];
          }
        } catch {}
      }
      const avgCutSec = cuts > 1 ? Math.round((durationSec / cuts) * 10) / 10 : durationSec;
      // Estimate first voiced moment from silences
      const firstSilence = silences.find(s => s.start <= 0.05);
      const firstSoundSec = firstSilence && firstSilence.end ? firstSilence.end : 0;

      // Optional speech transcription (Whisper) for richer analysis
      let transcript: string | undefined = undefined;
      let segments: Array<{ start: number; end: number; text: string }> | undefined = undefined;
      try {
        if (openai) {
          const audioPath = `${workDir}/audio.wav`;
          await new Promise((resolve) => {
            ffmpeg(inputPath)
              .outputOptions(['-vn','-acodec','pcm_s16le','-ar','16000','-ac','1'])
              .save(audioPath)
              .on('end', resolve)
              .on('error', resolve);
          });
          // @ts-ignore - openai types accept Readable
          const tr = await openai.audio.transcriptions.create({
            model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
            // @ts-ignore
            file: fs.createReadStream(audioPath),
            response_format: 'verbose_json'
          } as any);
          transcript = (tr as any)?.text || undefined;
          segments = Array.isArray((tr as any)?.segments) ? (tr as any).segments.map((s:any)=>({ start: Number(s.start||0), end: Number(s.end||0), text: String(s.text||'') })) : undefined;
        }
      } catch {}

      // Derived metrics from transcript/segments and silences
      let first2sText = '';
      let speechSeconds = 0;
      if (segments && segments.length) {
        first2sText = segments.filter(s => s.start < 2).map(s => s.text).join(' ').trim();
        speechSeconds = segments.reduce((acc, s) => acc + Math.max(0, Number(s.end) - Number(s.start)), 0);
      }
      const wordsTotal = (transcript || '').trim().split(/\s+/).filter(Boolean).length;
      const wordsPerSec = speechSeconds > 0 ? Number((wordsTotal / speechSeconds).toFixed(2)) : undefined;
      const first3Cuts = cutTimestamps.filter(t => t <= 3).length;
      const silenceRatio = silences.reduce((acc, s) => acc + Math.max(0, (s.end - s.start)), 0) / Math.max(1, durationSec);

      // Audio loudness
      let meanDb: number | undefined = undefined;
      let maxDb: number | undefined = undefined;
      await new Promise((resolve) => {
        ffmpeg(inputPath)
          .outputOptions(['-af', 'volumedetect', '-f', 'null'])
          .on('stderr', (line: any) => {
            let m = line.match(/mean_volume:\s*(-?[0-9\.]+) dB/);
            if (m) meanDb = Number(m[1]);
            m = line.match(/max_volume:\s*(-?[0-9\.]+) dB/);
            if (m) maxDb = Number(m[1]);
          })
          .on('end', resolve)
          .on('error', resolve)
          .saveToFile('/dev/null');
      });

      // First-second brightness/contrast
      let firstSecondStats: { yavg?: number; ymin?: number; ymax?: number; contrast?: number } = {};
      await new Promise((resolve) => {
        const values: number[] = [];
        ffmpeg(inputPath)
          .outputOptions(['-t', '1.2', '-vf', 'scale=320:-1,signalstats', '-f', 'null'])
          .on('stderr', (line: any) => {
            const ya = line.match(/YAVG:([0-9\.]+)/);
            if (ya) values.push(Number(ya[1]));
            const ymi = line.match(/YMIN:([0-9]+)/);
            const yma = line.match(/YMAX:([0-9]+)/);
            if (ymi) firstSecondStats.ymin = Number(ymi[1]);
            if (yma) firstSecondStats.ymax = Number(yma[1]);
          })
          .on('end', () => { if (values.length) firstSecondStats.yavg = Math.round((values.reduce((a,b)=>a+b,0)/values.length)); if (firstSecondStats.ymin!=null && firstSecondStats.ymax!=null) firstSecondStats.contrast = Number((firstSecondStats.ymax - firstSecondStats.ymin).toFixed(0)); resolve(null); })
          .on('error', () => resolve(null))
          .saveToFile('/dev/null');
      });

      // Dynamic suggestions via LLM only (no fallback)
      if (!openai) return res.status(503).json({ error: "llm_unavailable" });
      let suggestions: string[] = [];
      try {
        const keywords = transcript ? (transcript.toLowerCase().match(/\b[a-z]{4,}\b/g) || []).reduce((m:any,w:string)=>{m[w]=(m[w]||0)+1;return m;}, {}) : {};
        const topKw = Object.entries(keywords).sort((a:any,b:any)=>b[1]-a[1]).slice(0,8).map(([w,c])=>`${w}(${c})`).join(', ');
        const promptSug = `You are a professional short‑form video editor coaching a ${niche} creator. Voice: ${tone}. Goals: ${goals.join(', ') || 'audience growth'}. Pillars: ${pillars.join(', ') || '—'}.\n\nTask: Propose 5 EDITING changes only (not topics, hooks, captions, or content ideas). Each must be specific to the given metrics and under 14 words. Use imperative verbs.\nForbidden: suggesting new content topics, hooks like “Busting the myth…”, generic advice, or duplicating tips.\nOutput (JSON): {"suggestions":[{"area":"hook|pacing|clarity|audio|captions|visual","tip":"…","why":"…","severity":"high|med|low"}],"notes":"optional short note"}.\n\nMetrics:\nDuration:${durationSec}s\nCuts:${cuts} (first3:${first3Cuts})\nAvgCut:${avgCutSec}s\nSilenceRatio:${(silenceRatio*100).toFixed(1)}%\nFirstSound:${firstSoundSec}s\nHookText:${hookText || '—'}\nFirst2sText:${first2sText || '—'}\nCaptions:${captionsPresent}\nLoudness mean:${meanDb ?? 'n/a'}dB max:${maxDb ?? 'n/a'}dB\nWordsPerSec:${wordsPerSec ?? 'n/a'}\nFirstSecond YAVG:${firstSecondStats.yavg ?? 'n/a'} YMIN:${firstSecondStats.ymin ?? 'n/a'} YMAX:${firstSecondStats.ymax ?? 'n/a'} Contrast:${firstSecondStats.contrast ?? 'n/a'}\nTranscriptKeywords:${topKw}`;
        const comp = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You return strict JSON and act as a video editing coach. Never propose topics; only editing changes.' },
            { role: 'user', content: promptSug }
          ],
          temperature: 0.6,
          response_format: { type: 'json_object' }
        });
        const text = comp.choices?.[0]?.message?.content?.trim() || '';
        let raw = text;
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced) raw = fenced[1].trim();
        let parsed: any = {};
        try { parsed = JSON.parse(raw); } catch {}
        if (Array.isArray(parsed?.suggestions)) {
          // accept either strings or objects
          suggestions = parsed.suggestions.slice(0,5).map((s:any)=> typeof s === 'string' ? s : (s?.tip || '')).filter(Boolean);
        }
      } catch (e) {
        return res.status(502).json({ error: "llm_failed" });
      }

      // Optional LLM critique if configured
      let critique: string[] | undefined = undefined;
      try {
        const prompt = `Give 5 short, specific improvement suggestions for a short-form video. Keep each under 15 words.\n\nMetrics:\nDuration: ${durationSec}s\nCuts: ${cuts}\nAvg cut: ${avgCutSec}s\nHook text: ${hookText || '—'}\nSilences: ${silences.length}\nCaptions present: ${captionsPresent}`;
        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
        });
        critique = completion.choices?.[0]?.message?.content?.split(/\n|\r/).map(s=>s.trim()).filter(Boolean).slice(0,5);
      } catch {}

      res.json({ durationSec, cuts, avgCutSec, cutTimeline: cutTimestamps, first3Cuts, hookText, first2sText, captionsPresent, silences, silenceRatio, loudness: { meanDb, maxDb }, firstSecond: firstSecondStats, wordsPerSec, transcript, suggestions, critique });
    } catch (e) {
      res.status(500).json({ error: "analysis_failed" });
    }
  });
}

registerTikTokAuth();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
