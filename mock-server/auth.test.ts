import { describe, expect, it } from "vitest";
import { createApp } from "./src/app";

async function signIn(app: ReturnType<typeof createApp>, email = "a@b.c") {
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  return { res, cookie: setCookie.split(";")[0] };
}

describe("mock auth / session / widget_token", () => {
  it("sign-in -> session -> sign-out full chain", async () => {
    const app = createApp();
    const { res, cookie } = await signIn(app);
    expect(res.status).toBe(200);
    expect(cookie).toContain("amuse.session_token=");

    const sess = await app.request("/api/auth/get-session", { headers: { cookie } });
    const sj = (await sess.json()) as any;
    expect(sj.user.email).toBe("a@b.c");
    expect(typeof sj.user.widget_token).toBe("string");

    const out = await app.request("/api/auth/sign-out", { method: "POST", headers: { cookie } });
    expect(out.status).toBe(200);

    const sess2 = await app.request("/api/auth/get-session", { headers: { cookie } });
    expect(await sess2.json()).toBeNull();
  });

  it("valid widget_token (Bearer) resolves the user", async () => {
    const app = createApp();
    const { cookie } = await signIn(app);
    const user = (await (await app.request("/api/users", { headers: { cookie } })).json()) as any;
    const r = await app.request("/api/widget/subscription", { headers: { authorization: `Bearer ${user.widget_token}` } });
    expect(r.status).toBe(200);
  });

  it("forged widget_token -> 401", async () => {
    const app = createApp();
    const r = await app.request("/api/widget/subscription", { headers: { authorization: "Bearer forged-token" } });
    expect(r.status).toBe(401);
  });
});
