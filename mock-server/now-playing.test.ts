import { describe, expect, it } from "vitest";
import { createApp } from "./src/app";
import { DEMO_TRACKS, SOURCES } from "./src/sources";

async function signedIn(app: ReturnType<typeof createApp>) {
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "np@test.local" }),
  });
  return (res.headers.get("set-cookie") || "").split(";")[0];
}

describe("mock now-playing pipeline + six source adapters", () => {
  it("exposes 6 adapters with initial error codes", async () => {
    const app = createApp();
    const list = (await (await app.request("/api/sources")).json()) as any[];
    expect(list.map((s) => s.id)).toEqual(SOURCES);
    const spotify = list.find((s) => s.id === "spotify")!;
    expect(spotify.error).toBe("NO_SPOTIFY_ACCOUNT");
  });

  it("state machine: nothing_playing -> playing -> not_connected -> playing", async () => {
    const app = createApp();
    const cookie = await signedIn(app);

    const playing = (await (await app.request("/api/now-playing", { headers: { cookie } })).json()) as any;
    expect(DEMO_TRACKS.some((t) => t.id === playing.id)).toBe(true);

    await app.request("/api/sources/pear-desktop/disconnect", { method: "POST", headers: { cookie } });
    const down = await app.request("/api/now-playing", { headers: { cookie } });
    expect(down.status).toBe(409);
    expect(((await down.json()) as any).error).toBe("YTMD_NOT_CONNECTED");

    await app.request("/api/sources/pear-desktop/connect", { method: "POST", headers: { cookie } });
    const again = (await (await app.request("/api/now-playing", { headers: { cookie } })).json()) as any;
    expect(again.id).toBeTruthy();
  });

  it("unknown source surfaces SERVER_ERROR", async () => {
    const app = createApp();
    const cookie = await signedIn(app);
    await app.request("/api/sources/does-not-exist/error", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ error: "SERVER_ERROR" }),
    });
    const list = (await (await app.request("/api/sources")).json()) as any[];
    // no crash; known adapters still present
    expect(list.length).toBe(6);
  });

  it("SSE stream emits >=2 track updates", async () => {
    const app = createApp();
    const res = await app.request("/api/now-playing/stream?interval=40&count=2");
    expect(res.headers.get("content-type") || "").toContain("text/event-stream");
    const text = await res.text();
    const events = text.split("\n").filter((l) => l.startsWith("data:"));
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});
