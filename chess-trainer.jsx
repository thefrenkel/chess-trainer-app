import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  Play, Square, RotateCcw, CheckCircle2, Plus, Minus,
  ChevronLeft, ChevronRight, Calendar, Timer, Trophy,
  Flame, Target, Brain, Swords, BookOpen, Gamepad2,
  Sun, Moon, Volume2, VolumeX, GripVertical, Zap,
  Clock, BarChart3, TrendingUp, Activity, CalendarDays
} from "lucide-react";

const APP_TITLE = "Chess Trainer Analysis";
const APP_SUBTITLE = "Standalone training dashboard with synced history";
const APP_ICON_DATA_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='12' y1='10' x2='54' y2='52' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%2360a5fa'/%3E%3Cstop offset='1' stop-color='%2322c55e'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='16' fill='%230f172a'/%3E%3Crect x='8' y='8' width='48' height='48' rx='14' fill='%23172235' stroke='%23293b55'/%3E%3Cpath d='M23 18h18v4h-4l2.1 5.8c4.6 1.8 6.9 4.5 6.9 8.2 0 3.9-3 6.7-9.1 8.2L39 49H25l2.1-4.8C21 42.7 18 39.9 18 36c0-3.7 2.3-6.4 6.9-8.2L27 22h-4v-4Z' fill='url(%23g)'/%3E%3Ccircle cx='32' cy='32' r='8.5' fill='none' stroke='%23f8fafc' stroke-width='3.2'/%3E%3Cpath d='M38.5 38.5 46 46' stroke='%23f8fafc' stroke-width='3.2' stroke-linecap='round'/%3E%3C/svg%3E";

