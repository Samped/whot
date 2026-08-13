/** Table-session playlist — royalty-free beds that rotate one after another. */
export type TableTrack = {
  id: string;
  title: string;
  mood: string;
  src: string;
};

export const TABLE_PLAYLIST: TableTrack[] = [
  {
    id: "soft-breeze",
    title: "Soft Breeze",
    mood: "Chill instrumental",
    src: "/music/soft-breeze.mp3",
  },
  {
    id: "rise-line",
    title: "Rise Line",
    mood: "Uplift instrumental",
    src: "/music/rise-line.mp3",
  },
  {
    id: "warm-pulse",
    title: "Warm Pulse",
    mood: "Motivational groove",
    src: "/music/warm-pulse.mp3",
  },
  {
    id: "golden-hour",
    title: "Golden Hour",
    mood: "Sunset chill",
    src: "/music/golden-hour.mp3",
  },
  {
    id: "blue-swing",
    title: "Blue Swing",
    mood: "Bluesy instrumental",
    src: "/music/blue-swing.mp3",
  },
  {
    id: "heart-tempo",
    title: "Heart Tempo",
    mood: "Smooth love instrumental",
    src: "/music/heart-tempo.mp3",
  },
  {
    id: "night-drive",
    title: "Night Drive",
    mood: "Late-night love vibe",
    src: "/music/night-drive.mp3",
  },
  {
    id: "late-glow",
    title: "Late Glow",
    mood: "Warm night groove",
    src: "/music/late-glow.mp3",
  },
  {
    id: "velvet-hour",
    title: "Velvet Hour",
    mood: "Soft bluesy bed",
    src: "/music/velvet-hour.mp3",
  },
];

export const MUSIC_PREF_KEY = "whot-table-music";
