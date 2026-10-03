import { useCallback, useEffect, useRef, useState } from "react";

const WIDGET_PATH = import.meta.env.VITE_WIDGET_URL || "/widget/amuse/local";
const AUTH = { authorization: "Bearer local" };
const FREE_PROFILE_LIMIT = 3;

type Settings = {
  skin: string;
  theme: string;
  cover: string;
  tint_color: string;
  font: string;
  visible_duration: number;
  hide_delay: number;
  cover_blur: boolean;
  cover_glow: boolean;
  hide_on_pause: boolean;
  song_change_only: boolean;
  magic_colors: boolean;
  hide_visualizer: boolean;
  show_animation: string;
  hide_animation: string;
  is_demo: boolean;
};

type Profile = {
  _id: string;
  user_id: string;
  profile_id: string;
  name: string;
  music_service: string;
  settings: Settings;
  created_at: string;
  updated_at: string;
};

const DEFAULTS: Settings = {
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
  is_demo: false,
};

const SKINS = [
  { id: "compact", name: "Compact", tier: "FREE", hasCover: true },
  { id: "boxy", name: "Boxy", tier: "FREE", hasCover: true },
  { id: "gallery", name: "Gallery", tier: "FREE", hasCover: true },
  { id: "minimal", name: "Minimal", tier: "FREE", hasCover: true },
  { id: "macos", name: "macOS", tier: "PRO", hasCover: true },
  { id: "shell", name: "Shell", tier: "PRO", hasCover: false },
  { id: "windows98", name: "Windows 98", tier: "PRO", hasCover: true },
  { id: "discord", name: "Discord", tier: "DISCORD", hasCover: true },
];
const COVERS = [
  { id: "square", name: "Square" },
  { id: "canvas", name: "Canvas" },
  { id: "vinyl", name: "Vinyl" },
  { id: "none", name: "None" },
];
const THEMES = [
  { id: "default_dark", name: "Dark Mode" },
  { id: "default_light", name: "Light Mode" },
];
const FONTS = [
  ["poppins", "Poppins"], ["fredoka", "Fredoka"], ["spacemono", "Space Mono"], ["silkscreen", "Silkscreen"],
  ["bagelFatOne", "Bagel Fat One"], ["gasoekOne", "Gasoek One"], ["zcoolKuaile", "ZCOOL KuaiLe"],
  ["zcoolQingkeHuangyou", "ZCOOL QingKe HuangYou"], ["singleDay", "Single Day"], ["jua", "Jua"],
  ["russoOne", "Russo One"], ["monomakh", "Monomakh"], ["notoSerifDisplay", "Noto Serif Display"], ["openDyslexic", "Open Dyslexic"],
].map(([id, name]) => ({ id, name }));
const SHOW = ["default_in", "fade_in", "slide_in_left", "slide_in_right", "slide_in_top", "slide_in_bottom", "grow_in", "shrink_in", "swing_rotate_in_left", "swing_rotate_in_right", "tilt_in_right", "tilt_in_left"];
const HIDE = ["default_out", "fade_out", "slide_out_left", "slide_out_right", "slide_out_top", "slide_out_bottom", "grow_out", "shrink_out", "swing_rotate_out_left", "swing_rotate_out_right", "tilt_out_right", "tilt_out_left"];