// ─── Helpers ──────────────────────────────────────────────
const dateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const today = () => dateKey(new Date());
const parseDate = (dk) => {
  const [y, m, d] = dk.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (dk, n) => {
  const d = parseDate(dk);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
const fmtDate = (dk) => {
  const d = parseDate(dk);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};
const fmtShortDate = (dk) => {
  const d = parseDate(dk);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
const fmtTime = (secs) => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const GAMES_APP_STORAGE_KEY = "chess-trainer-game-analysis-v2";
const LEGACY_GAMES_BRIDGE_KEY = "chess-trainer-v4";

const TASK_DEFS = {
  chessimo: { label: "Chessimo Tactics", sub: "Complete 1 full unit", metric: "Puzzles solved", icon: Target, color: "blue", cat: "Tactics" },
  chessableTactics: { label: "Chessable Tactics", sub: "Review tactical patterns", metric: "Patterns reviewed", icon: Brain, color: "purple", cat: "Tactics" },
  openings: { label: "Openings Review", sub: "", metric: "Lines reviewed", icon: BookOpen, color: "emerald", cat: "Openings" },
  games: { label: "Play Games", sub: "Play at least 2 games", metric: "Games played", icon: Gamepad2, color: "amber", cat: "Games" },
};
const TASK_KEYS = ["chessimo", "chessableTactics", "openings", "games"];

const emptyTask = () => ({ done: false, elapsedSeconds: 0, timerRunning: false, timerStartedAt: null, count: 0 });
const emptyDay = () => ({
  tasks: { chessimo: emptyTask(), chessableTactics: emptyTask(), openings: emptyTask(), games: emptyTask() },
  energy: 3, focus: 3, notes: "", dailyScore: "", dailyElo: "", started: false, completedAt: null,
});

const isTaskComplete = (key, t) => {
  if (t.done) return true;
  if (key === "games") return t.count >= 2;
  return t.count >= 1;
};
const dayCompletionScore = (day) => TASK_KEYS.reduce((n, k) => n + (isTaskComplete(k, day.tasks[k]) ? 1 : 0), 0);
const isDayComplete = (day) => dayCompletionScore(day) === 4;
const hasTaskData = (task = {}) => (
  !!task.done ||
  !!task.timerRunning ||
  Number(task.count) > 0 ||
  Number(task.elapsedSeconds) > 0
);
const hasHistoryDayData = (day = {}) => (
  TASK_KEYS.some((key) => hasTaskData(day.tasks?.[key])) ||
  !!String(day.dailyScore || "").trim() ||
  !!String(day.dailyElo || "").trim() ||
  !!String(day.notes || "").trim() ||
  !!day.started ||
  !!day.completedAt
);

const totalSeconds = (day) => TASK_KEYS.reduce((s, k) => {
  const t = day.tasks[k];
  let e = t.elapsedSeconds;
  if (t.timerRunning && t.timerStartedAt) e += (Date.now() - t.timerStartedAt) / 1000;
  return s + e;
}, 0);

const DEFAULT_SECTIONS = ["today", "dailyPlan", "stats", "activity", "eloTrend", "trainingGraphs", "last7"];

// ─── Storage ──────────────────────────────────────────────
const STORAGE_KEY = "chess-trainer-analysis-v1";
const LEGACY_STORAGE_KEYS = [STORAGE_KEY, "chess-trainer-v1", "chess-trainer-v4"];
const normalizeTask = (task = {}) => ({
  done: !!task.done,
  elapsedSeconds: Number(task.elapsedSeconds) || 0,
  timerRunning: !!task.timerRunning,
  timerStartedAt: task.timerStartedAt || null,
  count: Number(task.count) || 0,
});
const normalizeHistoryDay = (day = {}) => {
  const chessableBreakdown = day.tacticsBreakdown?.chessable || {};
  const chessableTactics = normalizeTask(day.tasks?.chessableTactics || chessableBreakdown);
  const mergedTactics = normalizeTask(day.tasks?.tactics);
  const nonChessableCount =
    (Number(day.tacticsBreakdown?.lichess?.count) || 0) +
    (Number(day.tacticsBreakdown?.chesscom?.count) || 0);
  const nonChessableSeconds =
    (Number(day.tacticsBreakdown?.lichess?.elapsedSeconds) || 0) +
    (Number(day.tacticsBreakdown?.chesscom?.elapsedSeconds) || 0);
  const chessimo = normalizeTask(day.tasks?.chessimo || {
    count: nonChessableCount || Math.max(0, mergedTactics.count - chessableTactics.count),
    elapsedSeconds: nonChessableSeconds || Math.max(0, mergedTactics.elapsedSeconds - chessableTactics.elapsedSeconds),
    timerRunning: mergedTactics.timerRunning && !chessableTactics.timerRunning,
    timerStartedAt: mergedTactics.timerRunning && !chessableTactics.timerRunning ? mergedTactics.timerStartedAt : null,
  });
  return {
    tasks: {
      chessimo,
      chessableTactics,
      openings: normalizeTask(day.tasks?.openings),
      games: normalizeTask(day.tasks?.games),
    },
    energy: Number(day.energy) || 3,
    focus: Number(day.focus) || 3,
    notes: day.notes || "",
    dailyScore: day.dailyScore || "",
    dailyElo: day.dailyElo ? String(day.dailyElo) : "",
    started: !!day.started,
    completedAt: day.completedAt || null,
  };
};
const normalizeStore = (store = {}) => {
  const history = Object.fromEntries(
    Object.entries(store.history || {}).map(([dk, day]) => [dk, normalizeHistoryDay(day)])
  );
  const sectionOrder = Array.isArray(store.sectionOrder)
    ? store.sectionOrder.filter((id) => DEFAULT_SECTIONS.includes(id))
    : [];
  return {
    history,
    isDark: store.isDark ?? true,
    soundOn: store.soundOn ?? false,
    sectionOrder: sectionOrder.length ? sectionOrder : DEFAULT_SECTIONS,
  };
};
const loadStore = () => {
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeStore(JSON.parse(raw));
    } catch {}
  }
  return normalizeStore();
};
const saveStore = (s) => {
  const raw = JSON.stringify(s);
  try { localStorage.setItem(STORAGE_KEY, raw); } catch {}
  try { localStorage.setItem("chess-trainer-v1", raw); } catch {}
};

// ─── Audio ──────────────────────────────────────────────
let audioCtx = null;
const ensureAudio = () => { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); };
const playClick = () => {
  try {
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine"; o.frequency.value = 1200;
    g.gain.setValueAtTime(0.08, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.06);
  } catch {}
};
const playTick = () => {
  try {
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine"; o.frequency.value = 800;
    g.gain.setValueAtTime(0.04, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.04);
  } catch {}
};

const getGamesAppUrl = () => {
  return new URL("../chessable-auto-tracker/analysis/index.html", window.location.href).href;
};

const readStoredJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const normalizeSeededReview = (review = {}) => ({
  story: String(review?.story || ""),
  tags: Array.isArray(review?.tags) ? [...review.tags] : [],
  updatedAt: typeof review?.updatedAt === "number" ? review.updatedAt : null,
});

const normalizeSeededAnalysis = (analysis = {}) => ({
  status: ["matched", "player_deviation", "opponent_deviation", "book_exhausted", "no_book"].includes(analysis?.status)
    ? analysis.status
    : "no_book",
  matchedEntryId: analysis?.matchedEntryId || null,
  matchedLineName: analysis?.matchedLineName || null,
  matchedPlies: Number.isFinite(Number(analysis?.matchedPlies)) ? Number(analysis.matchedPlies) : 0,
  deviationPly: Number.isFinite(Number(analysis?.deviationPly)) ? Number(analysis.deviationPly) : null,
  deviationMoveNumber: Number.isFinite(Number(analysis?.deviationMoveNumber)) ? Number(analysis.deviationMoveNumber) : null,
  deviationActor: ["player", "opponent", "none"].includes(analysis?.deviationActor) ? analysis.deviationActor : "none",
  expectedSan: analysis?.expectedSan || null,
  playedSan: analysis?.playedSan || null,
});

