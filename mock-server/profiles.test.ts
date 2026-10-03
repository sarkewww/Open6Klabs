import { describe, expect, it } from "vitest";
import { createApp } from "./src/app";

type Profile = {
  _id: string;
  user_id: string;
  profile_id: string;
  name: string;
  music_service: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

let seq = 0;

async function signedIn(app: ReturnType<typeof createApp>) {
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `profiles${++seq}@test.local` }),
  });
  return (res.headers.get("set-cookie") || "").split(";")[0];
}

async function widgetToken(app: ReturnType<typeof createApp>, cookie: string) {
  const user = (await (await app.request("/api/users", { headers: { cookie } })).json()) as {
    widget_token: string;
  };
  return user.widget_token;
}

function jsonHeaders(cookie: string) {
  return { cookie, "content-type": "application/json" };
}

describe("mock widget profiles (multi-profile)", () => {
  it("S1 create/list/get: main seeded, create Party, list keeps main first", async () => {
    const app = createApp();
    const cookie = await signedIn(app);

    const initial = (await (
      await app.request("/api/widgets/amuse/profiles", { headers: { cookie } })
    ).json()) as Profile[];
    expect(initial.length).toBe(1);
    expect(initial[0].profile_id).toBe("main");
    expect(initial[0].name).toBe("Main");

    const created = await app.request("/api/widgets/amuse/profiles", {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ name: "Party" }),
    });
    expect(created.status).toBe(201);
    const party = (await created.json()) as Profile;
    expect(party.profile_id).toBeTruthy();
    expect(party.profile_id).not.toBe("main");
    expect(party.name).toBe("Party");

    const list = (await (
      await app.request("/api/widgets/amuse/profiles", { headers: { cookie } })
    ).json()) as Profile[];
    expect(list.length).toBe(2);
    expect(list[0].profile_id).toBe("main");
    expect(list[1].profile_id).toBe(party.profile_id);

    const wt = await widgetToken(app, cookie);
    const got = await app.request(`/api/widgets/amuse/profiles/${party.profile_id}`, {
      headers: { authorization: `Bearer ${wt}` },
    });
    expect(got.status).toBe(200);
    expect(((await got.json()) as Profile).name).toBe("Party");
  });

  it("S2 isolation: PATCH party settings does not leak into main", async () => {
    const app = createApp();
    const cookie = await signedIn(app);
    const wt = await widgetToken(app, cookie);

    const created = (await (
      await app.request("/api/widgets/amuse/profiles", {
        method: "POST",
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ name: "Party" }),
      })
    ).json()) as Profile;

    const patched = await app.request(`/api/widgets/amuse/profiles/${created.profile_id}`, {
      method: "PATCH",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ settings: { skin: "discord" } }),
    });
    expect(patched.status).toBe(200);

    const main = (await (
      await app.request("/api/widgets/amuse/profiles/main", { headers: { authorization: `Bearer ${wt}` } })
    ).json()) as Profile;
    expect(main.settings.skin).toBe("boxy");

    const party = (await (
      await app.request(`/api/widgets/amuse/profiles/${created.profile_id}`, {
        headers: { authorization: `Bearer ${wt}` },
      })
    ).json()) as Profile;
    expect(party.settings.skin).toBe("discord");
  });

  it("S3 delete: main is protected, party can be deleted", async () => {
    const app = createApp();
    const cookie = await signedIn(app);
    const wt = await widgetToken(app, cookie);

    const delMain = await app.request("/api/widgets/amuse/profiles/main", {
      method: "DELETE",
      headers: { cookie },
    });
    expect(delMain.status).toBe(400);
    expect(((await delMain.json()) as { error: string }).error).toBe("Cannot delete the default profile");

    const created = (await (
      await app.request("/api/widgets/amuse/profiles", {
        method: "POST",
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ name: "Party" }),
      })
    ).json()) as Profile;

    const delParty = await app.request(`/api/widgets/amuse/profiles/${created.profile_id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(delParty.status).toBe(200);
    expect(((await delParty.json()) as { ok: boolean }).ok).toBe(true);

    const list = (await (
      await app.request("/api/widgets/amuse/profiles", { headers: { cookie } })
    ).json()) as Profile[];
    expect(list.length).toBe(1);

    const gone = await app.request(`/api/widgets/amuse/profiles/${created.profile_id}`, {
      headers: { authorization: `Bearer ${wt}` },
    });
    expect(gone.status).toBe(404);
  });

  it("S4 gating: free tier is capped at 3 profiles total, pro is unlimited", async () => {
    const app = createApp();
    const cookie = await signedIn(app);
    await app.request("/api/subscription/cancel", { method: "POST", headers: { cookie } });

    for (let i = 0; i < 2; i++) {
      const r = await app.request("/api/widgets/amuse/profiles", {
        method: "POST",
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ name: `P${i}` }),
      });
      expect(r.status).toBe(201);
    }

    const fourth = await app.request("/api/widgets/amuse/profiles", {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ name: "P4" }),
    });
    expect(fourth.status).toBe(403);
    expect(((await fourth.json()) as { error: string }).error).toBe("Upgrade to Pro to get unlimited profiles");

    const proApp = createApp();
    const proCookie = await signedIn(proApp);
    for (let i = 0; i < 4; i++) {
      const r = await proApp.request("/api/widgets/amuse/profiles", {
        method: "POST",
        headers: jsonHeaders(proCookie),
        body: JSON.stringify({ name: `Q${i}` }),
      });
      expect(r.status).toBe(201);
    }
  });

  it("S5 unknown profile via Bearer local -> exact 404 body", async () => {
    const app = createApp();
    const res = await app.request("/api/widgets/amuse/profiles/nope", {
      headers: { authorization: "Bearer local" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Profile not found" });
  });

  it("S6 validation: empty and too-long names rejected", async () => {
    const app = createApp();
    const cookie = await signedIn(app);

    const empty = await app.request("/api/widgets/amuse/profiles", {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ name: "   " }),
    });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toBe("Profile name cannot be empty");

    const long = await app.request("/api/widgets/amuse/profiles", {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ name: "x".repeat(31) }),
    });
    expect(long.status).toBe(400);
    expect(((await long.json()) as { error: string }).error).toBe("Profile name is too long");
  });

  it("S7 regression: main settings merge, PUT alias, rename keeps profile_id", async () => {
    const app = createApp();
    const cookie = await signedIn(app);
    const wt = await widgetToken(app, cookie);

    const main = (await (
      await app.request("/api/widgets/amuse/profiles/main", { headers: { authorization: `Bearer ${wt}` } })
    ).json()) as Profile;
    expect(typeof main.settings).toBe("object");

    const patched = await app.request("/api/widgets/amuse/profiles/main", {
      method: "PATCH",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ settings: { font: "fredoka" } }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as Profile;
    expect(patchedBody.settings.font).toBe("fredoka");
    expect(patchedBody.settings.skin).toBe("boxy");

    const put = await app.request("/api/widgets/amuse/profiles/main", {
      method: "PUT",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ settings: { font: "fredoka" } }),
    });
    expect(put.status).toBe(200);

    const renamed = await app.request("/api/widgets/amuse/profiles/main", {
      method: "PATCH",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(renamed.status).toBe(200);
    const renamedBody = (await renamed.json()) as Profile;
    expect(renamedBody.name).toBe("Renamed");
    expect(renamedBody.profile_id).toBe("main");
  });
});