const inputClass = "rounded-lg border border-line bg-black/40 p-2 text-sm text-white";
const chipAction = "shrink-0 whitespace-nowrap rounded-md border border-line px-2 py-0.5 text-[10px] font-semibold text-white/60 transition hover:border-white/30 hover:text-white";
const primaryBtn = "rounded-lg border border-white/60 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40";
const ghostBtn = "rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40";

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState("main");
  const [profilesError, setProfilesError] = useState("");
  const [tier, setTier] = useState<string>("free");
  const [status, setStatus] = useState<string>("inactive");
  const [discordMember, setDiscordMember] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const iframe = useRef<HTMLIFrameElement>(null);
  const loadedProfileRef = useRef<string | null>(null);
  const settingsRef = useRef<Settings>(DEFAULTS);

  const active = status === "active";
  const subscribed = status === "active" && tier !== "free";
  const plan = active ? (tier === "supporter" ? "DISCORD" : tier.toUpperCase()) : "FREE";
  const freeAtLimit = !subscribed && profiles.length >= FREE_PROFILE_LIMIT;
  const currentProfile = profiles.find((p) => p.profile_id === currentProfileId);

  const loadSub = () =>
    Promise.all([
      fetch("/api/users/subscription", { headers: AUTH }).then((r) => r.json()),
      fetch("/api/users", { headers: AUTH }).then((r) => r.json()),
    ])
      .then(([s, u]) => {
        setTier(s?.tier || "free");
        setStatus(s?.status || "inactive");
        setDiscordMember(!!u?.is_discord_member);
      })
      .catch(() => {});

  useEffect(() => {
    fetch("/api/widgets/amuse/profiles", { headers: AUTH })
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setProfiles(list as Profile[]);
      })
      .catch(() => setProfilesError("Failed to load profiles"));
    loadSub();
  }, []);

  // Load the selected profile's settings from the list response (no extra GET).
  useEffect(() => {
    if (loadedProfileRef.current === currentProfileId) return;
    const p = profiles.find((x) => x.profile_id === currentProfileId);
    if (!p) return;
    loadedProfileRef.current = currentProfileId;
    setSettings({ ...DEFAULTS, ...p.settings });
  }, [currentProfileId, profiles]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const save = useCallback(
    (next: Settings) => {
      setSaved("saving");
      fetch(`/api/widgets/amuse/profiles/${currentProfileId}`, {
        method: "PATCH",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ settings: next }),
      })
        .then(() => {
          setSaved("saved");
          setTimeout(() => setSaved("idle"), 800);
        })
        .catch(() => setSaved("idle"));
    },
    [currentProfileId]
  );

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = { ...settingsRef.current, [k]: v };
    settingsRef.current = next;
    setSettings(next);
    save(next);
  };

  const locked = (skin: (typeof SKINS)[number]) => {
    if (skin.tier === "PRO") return !active;
    // real Amuse rule: an active subscription, or linked Discord + membership, unlocks Discord
    if (skin.tier === "DISCORD") return !(active || discordMember);
    return false;
  };

  const createProfile = () => {
    const name = newName.trim();
    if (!name) {
      setAddError("Profile name cannot be empty");
      return;
    }
    setAddBusy(true);
    setAddError("");
    fetch("/api/widgets/amuse/profiles", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setAddError(data?.error || "Failed to create profile");
          return;
        }
        const created = data as Profile;
        setProfiles((ps) => [...ps, created]);
        setCurrentProfileId(created.profile_id);
        setCreating(false);
        setNewName("");
      })
      .catch(() => setAddError("Failed to create profile"))
      .finally(() => setAddBusy(false));
  };

  const renameProfile = (id: string) => {
    const name = renameValue.trim();
    if (!name) {
      setRenameError("Profile name cannot be empty");
      return;
    }
    setRenameBusy(true);
    setRenameError("");
    fetch(`/api/widgets/amuse/profiles/${id}`, {
      method: "PATCH",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setRenameError(data?.error || "Failed to rename profile");
          return;
        }
        const updated = data as Profile;
        setProfiles((ps) => ps.map((p) => (p.profile_id === id ? updated : p)));
        setRenamingId(null);
        setRenameValue("");
      })
      .catch(() => setRenameError("Failed to rename profile"))
      .finally(() => setRenameBusy(false));
  };

  const deleteProfile = (id: string) => {
    setDeleteBusy(true);
    setProfilesError("");
    fetch(`/api/widgets/amuse/profiles/${id}`, { method: "DELETE", headers: AUTH })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setProfilesError(data?.error || "Failed to delete profile");
          return;
        }
        setProfiles((ps) => ps.filter((p) => p.profile_id !== id));
        if (currentProfileId === id) setCurrentProfileId("main");
        setDeleteId(null);
      })
      .catch(() => setProfilesError("Failed to delete profile"))
      .finally(() => setDeleteBusy(false));
  };

  const copyProfileId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  };

  const overlayUrl = new URL(
    WIDGET_PATH + (currentProfileId !== "main" ? "/" + currentProfileId : ""),
    window.location.origin
  ).href;

  const card = "rounded-2xl border border-line bg-card p-5";
  const sectionTitle = "mb-3 font-poppins text-sm uppercase tracking-widest text-white/50";

  return (
    <div className="min-h-screen bg-ink font-poppins">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 p-8 lg:flex-row">
        <main className="min-w-0 flex-1">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-poppins text-3xl font-black text-white">Amuse</h1>
              <p className="text-sm text-white/50">Widget control panel</p>
            </div>
            <div className="flex items-center gap-3">
              <span data-plan className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-white/70">
                {plan}
                {discordMember && plan !== "DISCORD" ? " · DISCORD" : ""}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(overlayUrl)}
                className="rounded-xl bg-gradient-to-br from-white to-white/70 px-4 py-2 text-sm font-semibold text-black shadow-lg transition hover:opacity-90"
              >
                Copy overlay URL
              </button>
            </div>
          </header>

          <section className={`${card} mb-6`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-poppins text-sm uppercase tracking-widest text-white/50">Profiles</h2>
              <div className="flex items-center gap-3">
                {freeAtLimit && (
                  <span data-profile-hint className="text-[11px] text-white/40">
                    Free plan: up to 3 profiles. Upgrade for unlimited.
                  </span>
                )}
                <button
                  data-add-profile
                  disabled={creating || freeAtLimit}
                  onClick={() => {
                    setCreating(true);
                    setNewName("");
                    setAddError("");
                  }}
                  className={primaryBtn}
                >
                  Add Profile
                </button>
              </div>
            </div>

            {profilesError && (
              <p data-profiles-error className="mb-3 text-xs text-red-400">
                {profilesError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {profiles.map((p) => {
                const isMain = p.profile_id === "main";
                const selected = p.profile_id === currentProfileId;
                return (
                  <div
                    key={p.profile_id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${
                      selected ? "border-white/80 bg-white/10" : "border-line"
                    }`}
                  >
                    <button data-profile={p.profile_id} onClick={() => setCurrentProfileId(p.profile_id)} className="min-w-0 text-left">
                      <span className="block truncate text-sm font-semibold text-white">{p.name}</span>
                      <span className="block text-[10px] uppercase tracking-wider text-white/60">{p.profile_id}</span>
                    </button>
                    {isMain && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70">Default</span>
                    )}
                    {!isMain && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button data-copy-id onClick={() => copyProfileId(p.profile_id)} className={chipAction}>
                          {copiedId === p.profile_id ? "Copied!" : "Copy ID"}
                        </button>
                        <button
                          data-edit-profile
                          onClick={() => {
                            setRenamingId(p.profile_id);
                            setRenameValue(p.name);
                            setRenameError("");
                          }}
                          className={chipAction}
                        >
                          Edit
                        </button>
                        <button
                          data-delete-profile
                          onClick={() => {
                            setDeleteId(p.profile_id);
                            setProfilesError("");
                          }}
                          className={chipAction}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {profiles.length === 0 && !profilesError && <span className="text-xs text-white/40">Loading profiles…</span>}
            </div>

            {creating && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                <input
                  data-new-profile-name
                  autoFocus
                  value={newName}
                  maxLength={30}
                  placeholder="New profile name"
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setAddError("");
                  }}
                  className={inputClass}
                />
                <button onClick={createProfile} disabled={addBusy} className={primaryBtn}>
                  {addBusy ? "Adding…" : "Create"}
                </button>
                <button onClick={() => setCreating(false)} className={ghostBtn}>
                  Cancel
                </button>
                {addError && <span className="text-xs text-red-400">{addError}</span>}
              </div>
            )}

            {renamingId && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                <input
                  data-rename-input
                  autoFocus
                  value={renameValue}
                  maxLength={30}
                  placeholder="Profile name"
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setRenameError("");
                  }}
                  className={inputClass}
                />
                <button onClick={() => renameProfile(renamingId)} disabled={renameBusy} className={primaryBtn}>
                  {renameBusy ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setRenamingId(null)} className={ghostBtn}>
                  Cancel
                </button>
                {renameError && <span className="text-xs text-red-400">{renameError}</span>}
              </div>
            )}

            {deleteId && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                <span className="text-xs text-white/70">
                  Delete “{profiles.find((p) => p.profile_id === deleteId)?.name ?? deleteId}”? This cannot be undone.
                </span>
                <button onClick={() => deleteProfile(deleteId)} disabled={deleteBusy} className={primaryBtn}>
                  {deleteBusy ? "Deleting…" : "Delete"}
                </button>
                <button onClick={() => setDeleteId(null)} className={ghostBtn}>
                  Cancel
                </button>
              </div>
            )}
          </section>

          <section className={`${card} mb-6`}>
            <h2 className={sectionTitle}>Skin</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {SKINS.map((skin) => {
                const isLocked = locked(skin);
                const selected = settings.skin === skin.id;
                return (
                  <button
                    key={skin.id}
                    data-skin={skin.id}
                    data-locked={isLocked}
                    disabled={isLocked}
                    onClick={() => update("skin", skin.id)}
                    className={`relative overflow-hidden rounded-xl border p-3 text-left transition ${
                      selected ? "border-white/80 ring-2 ring-white/60" : "border-line hover:border-white/30"
                    } ${isLocked ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-black/40">
                      <img src={`${WIDGET_PATH.replace(/\/widget\/.*/, "")}/assets/${skinImg(skin.id)}`} alt="" className="max-h-16" />
                    </div>
                    <div className="text-sm font-semibold text-white">{skin.name}</div>
                    <div className="text-[11px] uppercase tracking-wider text-white/40">{skin.tier}</div>
                    {isLocked && <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">Unlock</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className={card}>
              <h2 className={sectionTitle}>Cover</h2>
              <div className="flex flex-wrap gap-2">
                {COVERS.map((c) => (
                  <button
                    key={c.id}
                    data-cover={c.id}
                    onClick={() => update("cover", c.id)}
                    className={`rounded-lg border px-4 py-2 text-sm transition ${settings.cover === c.id ? "border-white/80 bg-white/10 text-white" : "border-line text-white/60 hover:border-white/30"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </section>
            <section className={card}>
              <h2 className={sectionTitle}>Theme</h2>
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    data-theme={t.id}
                    onClick={() => update("theme", t.id)}
                    className={`rounded-lg border px-4 py-2 text-sm transition ${settings.theme === t.id ? "border-white/80 bg-white/10 text-white" : "border-line text-white/60 hover:border-white/30"}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className={`${card} mb-6`}>
            <h2 className={sectionTitle}>Font</h2>
            <div className="flex flex-wrap gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  data-font={f.id}
                  onClick={() => update("font", f.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${settings.font === f.id ? "border-white/80 bg-white/10 text-white" : "border-line text-white/60 hover:border-white/30"}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </section>

          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className={card}>
              <h2 className={sectionTitle}>Show animation</h2>
              <select
                data-show
                value={settings.show_animation}
                onChange={(e) => update("show_animation", e.target.value)}
                className="w-full rounded-lg border border-line bg-black/40 p-2 text-sm text-white"
              >
                {SHOW.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <h2 className={`${sectionTitle} mt-5`}>Hide animation</h2>
              <select
                data-hide
                value={settings.hide_animation}
                onChange={(e) => update("hide_animation", e.target.value)}
                className="w-full rounded-lg border border-line bg-black/40 p-2 text-sm text-white"
              >
                {HIDE.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </section>
            <section className={card}>
              <h2 className={sectionTitle}>Timing</h2>
              <label className="mb-1 block text-xs text-white/50">Visible duration</label>
              <select
                data-duration
                value={settings.visible_duration}
                onChange={(e) => update("visible_duration", Number(e.target.value))}
                className="mb-4 w-full rounded-lg border border-line bg-black/40 p-2 text-sm text-white"
              >
                {[5, 10, 15, 20, 25, 30].map((s) => (
                  <option key={s} value={s}>
                    {s} seconds
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-xs text-white/50">Hide delay</label>
              <select
                data-delay
                value={settings.hide_delay}
                onChange={(e) => update("hide_delay", Number(e.target.value))}
                className="w-full rounded-lg border border-line bg-black/40 p-2 text-sm text-white"
              >
                {[0, 5, 10, 20, 30, 40, 50, 60].map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? "No delay" : `${s} seconds`}
                  </option>
                ))}
              </select>
            </section>
          </div>
        </main>

        <aside className="h-fit w-full lg:sticky lg:top-8 lg:w-[480px] lg:shrink-0">
          <div className={`${card} flex flex-col items-center gap-4`}>
            <div className="flex w-full items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Live preview</span>
              <span data-save-state className="text-xs text-white/60">
                {saved === "saving" ? "saving…" : saved === "saved" ? "saved" : "synced"}
              </span>
            </div>
            <div className="flex h-[420px] w-full items-center justify-center overflow-hidden rounded-xl bg-[#0e0e0e]">
              <iframe
                key={currentProfileId}
                ref={iframe}
                title="Amuse widget"
                src={overlayUrl}
                className="h-[420px] w-full border-0"
              />
            </div>
            <div data-preview-state className="w-full break-all text-center text-[11px] text-white/40">
              profile={currentProfile?.name ?? currentProfileId} ({currentProfileId}) · skin={settings.skin} · cover={settings.cover} · theme={settings.theme} · font={settings.font}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-white/50">
            Local reproduction · widget served at <code className="text-white/50">{overlayUrl}</code>
          </p>
        </aside>
      </div>
    </div>
  );
}

function skinImg(id: string): string {
  const map: Record<string, string> = {
    compact: "compact-CQiUdgmT.svg",
    boxy: "boxy-BucZ6z4D.svg",
    gallery: "big-cover-DUHeEaO7.svg",
    minimal: "minimal-lTckpbhQ.svg",
    macos: "macOS-DHIESALH.svg",
    shell: "shell-fSpeMdMs.svg",
    windows98: "windows98-DTy_973X.svg",
    discord: "discord-hPuUPOwv.svg",
  };
  return map[id] || "boxy-BucZ6z4D.svg";
}