const seedGamesAppState = () => {
  const bridge = readStoredJson(LEGACY_GAMES_BRIDGE_KEY)?.gameAnalysis;
  if (!bridge || typeof bridge !== "object") return;

  const existing = readStoredJson(GAMES_APP_STORAGE_KEY) || {};
  const bridgeGames = Array.isArray(bridge.games) ? bridge.games : [];
  const seededGames = bridgeGames.map((game) => ({
    id: String(game?.id || ""),
    source: game?.source === "chesscom" ? "chesscom" : "lichess",
    externalId: String(game?.id || "").split(":").pop() || String(game?.id || ""),
    url: String(game?.url || ""),
    pgn: "",
    moves: [],
    playedAt: Number(game?.playedAt) || 0,
    rated: true,
    speed: ["bullet", "blitz", "rapid"].includes(game?.speed) ? game.speed : "unknown",
    timeControl: "",
    color: game?.color === "black" ? "black" : "white",
    result: ["win", "loss", "draw"].includes(game?.result) ? game.result : "unknown",
    playerUsername: "",
    opponentUsername: "",
    playerRating: null,
    opponentRating: null,
    openingName: game?.openingName || null,
    eco: null,
    accuracy: typeof game?.accuracy === "number" ? game.accuracy : null,
    playerClockSeconds: null,
    opponentClockSeconds: null,
    clockDeltaSeconds: typeof game?.clockDeltaSeconds === "number" ? game.clockDeltaSeconds : null,
    analysis: normalizeSeededAnalysis(game?.analysis),
    review: normalizeSeededReview(game?.review),
  })).filter((game) => game.id);

  const nextState = {
    settings: {
      lichessUsername: String(bridge?.settings?.lichessUsername || existing?.settings?.lichessUsername || "").trim(),
      chessComUsername: String(bridge?.settings?.chessComUsername || existing?.settings?.chessComUsername || "").trim(),
      maxGamesPerSource: Math.max(10, Math.min(200, Number(bridge?.settings?.maxGamesPerSource || existing?.settings?.maxGamesPerSource || 80))),
    },
    books: existing?.books && typeof existing.books === "object" ? existing.books : { white: null, black: null },
    games: seededGames.length ? seededGames : (Array.isArray(existing?.games) ? existing.games : []),
    lastSyncedAt: Number(bridge?.syncedAt || existing?.lastSyncedAt) || null,
    lastSyncError: existing?.lastSyncError || null,
  };

  try {
    localStorage.setItem(GAMES_APP_STORAGE_KEY, JSON.stringify(nextState));
  } catch {}
};

