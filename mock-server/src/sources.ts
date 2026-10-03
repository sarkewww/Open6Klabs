/**
 * mock-server/src/sources.ts
 * Six local music-source adapters reconstructed from AmuseWidget's source
 * branches. Each reports a connection state + error code and yields a track.
 */

export type SourceId = "spotify" | "pear-desktop" | "ytm-desktop" | "apple-music" | "tidal" | "spicetify";

export type SourceError =
  | null
  | "NO_SPOTIFY_ACCOUNT"
  | "YTMD_NOT_CONNECTED"
  | "SPOTIFY_FREE_ACCOUNT"
  | "SPOTIFY_TOKEN_EXPIRED"
  | "SERVER_ERROR";

export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  progress: number;
  cover_url: string;
  canvas_url?: string | null;
  is_playing: boolean;
};

export const SOURCES: SourceId[] = ["spotify", "pear-desktop", "ytm-desktop", "apple-music", "tidal", "spicetify"];

export const DEMO_TRACKS: Array<Pick<Track, "id" | "title" | "artist" | "duration">> = [
  { id: "demo-1", title: "STAY LOW", artist: "MISTERK, FANNYMAGNET, Tphunk", duration: 214000 },
  { id: "demo-2", title: "Midnight City", artist: "M83", duration: 243000 },
  { id: "demo-3", title: "Blinding Lights", artist: "The Weeknd", duration: 200000 },
  { id: "demo-4", title: "Levitating", artist: "Dua Lipa", duration: 203000 },
  { id: "demo-5", title: "Sunflower", artist: "Post Malone, Swae Lee", duration: 158000 },
  { id: "demo-6", title: "As It Was", artist: "Harry Styles", duration: 167000 },
  { id: "demo-7", title: "Heat Waves", artist: "Glass Animals", duration: 238000 },
  { id: "demo-8", title: "Stay", artist: "The Kid LAROI, Justin Bieber", duration: 141000 },
  { id: "demo-9", title: "Peaches", artist: "Justin Bieber", duration: 198000 },
  { id: "demo-10", title: "Good 4 U", artist: "Olivia Rodrigo", duration: 178000 },
  { id: "demo-11", title: "Montero", artist: "Lil Nas X", duration: 137000 },
  { id: "demo-12", title: "Kiss Me More", artist: "Doja Cat", duration: 208000 },
  { id: "demo-13", title: "Save Your Tears", artist: "The Weeknd", duration: 215000 },
  { id: "demo-14", title: "Dynamite", artist: "BTS", duration: 199000 },
  { id: "demo-15", title: "Watermelon Sugar", artist: "Harry Styles", duration: 174000 },
  { id: "demo-16", title: "Don't Start Now", artist: "Dua Lipa", duration: 183000 },
  { id: "demo-17", title: "Circles", artist: "Post Malone", duration: 215000 },
  { id: "demo-18", title: "The Box", artist: "Roddy Ricch", duration: 197000 },
  { id: "demo-19", title: "Rockstar", artist: "DaBaby, Roddy Ricch", duration: 181000 },
  { id: "demo-20", title: "Savage Love", artist: "Jawsh 685, Jason Derulo", duration: 171000 },
];

const COVER = "/assets/spotify_no_cover-DlW0D82t.svg";

export type Adapter = { id: SourceId; connected: boolean; error: SourceError; index: number };

export function createAdapters() {
  const map = new Map<SourceId, Adapter>();
  for (const id of SOURCES) map.set(id, { id, connected: id !== "spotify", error: id === "spotify" ? "NO_SPOTIFY_ACCOUNT" : null, index: 0 });

  function nowPlaying(id: SourceId): { track?: Track; error?: Exclude<SourceError, null> } {
    const a = map.get(id);
    if (!a) return { error: "SERVER_ERROR" };
    if (a.error) return { error: a.error };
    if (!a.connected) return { error: "YTMD_NOT_CONNECTED" };
    const d = DEMO_TRACKS[a.index % DEMO_TRACKS.length];
    a.index++;
    return {
      track: {
        id: d.id,
        title: d.title,
        artist: d.artist,
        duration: d.duration,
        progress: Math.floor(d.duration * 0.25),
        cover_url: COVER,
        canvas_url: null,
        is_playing: true,
      },
    };
  }

  return {
    list: () => [...map.values()],
    status: (id: SourceId) => map.get(id),
    connect: (id: SourceId) => {
      const a = map.get(id);
      if (a) {
        a.connected = true;
        a.error = null;
      }
    },
    disconnect: (id: SourceId) => {
      const a = map.get(id);
      if (a) {
        a.connected = false;
        a.error = "YTMD_NOT_CONNECTED";
      }
    },
    setError: (id: SourceId, error: SourceError) => {
      const a = map.get(id);
      if (a) a.error = error;
    },
    nowPlaying,
  };
}
