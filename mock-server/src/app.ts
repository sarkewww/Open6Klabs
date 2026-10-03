/**
 * mock-server/src/app.ts
 * Local, fully-mocked backend compatible with the captured Amuse client:
 * better-auth-shaped session endpoints, subscription tiers/lifecycle + gating,
 * widget profiles/settings, now-playing pipeline with 6 source adapters, and SSE.
 */
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { createAdapters, SOURCES, type SourceId } from "./sources";
import { broadcast } from "./realtime";

export type Tier = "free" | "pro" | "supporter";
export type SubStatus = "active" | "canceled" | "revoked" | "inactive";
export type Subscription = { status: SubStatus; tier: Tier; current_period_end: string | null; cancel_at_period_end: boolean };

export const DEFAULT_SETTINGS = {
  skin: "boxy",
  theme: "default_light",
  cover: "vinyl",
  tint_color: "#ffffff",
  font: "poppins",
  visible_duration: 5,
  hide_delay: 0,
  cover_blur: true,
  cover_glow: true,
  hide_on_pause: false,
  song_change_only: false,
  magic_colors: true,
  hide_visualizer: false,
  show_animation: "default_in",
  hide_animation: "default_out",
  nothing_playing_cover: null as string | null,
  nothing_playing_title: null as string | null,
  nothing_playing_artist: null as string | null,
  is_demo: false,
};

const SKIN_TIERS: Record<string, "FREE" | "PRO" | "DISCORD"> = {
  compact: "FREE",
  boxy: "FREE",
  gallery: "FREE",
  minimal: "FREE",
  macos: "FREE",
  shell: "FREE",
  windows98: "PRO",
  discord: "DISCORD",
};

export function skinLocked(tier: string, sub: Subscription, isDiscordMember: boolean): boolean {
  const active = sub.status === "active";
  if (tier === "PRO") return !active;
  if (tier === "DISCORD") return !(isDiscordMember || active);
  return false;
}

export const PRICING = [
  { id: "free", name: "FREE", price: 0, currency: "USD", interval: null, features: ["All free skins", "4 covers", "14 fonts", "24 animations"] },
  { id: "pro", name: "PRO", price: 5, currency: "USD", interval: "month", features: ["Everything in FREE", "macOS + Shell skins", "Windows 98 skin", "Canvas covers"] },
  { id: "discord", name: "DISCORD", price: 0, currency: "USD", interval: null, features: ["Discord player skin", "Exclusive Discord community"] },
];

