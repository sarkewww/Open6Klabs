import { describe, expect, it } from "vitest";
import { createApp } from "./src/app";

async function signedIn(app: ReturnType<typeof createApp>) {
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "sub@test.local" }),
  });
  return (res.headers.get("set-cookie") || "").split(";")[0];
}

describe("mock subscription tiers / lifecycle / gating", () => {
  it("windows98 locked until PRO active, then unlocked", async () => {
    const app = createApp();
    const cookie = await signedIn(app);

    let gating = (await (await app.request("/api/gating", { headers: { cookie } })).json()) as any;
    expect(gating.windows98).toBe(true);
    expect(gating.compact).toBe(false);

    await app.request("/api/subscription/upgrade", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tier: "pro" }),
    });
    gating = (await (await app.request("/api/gating", { headers: { cookie } })).json()) as any;
    expect(gating.windows98).toBe(false);
    expect(gating.discord).toBe(false); // active subscription also unlocks discord
  });

  it("discord locked with free tier and no membership", async () => {
    const app = createApp();
    const cookie = await signedIn(app);
    const gating = (await (await app.request("/api/gating", { headers: { cookie } })).json()) as any;
    expect(gating.discord).toBe(true);
  });

  it("pricing exposes FREE/PRO/DISCORD and cancel transitions to canceled", async () => {
    const app = createApp();
    const cookie = await signedIn(app);
    const pricing = (await (await app.request("/api/pricing")).json()) as any[];
    expect(pricing.map((p) => p.id)).toEqual(["free", "pro", "discord"]);

    await app.request("/api/subscription/upgrade", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tier: "pro" }),
    });
    const canceled = (await (
      await app.request("/api/subscription/cancel", { method: "POST", headers: { cookie } })
    ).json()) as any;
    expect(canceled.status).toBe("canceled");
    expect(canceled.cancel_at_period_end).toBe(true);
  });
});