const openGamesAppTarget = (target) => {
  try {
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (opened) return;
  } catch {}

  try {
    const link = document.createElement("a");
    link.href = target;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {}
};

const AppMark = () => (
  <span className="w-10 h-10 rounded-xl border border-sky-400/20 bg-gradient-to-br from-blue-500/20 to-green-500/15 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
    <svg viewBox="0 0 64 64" className="w-6 h-6" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="reactAppMarkGrad" x1="16" y1="12" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60a5fa" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <path d="M23 18h18v4h-4l2.1 5.8c4.6 1.8 6.9 4.5 6.9 8.2 0 3.9-3 6.7-9.1 8.2L39 49H25l2.1-4.8C21 42.7 18 39.9 18 36c0-3.7 2.3-6.4 6.9-8.2L27 22h-4v-4Z" fill="url(#reactAppMarkGrad)" />
      <circle cx="32" cy="32" r="8.5" fill="none" stroke="#f8fafc" strokeWidth="3.2" />
      <path d="M38.5 38.5 46 46" stroke="#f8fafc" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  </span>
);

// ─── Small Components ─────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, isDark }) => (
  <div className={`rounded-2xl p-4 ${isDark ? "bg-slate-800/60 border border-slate-700/50" : "bg-white border border-gray-200"} flex flex-col gap-1`}>
    <div className="flex items-center gap-2 mb-1">
      <Icon size={16} className={isDark ? "text-slate-400" : "text-gray-400"} />
      <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-500"}`}>{label}</span>
    </div>
    <div className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{value}</div>
    {sub && <span className={`text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>{sub}</span>}
  </div>
);

const NumberStepper = ({ value, onChange, label, isDark }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"} min-w-0`}>{label}</span>
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={() => { onChange(Math.max(0, value - 1)); }} className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"} transition-colors`}><Minus size={14} /></button>
        {editing ? (
          <input autoFocus type="text" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => { setEditing(false); const n = parseInt(draft, 10); onChange(isNaN(n) ? 0 : Math.max(0, n)); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
            className={`w-12 h-7 text-center text-sm rounded-lg ${isDark ? "bg-slate-600 text-white border-slate-500" : "bg-gray-50 text-gray-900 border-gray-300"} border outline-none`}
          />
        ) : (
          <button onClick={() => { setEditing(true); setDraft(String(value)); }}
            className={`w-12 h-7 text-center text-sm font-semibold rounded-lg ${isDark ? "bg-slate-700/50 text-white hover:bg-slate-600" : "bg-gray-50 text-gray-900 hover:bg-gray-100"} transition-colors`}>{value}</button>
        )}
        <button onClick={() => onChange(value + 1)} className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"} transition-colors`}><Plus size={14} /></button>
      </div>
    </div>
  );
};

const SliderCard = ({ label, value, onChange, isDark }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-500"}`}>{label}</span>
      <span className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{value}/5</span>
    </div>
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((v) => (
        <button key={v} onClick={() => onChange(v)}
          className={`flex-1 h-7 rounded-lg text-xs font-semibold transition-all ${v <= value ? "bg-blue-500 text-white" : isDark ? "bg-slate-700 text-slate-400 hover:bg-slate-600" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>{v}</button>
      ))}
    </div>
  </div>
);

// ─── Heatmap ──────────────────────────────────────────────
const ActivityHeatmap = ({ history, selectedDay, onSelect, isDark }) => {
  const weeks = useMemo(() => {
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 363);
    const dow = start.getDay();
    if (dow !== 0) start.setDate(start.getDate() - dow);
    const result = [];
    let week = [];
    const cur = new Date(start);
    while (cur <= end || week.length > 0) {
      const dk = dateKey(cur);
      const day = history[dk];
      const score = day ? dayCompletionScore(day) : 0;
      week.push({ dk, score, future: cur > end });
      if (week.length === 7) { result.push(week); week = []; }
      cur.setDate(cur.getDate() + 1);
    }
    if (week.length) { while (week.length < 7) week.push({ dk: "", score: 0, future: true }); result.push(week); }
    return result;
  }, [history]);

  const months = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    weeks.forEach((w, i) => {
      const d = parseDate(w[0].dk || today());
      if (d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        labels.push({ idx: i, label: d.toLocaleDateString("en-US", { month: "short" }) });
      }
    });
    return labels;
  }, [weeks]);

  const colors = isDark
    ? ["#1e293b", "#1e3a5f", "#2563eb", "#3b82f6", "#60a5fa"]
    : ["#e2e8f0", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6"];

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-0.5 min-w-0">
        <div className="flex gap-0.5 pl-8 text-[10px]" style={{ color: isDark ? "#64748b" : "#94a3b8" }}>
          {months.map((m, i) => (
            <span key={i} style={{ position: "relative", left: `${m.idx * 13}px` }} className="absolute">{m.label}</span>
          ))}
        </div>
        <div className="flex gap-0.5 mt-4">
          <div className="flex flex-col gap-0.5 text-[10px] pr-1" style={{ color: isDark ? "#64748b" : "#94a3b8" }}>
            {["", "Mon", "", "Wed", "", "Fri", ""].map((l, i) => <div key={i} className="h-[11px] flex items-center">{l}</div>)}
          </div>
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {w.map((d, di) => (
                <div key={di} title={d.dk ? `${d.dk}: ${d.score}/4` : ""}
                  onClick={() => d.dk && !d.future && onSelect(d.dk)}
                  className={`w-[11px] h-[11px] rounded-[2px] cursor-pointer transition-all ${d.dk === selectedDay ? "ring-2 ring-blue-400" : ""} ${d.dk === today() ? "ring-1 ring-blue-300" : ""}`}
                  style={{ backgroundColor: d.future ? "transparent" : colors[d.score] }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────
export default function ChessTrainer() {
  const [store, setStore] = useState(loadStore);
  const [selectedDay, setSelectedDay] = useState(today());
  const [tick, setTick] = useState(0);
  const tickRef = useRef(null);
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const { history, isDark, soundOn, sectionOrder } = store;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = APP_TITLE;

    const ensureLink = (rel) => {
      let link = document.head.querySelector(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      return link;
    };

    const ensureMeta = (name, content) => {
      let meta = document.head.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    ensureLink("icon").href = APP_ICON_DATA_URI;
    ensureLink("apple-touch-icon").href = APP_ICON_DATA_URI;
    ensureLink("manifest").href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify({
      name: APP_TITLE,
      short_name: "CT Analysis",
      description: "Standalone chess training dashboard with synced history and analysis context.",
      display: "standalone",
      background_color: "#0f172a",
      theme_color: "#0f172a",
      icons: [{ src: APP_ICON_DATA_URI, sizes: "64x64", type: "image/svg+xml", purpose: "any maskable" }],
    }))}`;
    ensureMeta("theme-color", "#0f172a");
    ensureMeta("application-name", APP_TITLE);
  }, []);

  const update = useCallback((fn) => {
    setStore((prev) => {
      const next = fn(JSON.parse(JSON.stringify(prev)));
      saveStore(next);
      return next;
    });
  }, []);

  const getDay = useCallback((dk) => history[dk] || emptyDay(), [history]);
  const setDay = useCallback((dk, fn) => {
    update((s) => {
      if (!s.history[dk]) s.history[dk] = emptyDay();
      fn(s.history[dk]);
      return s;
    });
  }, [update]);

  const dayData = getDay(selectedDay);

  // Timer tick
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  // Sound tick
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  useEffect(() => {
    const anyRunning = TASK_KEYS.some((k) => {
      const d = getDay(today());
      return d.tasks[k].timerRunning;
    });
    if (anyRunning && soundRef.current) playTick();
  }, [tick, getDay]);

  // Active timer info
  const activeTimer = useMemo(() => {
    const td = getDay(today());
    for (const k of TASK_KEYS) {
      const t = td.tasks[k];
      if (t.timerRunning) {
        let elapsed = t.elapsedSeconds;
        if (t.timerStartedAt) elapsed += (Date.now() - t.timerStartedAt) / 1000;
        return { key: k, elapsed, label: TASK_DEFS[k].label };
      }
    }
    return null;
  }, [tick, getDay]);

  const stopAllTimers = useCallback((dk) => {
    setDay(dk, (d) => {
      TASK_KEYS.forEach((k) => {
        const t = d.tasks[k];
        if (t.timerRunning && t.timerStartedAt) {
          t.elapsedSeconds += (Date.now() - t.timerStartedAt) / 1000;
          t.timerRunning = false;
          t.timerStartedAt = null;
        }
      });
    });
  }, [setDay]);

  const startTimer = useCallback((dk, key) => {
    if (soundOn) { ensureAudio(); playClick(); }
    setDay(dk, (d) => {
      TASK_KEYS.forEach((k) => {
        const t = d.tasks[k];
        if (t.timerRunning && t.timerStartedAt) {
          t.elapsedSeconds += (Date.now() - t.timerStartedAt) / 1000;
          t.timerRunning = false;
          t.timerStartedAt = null;
        }
      });
      d.tasks[key].timerRunning = true;
      d.tasks[key].timerStartedAt = Date.now();
      d.started = true;
    });
  }, [setDay, soundOn]);

  const stopTimer = useCallback((dk, key) => {
    if (soundOn) playClick();
    setDay(dk, (d) => {
      const t = d.tasks[key];
      if (t.timerRunning && t.timerStartedAt) {
        t.elapsedSeconds += (Date.now() - t.timerStartedAt) / 1000;
      }
      t.timerRunning = false;
      t.timerStartedAt = null;
    });
  }, [setDay, soundOn]);

  const markDone = useCallback((dk, key) => {
    if (soundOn) playClick();
    setDay(dk, (d) => {
      const t = d.tasks[key];
      if (t.timerRunning && t.timerStartedAt) {
        t.elapsedSeconds += (Date.now() - t.timerStartedAt) / 1000;
        t.timerRunning = false;
        t.timerStartedAt = null;
      }
      t.done = !t.done;
    });
  }, [setDay, soundOn]);

  const setCount = useCallback((dk, key, val) => {
    setDay(dk, (d) => { d.tasks[key].count = val; });
  }, [setDay]);

  const resetToday = useCallback(() => {
    if (soundOn) playClick();
    const td = today();
    stopAllTimers(td);
    update((s) => { s.history[td] = emptyDay(); return s; });
    setSelectedDay(td);
  }, [update, stopAllTimers, soundOn]);

  const openGamesApp = useCallback(() => {
    if (soundOn) playClick();
    seedGamesAppState();
    const target = getGamesAppUrl();
    openGamesAppTarget(target);
  }, [soundOn]);

  useEffect(() => {
    const handleExternalGamesLauncherClick = (event) => {
      const clicked = event.target instanceof Element ? event.target : event.target?.parentElement;
      const launcher = clicked?.closest?.("#chess-tracker-analysis-launcher");
      if (!launcher) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openGamesApp();
    };

    document.addEventListener("click", handleExternalGamesLauncherClick, true);
    return () => document.removeEventListener("click", handleExternalGamesLauncherClick, true);
  }, [openGamesApp]);

  // Streaks
  const { currentStreak, bestStreak } = useMemo(() => {
    let cur = 0;
    let d = today();
    while (true) {
      const day = history[d];
      if (!day || !isDayComplete(day)) break;
      cur++;
      d = addDays(d, -1);
    }
    let best = 0;
    let streak = 0;
    const keys = Object.keys(history).sort();
    for (const k of keys) {
      if (isDayComplete(history[k])) { streak++; best = Math.max(best, streak); }
      else streak = 0;
    }
    return { currentStreak: cur, bestStreak: best };
  }, [history]);

  const dataStartDay = useMemo(() => (
    Object.keys(history).sort().find((dk) => hasHistoryDayData(history[dk])) || null
  ), [history]);

  // Charts data
  const chartData = useMemo(() => {
    const keys = Object.keys(history).sort().slice(-30);
    return keys.map((k) => {
      const d = history[k];
      const totalSecs = TASK_KEYS.reduce((s, tk) => s + d.tasks[tk].elapsedSeconds, 0);
      return {
        date: k.slice(5),
        fullDate: k,
        minutes: Math.round(totalSecs / 60),
        elo: d.dailyElo ? Number(d.dailyElo) : null,
        tactics: (d.tasks.chessimo.count || 0) + (d.tasks.chessableTactics.count || 0),
        lines: d.tasks.openings.count || 0,
        games: d.tasks.games.count || 0,
      };
    });
  }, [history]);

  // Last 7 days
  const last7 = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const dk = addDays(today(), -i);
      const d = parseDate(dk);
      arr.push({ dk, day: d.toLocaleDateString("en-US", { weekday: "short" }), num: d.getDate(), data: history[dk] });
    }
    return arr;
  }, [history]);

  // DnD
  const handleDragStart = (idx) => { dragItem.current = idx; };
  const handleDragEnter = (idx) => { dragOver.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    const items = [...(sectionOrder || DEFAULT_SECTIONS)];
    const [removed] = items.splice(dragItem.current, 1);
    items.splice(dragOver.current, 0, removed);
    dragItem.current = null;
    dragOver.current = null;
    update((s) => { s.sectionOrder = items; return s; });
  };

  const sections = sectionOrder || DEFAULT_SECTIONS;

  // Theme classes
  const bg = isDark ? "bg-slate-900" : "bg-gray-50";
  const text = isDark ? "text-white" : "text-gray-900";
  const subtext = isDark ? "text-slate-400" : "text-gray-500";
  const card = isDark ? "bg-slate-800/60 border border-slate-700/50" : "bg-white border border-gray-200";
  const cardHover = isDark ? "hover:bg-slate-700/60" : "hover:bg-gray-50";
  const inputCls = isDark ? "bg-slate-700 border-slate-600 text-white placeholder-slate-500" : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400";

  const getTaskElapsed = (t) => {
    let e = t.elapsedSeconds;
    if (t.timerRunning && t.timerStartedAt) e += (Date.now() - t.timerStartedAt) / 1000;
    return e;
  };

  const colorMap = { blue: "bg-blue-500", purple: "bg-purple-500", emerald: "bg-emerald-500", amber: "bg-amber-500" };
  const chipColorMap = {
    blue: isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700",
    purple: isDark ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700",
    emerald: isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700",
    amber: isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700",
  };

  const renderSection = (id, idx) => {
    const sectionWrapper = (title, icon, children) => (
      <div key={id} draggable onDragStart={() => handleDragStart(idx)} onDragEnter={() => handleDragEnter(idx)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
        className={`rounded-3xl ${card} p-5 transition-all`}>
        <div className="flex items-center gap-2 mb-4 cursor-grab active:cursor-grabbing">
          <GripVertical size={16} className={`${subtext} opacity-40`} />
          {icon}
          <h2 className={`text-sm font-semibold ${subtext} uppercase tracking-wide`}>{title}</h2>
        </div>
        {children}
      </div>
    );

    switch (id) {
      case "today":
        return sectionWrapper("Selected Day", <Calendar size={16} className={subtext} />,
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-2xl font-bold ${text}`}>{fmtDate(selectedDay)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
                {selectedDay === today() && <span className="text-blue-400">Today</span>}
                {selectedDay !== today() && <span className={subtext}>Viewing past day</span>}
                <span className={subtext}>
                  {dataStartDay ? (
                    <>Data since <span className={`${text} font-semibold`}>{fmtShortDate(dataStartDay)}</span></>
                  ) : "No saved data yet"}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSelectedDay(addDays(selectedDay, -1))} className={`p-2 rounded-xl ${isDark ? "bg-slate-700 hover:bg-slate-600" : "bg-gray-100 hover:bg-gray-200"} transition-colors`}><ChevronLeft size={18} className={text} /></button>
              <button onClick={() => setSelectedDay(today())} className="px-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors">Today</button>
              <button onClick={() => setSelectedDay(addDays(selectedDay, 1))} className={`p-2 rounded-xl ${isDark ? "bg-slate-700 hover:bg-slate-600" : "bg-gray-100 hover:bg-gray-200"} transition-colors`}><ChevronRight size={18} className={text} /></button>
            </div>
          </div>
        );

      case "dailyPlan":
        return sectionWrapper("Daily Plan", <Swords size={16} className={subtext} />,
          <div className="space-y-4">
            <div className="grid gap-3">
              {TASK_KEYS.map((key) => {
                const def = TASK_DEFS[key];
                const t = dayData.tasks[key];
                const complete = isTaskComplete(key, t);
                const elapsed = getTaskElapsed(t);
                const Icon = def.icon;
                return (
                  <div key={key} className={`rounded-2xl ${isDark ? "bg-slate-750 border border-slate-700/30" : "bg-gray-50 border border-gray-100"} p-4 transition-all ${complete ? "opacity-75" : ""}`}
                    style={{ backgroundColor: isDark ? (complete ? "#1a2332" : "#1e293b80") : (complete ? "#f0fdf4" : "#ffffff") }}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${colorMap[def.color]} bg-opacity-20 flex items-center justify-center flex-shrink-0`}>
                        <Icon size={20} className="text-white" style={{ opacity: 0.9 }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className={`text-sm font-semibold ${text}`}>{def.label}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${chipColorMap[def.color]}`}>{def.cat}</span>
                          {complete && <CheckCircle2 size={16} className="text-green-400" />}
                        </div>
                        {def.sub ? <p className={`text-xs ${subtext} mb-4 max-w-2xl`}>{def.sub}</p> : null}
                        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            {!t.timerRunning ? (
                              <button onClick={() => startTimer(selectedDay, key)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors">
                                <Play size={12} />{t.elapsedSeconds > 0 ? "Resume" : "Start"}
                              </button>
                            ) : (
                              <button onClick={() => stopTimer(selectedDay, key)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors">
                                <Square size={12} />Stop
                              </button>
                            )}
                            <button onClick={() => markDone(selectedDay, key)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${complete ? (isDark ? "bg-green-500/20 text-green-300 hover:bg-green-500/30" : "bg-green-100 text-green-700 hover:bg-green-200") : (isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-200 text-gray-600 hover:bg-gray-300")}`}>
                              <CheckCircle2 size={12} />{complete ? "Undo" : "Done"}
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-mono font-semibold ${t.timerRunning ? "text-blue-300 border-blue-400/40 bg-blue-500/10" : isDark ? "text-slate-300 border-slate-600 bg-slate-900/70" : "text-gray-600 border-gray-200 bg-white"}`}>
                              <Clock size={14} />
                              {fmtTime(elapsed)}
                            </div>
                          </div>
                        </div>
                        <div className={`rounded-xl border p-3 ${isDark ? "border-slate-700/50 bg-slate-900/30" : "border-gray-200 bg-gray-50"}`}>
                          <NumberStepper value={t.count} onChange={(v) => setCount(selectedDay, key, v)} label={def.metric} isDark={isDark} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Daily extras */}
            <div className={`rounded-2xl ${isDark ? "bg-slate-750 border border-slate-700/30" : "bg-gray-50 border border-gray-100"} p-4 space-y-4`}
              style={{ backgroundColor: isDark ? "#1e293b80" : "#ffffff" }}>
              <h3 className={`text-sm font-semibold ${text}`}>Daily Log</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`text-xs font-medium ${subtext} block mb-1`}>Score / Points</label>
                  <input value={dayData.dailyScore} onChange={(e) => setDay(selectedDay, (d) => { d.dailyScore = e.target.value; })}
                    placeholder="e.g. 1.5 / 2" className={`w-full px-3 py-2 rounded-lg border text-sm ${inputCls} outline-none focus:ring-2 focus:ring-blue-500/50`} />
                </div>
                <div>
                  <label className={`text-xs font-medium ${subtext} block mb-1`}>Final Elo</label>
                  <input value={dayData.dailyElo} onChange={(e) => setDay(selectedDay, (d) => { d.dailyElo = e.target.value.replace(/[^0-9]/g, ""); })}
                    placeholder="e.g. 1250" inputMode="numeric" className={`w-full px-3 py-2 rounded-lg border text-sm ${inputCls} outline-none focus:ring-2 focus:ring-blue-500/50`} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SliderCard label="Energy" value={dayData.energy} onChange={(v) => setDay(selectedDay, (d) => { d.energy = v; })} isDark={isDark} />
                <SliderCard label="Focus" value={dayData.focus} onChange={(v) => setDay(selectedDay, (d) => { d.focus = v; })} isDark={isDark} />
              </div>
              <div>
                <label className={`text-xs font-medium ${subtext} block mb-1`}>Accountability Note</label>
                <textarea value={dayData.notes} onChange={(e) => setDay(selectedDay, (d) => { d.notes = e.target.value; })}
                  placeholder="What went well? What did I skip? What should I improve tomorrow?"
                  rows={3} className={`w-full px-3 py-2 rounded-lg border text-sm ${inputCls} outline-none focus:ring-2 focus:ring-blue-500/50 resize-none`} />
              </div>
            </div>
          </div>
        );

      case "stats":
        return sectionWrapper("Stats", <BarChart3 size={16} className={subtext} />,
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Target} label="Today" value={`${dayCompletionScore(dayData)}/4`} sub="tasks complete" isDark={isDark} />
            <StatCard icon={Clock} label="Time" value={fmtTime(totalSeconds(dayData))} sub="trained today" isDark={isDark} />
            <StatCard icon={Flame} label="Streak" value={currentStreak} sub="consecutive days" isDark={isDark} />
            <StatCard icon={Trophy} label="Best" value={bestStreak} sub="best streak" isDark={isDark} />
          </div>
        );

      case "activity":
        return sectionWrapper("Activity", <Activity size={16} className={subtext} />,
          <ActivityHeatmap history={history} selectedDay={selectedDay} onSelect={setSelectedDay} isDark={isDark} />
        );

      case "eloTrend":
        const eloData = chartData.filter((d) => d.elo !== null);
        return sectionWrapper("Elo Trend", <TrendingUp size={16} className={subtext} />,
          <div>
            <p className={`text-xs ${subtext} mb-3`}>This graph tracks your daily final Elo as it changes over time.</p>
            {eloData.length === 0 ? <p className={`text-sm ${subtext} text-center py-8`}>No Elo data yet. Enter your daily Elo above to see the trend.</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={eloData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e5e7eb"} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#9ca3af" }} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, borderRadius: 12, fontSize: 12 }} />
                  <Line type="monotone" dataKey="elo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        );

      case "trainingGraphs":
        return sectionWrapper("Training Graphs", <BarChart3 size={16} className={subtext} />,
          <div className="space-y-6">
            <div>
              <p className={`text-xs ${subtext} mb-3`}>This trend shows the total minutes you trained each day.</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e5e7eb"} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#9ca3af" }} />
                  <Tooltip contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, borderRadius: 12, fontSize: 12 }} />
                  <Line type="monotone" dataKey="minutes" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} name="Minutes" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className={`text-xs ${subtext} mb-3`}>This graph shows the total exercises, lines, and games you completed for each day.</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e5e7eb"} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#9ca3af" }} />
                  <YAxis tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#9ca3af" }} />
                  <Tooltip contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, borderRadius: 12, fontSize: 12 }} />
                  <Legend />
                  <Bar dataKey="tactics" fill="#3b82f6" name="Tactics" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lines" fill="#10b981" name="Lines" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="games" fill="#f59e0b" name="Games" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case "last7":
        return sectionWrapper("Last 7 Days", <CalendarDays size={16} className={subtext} />,
          <div className="grid grid-cols-7 gap-2">
            {last7.map((d) => {
              const score = d.data ? dayCompletionScore(d.data) : 0;
              const full = d.data && isDayComplete(d.data);
              const isSelected = d.dk === selectedDay;
              return (
                <button key={d.dk} onClick={() => setSelectedDay(d.dk)}
                  className={`rounded-xl p-2 text-center transition-all ${isSelected ? "ring-2 ring-blue-400" : ""} ${full ? (isDark ? "bg-green-500/20 border border-green-500/30" : "bg-green-50 border border-green-200") : (isDark ? "bg-slate-800 border border-slate-700/50" : "bg-white border border-gray-200")} ${cardHover}`}>
                  <div className={`text-[10px] font-medium ${subtext}`}>{d.day}</div>
                  <div className={`text-lg font-bold ${text}`}>{d.num}</div>
                  <div className={`text-[10px] font-medium ${full ? "text-green-400" : subtext}`}>{score}/4</div>
                </button>
              );
            })}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 ${isDark ? "bg-slate-900/95 border-b border-slate-800" : "bg-white/95 border-b border-gray-200"} backdrop-blur-sm`}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <AppMark />
            <div>
              <h1 className={`text-lg font-bold ${text} flex items-center gap-2 flex-wrap`}>
                <span>{APP_TITLE}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-sky-400/20 bg-sky-400/10 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-300">
                  Standalone App
                </span>
              </h1>
              <p className={`text-xs ${subtext}`}>{APP_SUBTITLE}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openGamesApp}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium ${isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-700"} transition-colors`}
              title="Open the games analysis app">
              <Gamepad2 size={14} />Games
            </button>
            <button onClick={() => { if (soundOn) playClick(); update((s) => { s.soundOn = !s.soundOn; return s; }); }}
              className={`p-2 rounded-xl ${isDark ? "bg-slate-800 hover:bg-slate-700" : "bg-gray-100 hover:bg-gray-200"} transition-colors`}
              title={soundOn ? "Sound on" : "Sound off"}>
              {soundOn ? <Volume2 size={16} className={text} /> : <VolumeX size={16} className={subtext} />}
            </button>
            <button onClick={() => update((s) => { s.isDark = !s.isDark; return s; })}
              className={`p-2 rounded-xl ${isDark ? "bg-slate-800 hover:bg-slate-700" : "bg-gray-100 hover:bg-gray-200"} transition-colors`}>
              {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-600" />}
            </button>
            <button onClick={resetToday}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium ${isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"} transition-colors`}>
              <RotateCcw size={14} />Reset today
            </button>
          </div>
        </div>
      </header>

      {/* Active Timer Banner */}
      {activeTimer && (
        <div className="sticky top-[57px] z-40 bg-blue-500/10 border-b border-blue-500/20 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className={`text-sm font-medium ${text}`}>{activeTimer.label}</span>
              <span className="text-sm font-mono font-bold text-blue-400">{fmtTime(activeTimer.elapsed)}</span>
            </div>
            <button onClick={() => stopAllTimers(today())}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors">
              <Square size={12} />Stop
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {sections.map((id, idx) => renderSection(id, idx))}
      </main>

      <footer className={`max-w-5xl mx-auto px-4 py-8 text-center`}>
        <p className={`text-xs ${subtext}`}>Chess Trainer Analysis · Built for focused daily improvement</p>
      </footer>
    </div>
  );
}