export function createApp() {
  const users = new Map<string, any>();
  const sessions = new Map<string, string>(); // session token -> user id
  const widgetTokens = new Map<string, string>(); // widget token -> user id
  const subs = new Map<string, Subscription>();
  const profiles = new Map<string, any>();
  const adapters = createAdapters();
  const eventSubs = new Set<(event: string, data: unknown) => void>();

  const now = () => new Date().toISOString();
  const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 12)}`;

  function ensureUser(email = "local@example.com") {
    for (const u of users.values()) if (u.email === email) return u;
    const id = newId("user");
    const widget_token = newId("wt") + newId("wt");
    const user = {
      id,
      username: email.split("@")[0],
      display_name: "Local User",
      email,
      email_verified: true,
      avatar: null,
      is_discord_member: true,
      widget_token,
      badges: [],
      social_links: [],
      joined_at: now(),
      last_login: now(),
      last_active: now(),
      created_at: now(),
      updated_at: now(),
      donations: [],
      sent_gifts: [],
      received_gifts: [],
    };
    users.set(id, user);
    widgetTokens.set(widget_token, id);
    subs.set(id, { status: "active", tier: "pro", current_period_end: null, cancel_at_period_end: false });
    profiles.set(id, {
      _id: newId("profile"),
      user_id: id,
      profile_id: "main",
      name: "Main",
      music_service: "pear-desktop",
      settings: { ...DEFAULT_SETTINGS },
      created_at: now(),
      updated_at: now(),
    });
    return user;
  }

  ensureUser();
  // dev session so the verbatim-host dashboard is authenticated out of the box
  {
    const first = users.values().next().value;
    if (first) sessions.set("local-session", first.id);
  }

  function authUser(c: any) {
    const cookie = getCookie(c, "amuse.session_token");
    if (cookie && sessions.has(cookie)) return users.get(sessions.get(cookie)!);
    const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    // dev convenience: the verbatim host serves the widget at /widget/amuse/local
    if (bearer === "local") return users.values().next().value;
    if (bearer && widgetTokens.has(bearer)) return users.get(widgetTokens.get(bearer)!);
    return null;
  }
  function sessionUser(c: any) {
    const cookie = getCookie(c, "amuse.session_token");
    return cookie && sessions.has(cookie) ? users.get(sessions.get(cookie)!) : null;
  }

  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  // ---- auth (better-auth shaped) ----
  app.post("/api/auth/sign-in/email", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const user = ensureUser(body.email || "local@example.com");
    const token = newId("sess") + newId("sess");
    sessions.set(token, user.id);
    setCookie(c, "amuse.session_token", token, { path: "/", httpOnly: true, sameSite: "Lax" });
    return c.json({ user, session: { id: token, userId: user.id } });
  });
  app.post("/api/auth/sign-out", (c) => {
    const cookie = getCookie(c, "amuse.session_token");
    if (cookie) sessions.delete(cookie);
    deleteCookie(c, "amuse.session_token", { path: "/" });
    return c.json({ ok: true });
  });
  app.get("/api/auth/get-session", (c) => {
    const user = sessionUser(c);
    return c.json(user ? { user, session: { userId: user.id } } : null);
  });

  // ---- users ----
  app.get("/api/users", (c) => {
    const u = authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json(u);
  });
  app.get("/api/users/subscription", (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const s = subs.get(u.id)!;
    return c.json({ status: s.status === "active" ? "active" : s.status === "inactive" ? "inactive" : s.status, tier: s.tier });
  });

  // ---- subscription ----
  app.get("/api/subscription", (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json(subs.get(u.id));
  });
  app.get("/api/pricing", (c) => c.json(PRICING));
  app.post("/api/subscription/upgrade", async (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const tier: Tier = body.tier === "discord" ? "supporter" : body.tier === "pro" ? "pro" : "free";
    const s: Subscription = { status: "active", tier, current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(), cancel_at_period_end: false };
    subs.set(u.id, s);
    return c.json(s);
  });
  app.post("/api/subscription/cancel", (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const s = subs.get(u.id)!;
    const next: Subscription = { ...s, status: "canceled", cancel_at_period_end: true };
    subs.set(u.id, next);
    return c.json(next);
  });
  app.post("/api/subscription/revoke", (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const next: Subscription = { ...subs.get(u.id)!, status: "revoked" };
    subs.set(u.id, next);
    return c.json(next);
  });
  app.get("/api/gating", (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const s = subs.get(u.id)!;
    return c.json(Object.fromEntries(Object.entries(SKIN_TIERS).map(([skin, tier]) => [skin, skinLocked(tier, s, u.is_discord_member)])));
  });

  // ---- widget (Bearer widget_token) ----
  app.get("/api/widget/settings", (c) => c.json({ general: { hide_popup: true } }));
  app.get("/api/widget/subscription", (c) => {
    const u = authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const s = subs.get(u.id)!;
    return c.json({ tier: s.tier.toUpperCase(), status: s.status === "active" ? "active" : s.status === "inactive" ? "none" : s.status, current_period_end: s.current_period_end, cancel_at_period_end: s.cancel_at_period_end });
  });
  app.get("/api/widgets/amuse/profiles", (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json([profiles.get(u.id)]);
  });
  app.get("/api/widgets/amuse/profiles/:id", (c) => {
    const u = authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const p = profiles.get(u.id);
    if (!p || p.profile_id !== c.req.param("id")) return c.json({ error: "not found" }, 404);
    return c.json(p);
  });
  app.put("/api/widgets/amuse/profiles/:id", async (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const p = profiles.get(u.id);
    if (!p) return c.json({ error: "not found" }, 404);
    p.settings = { ...p.settings, ...(body.settings || {}) };
    p.updated_at = now();
    for (const sub of eventSubs) sub("profile-changed", { profile_id: p.profile_id });
    broadcast("state-update", { profile_id: p.profile_id });
    return c.json(p);
  });

  // ---- now-playing + sources ----
  app.get("/api/now-playing", (c) => {
    const u = sessionUser(c) || authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const r = adapters.nowPlaying("pear-desktop");
    return r.error ? c.json({ error: r.error }, 409) : c.json(r.track);
  });
  app.get("/api/widget/now-playing", (c) => {
    const u = authUser(c);
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const r = adapters.nowPlaying("pear-desktop");
    return r.error ? c.json({ error: r.error }, 409) : c.json(r.track);
  });
  app.get("/api/sources", (c) => c.json(adapters.list()));
  app.post("/api/sources/:id/connect", (c) => {
    adapters.connect(c.req.param("id") as SourceId);
    return c.json({ ok: true, status: adapters.status(c.req.param("id") as SourceId) });
  });
  app.post("/api/sources/:id/disconnect", (c) => {
    adapters.disconnect(c.req.param("id") as SourceId);
    return c.json({ ok: true, status: adapters.status(c.req.param("id") as SourceId) });
  });
  app.post("/api/sources/:id/error", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    adapters.setError(c.req.param("id") as SourceId, body.error ?? "SERVER_ERROR");
    return c.json({ ok: true, status: adapters.status(c.req.param("id") as SourceId) });
  });
  app.get("/api/now-playing/stream", (c) =>
    streamSSE(c, async (stream) => {
      const interval = Number(c.req.query("interval") || 4000);
      const count = Number(c.req.query("count") || 3);
      let n = 0;
      const timer = setInterval(async () => {
        const r = adapters.nowPlaying("pear-desktop");
        await stream.writeSSE({ event: "track", data: JSON.stringify(r.track ?? { error: r.error }) });
        if (++n >= count) {
          clearInterval(timer);
          await stream.close();
        }
      }, interval);
      stream.onAbort(() => clearInterval(timer));
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (n >= count) {
            clearInterval(check);
            resolve();
          }
        }, Math.max(10, Math.floor(interval / 5)));
      });
    })
  );

  // ---- realtime settings channel (self-hosted SSE) ----
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      let closed = false;
      const sub = (event: string, data: unknown) => {
        if (!closed) stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {});
      };
      eventSubs.add(sub);
      sub("ready", { ok: true });
      const ka = setInterval(() => sub("ping", {}), 20000);
      await new Promise<void>((resolve) =>
        stream.onAbort(() => {
          closed = true;
          eventSubs.delete(sub);
          clearInterval(ka);
          resolve();
        })
      );
    })
  );

  // ---- stubs ----
  app.get("/api/connections", (c) => c.json([]));
  app.get("/api/canvas/search", (c) => c.json({ canvas_url: null }));
  app.post("/api/canvas/cover/convert", (c) => c.json({ ok: true }));
  app.post("/api/pusher/realtime/auth", (c) => c.json({ auth: "local" }));
  app.get("/api/notifications/seen", (c) => c.json([]));
  app.get("/api/notifications/private", (c) => c.json([]));

  return app;
}

export { SOURCES };
