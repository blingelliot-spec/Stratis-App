import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import confetti from 'canvas-confetti';
import { pwaManager, PWAState } from './pwaRegister';
import { backupToIndexedDB } from './lib/offlineDb';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock3,
  Code,
  Coffee,
  Download,
  Dumbbell,
  Edit3,
  FileText,
  Flag,
  FolderKanban,
  History,
  Flame,
  Laptop,
  Leaf,
  Menu,
  Moon,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Square,
  Star,
  Sun,
  Target,
  Trash2,
  Timer,
  Trophy,
  Upload,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

type SubGoal = {
  id: string;
  name: string;
  completed: boolean;
};

type Goal = {
  id: string;
  title: string;
  note: string;
  minutes: number;
  createdAt: string;
  completed: boolean;
  color: 'terracotta' | 'sage' | 'ochre' | 'plum';
  sessionLimitMinutes?: number;
  subGoals?: SubGoal[];
};

type TimerState = {
  goalId: string | null;
  elapsed: number;
  startedAt: number | null;
};

type TrackerEvent = {
  id: string;
  name: string;
  datetime: string;
  createdAt: string;
};

type LoggerCategory = 'Study' | 'Fitness' | 'Side Projects' | 'Other';

type LoggerGoal = {
  id: string;
  name: string;
  targetHours: number;
  completedHours: number;
  category: LoggerCategory;
  createdAt: string;
};

type LoggerTimerState = {
  goalId: string | null;
  startedAt: number | null;
};

type TimerSession = {
  id: string;
  goalId: string;
  goalName: string;
  durationSeconds: number;
  durationHours: number;
  timestamp: string;
  plannedMinutes?: number;
};

const STORAGE_KEY = 'goal-time-tracker:v1';
const TIMER_KEY = 'goal-time-tracker:timer:v1';
const EVENTS_KEY = 'goal-time-tracker:events:v1';
const LOGGER_GOALS_KEY = 'goal-time-tracker:logger-goals:v1';
const LOGGER_TIMER_KEY = 'goal-time-tracker:logger-timer:v1';
const LOGGER_SESSIONS_KEY = 'goal-time-tracker:logger-sessions:v1';
const loggerCategories: LoggerCategory[] = ['Study', 'Fitness', 'Side Projects', 'Other'];

const starterGoals: Goal[] = [
  { id: 'morning-pages', title: 'Write morning pages', note: 'Clear a little room for good ideas.', minutes: 38, createdAt: 'Today', completed: false, color: 'terracotta', sessionLimitMinutes: 45 },
  { id: 'walk-by-water', title: 'Walk by the water', note: 'Twenty minutes without a podcast.', minutes: 20, createdAt: 'Yesterday', completed: true, color: 'sage', sessionLimitMinutes: 20 },
  { id: 'read-chapter', title: 'Read one chapter', note: 'The book on the bedside table.', minutes: 47, createdAt: 'Monday', completed: false, color: 'ochre', sessionLimitMinutes: 30 },
];

const colorStyles: Record<Goal['color'], { bar: string; soft: string; ink: string; icon: typeof Leaf }> = {
  terracotta: { bar: 'bg-[#b95f42]', soft: 'bg-[#f3dfd5]', ink: 'text-[#96482f]', icon: Flame },
  sage: { bar: 'bg-[#78966d]', soft: 'bg-[#e2eadc]', ink: 'text-[#55734d]', icon: Leaf },
  ochre: { bar: 'bg-[#c99735]', soft: 'bg-[#f4e8c9]', ink: 'text-[#946c1d]', icon: Sparkles },
  plum: { bar: 'bg-[#8d6675]', soft: 'bg-[#eadfe3]', ink: 'text-[#704b5a]', icon: Target },
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatTimer(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatLoggerHours(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(2).replace(/\.?0+$/, '')}h`;
}

function formatDurationHM(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function getMotivationalMessage(percent: number) {
  if (percent <= 0) return 'Let’s get started! 💪';
  if (percent <= 30) return 'Great start, keep pushing! 🚀';
  if (percent <= 60) return 'You’re on fire! 🔥';
  if (percent <= 90) return 'Almost there! 🌟';
  if (percent < 100) return 'Just a little more! 🎯';
  return 'Goal achieved! 🎉';
}

function playSound(type: 'start' | 'stop' | 'countdown' | 'victory' | 'timesup', soundEnabled = true) {
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'start') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'stop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'countdown') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.18, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.25);
      });
    } else if (type === 'victory') {
      [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.2, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } else if (type === 'timesup') {
      [587.33, 880, 587.33, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.22, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.25);
      });
    }
  } catch {
    // Audio Context not allowed or unsupported
  }
}

function formatSessionDate(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStatsDays(sessions: TimerSession[], now: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const dateKey = getLocalDateKey(date);
    const totalSeconds = sessions.reduce((total, session) => {
      const sessionDate = new Date(session.timestamp);
      return !Number.isNaN(sessionDate.getTime()) && getLocalDateKey(sessionDate) === dateKey
        ? total + Math.max(0, session.durationSeconds)
        : total;
    }, 0);
    return {
      dateKey,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
      dateLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
      totalSeconds,
    };
  });
}

const loggerCategoryStyles: Record<LoggerCategory, { icon: typeof BookOpen; soft: string; ink: string; darkSoft: string; darkInk: string }> = {
  Study: { icon: BookOpen, soft: 'bg-[#e4e0f4]', ink: 'text-[#685b99]', darkSoft: 'dark:bg-[#3b365a]', darkInk: 'dark:text-[#d5ccff]' },
  Fitness: { icon: Dumbbell, soft: 'bg-[#e2eadc]', ink: 'text-[#55734d]', darkSoft: 'dark:bg-[#304830]', darkInk: 'dark:text-[#b8d8ae]' },
  'Side Projects': { icon: FolderKanban, soft: 'bg-[#f3dfd5]', ink: 'text-[#96482f]', darkSoft: 'dark:bg-[#56372d]', darkInk: 'dark:text-[#f2b9a4]' },
  Other: { icon: Sparkles, soft: 'bg-[#f4e8c9]', ink: 'text-[#946c1d]', darkSoft: 'dark:bg-[#56461e]', darkInk: 'dark:text-[#f3d98b]' },
};

function formatEventDate(datetime: string) {
  const date = new Date(datetime);
  if (Number.isNaN(date.getTime())) return 'Date not set';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getCountdown(datetime: string, now: number) {
  const difference = new Date(datetime).getTime() - now;
  if (Number.isNaN(difference) || difference <= 0) return null;
  const totalSeconds = Math.floor(difference / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function App() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [loggerGoals, setLoggerGoals] = useState<LoggerGoal[]>([]);
  const [loggerTimer, setLoggerTimer] = useState<LoggerTimerState>({ goalId: null, startedAt: null });
  const [timerSessions, setTimerSessions] = useState<TimerSession[]>([]);
  const [timer, setTimer] = useState<TimerState>({ goalId: null, elapsed: 0, startedAt: null });
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [isLoggerGoalFormOpen, setIsLoggerGoalFormOpen] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [celebration, setCelebration] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [timerMode, setTimerMode] = useState<'countdown' | 'countup'>('countdown');
  const limitNotifiedRef = useRef<string | null>(null);

  // PWA & Offline State
  const [pwaState, setPwaState] = useState<PWAState>(() => pwaManager.state);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);
  const prevOnlineRef = useRef<boolean>(pwaState.isOnline);

  useEffect(() => {
    return pwaManager.subscribe((newState) => {
      if (prevOnlineRef.current !== newState.isOnline) {
        if (newState.isOnline) {
          setCelebration('🟢 Back online! All goals and time logs are synchronized.');
        } else {
          setCelebration('🔴 You are offline. All data is saved locally in browser cache.');
        }
        window.setTimeout(() => setCelebration(''), 5000);
        prevOnlineRef.current = newState.isOnline;
      }
      setPwaState(newState);
    });
  }, []);

  // New Polish Features
  const [location, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'progress-desc' | 'progress-asc' | 'name' | 'category'>('default');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const activeTab = useMemo(() => {
    if (location === '/countdowns') return 'countdowns';
    if (location === '/stats') return 'stats';
    if (location === '/history') return 'history';
    return 'goals';
  }, [location]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const savedGoals = readJson<Goal[]>(STORAGE_KEY, starterGoals);
    const savedTimer = readJson<TimerState>(TIMER_KEY, { goalId: null, elapsed: 0, startedAt: null });
    const savedEvents = readJson<TrackerEvent[]>(EVENTS_KEY, []);
    const savedLoggerGoals = readJson<LoggerGoal[]>(LOGGER_GOALS_KEY, []);
    const savedLoggerTimer = readJson<LoggerTimerState>(LOGGER_TIMER_KEY, { goalId: null, startedAt: null });
    const savedTimerSessions = readJson<TimerSession[]>(LOGGER_SESSIONS_KEY, []);
    setGoals(Array.isArray(savedGoals) ? savedGoals : starterGoals);
    setTimer(savedTimer);
    setEvents(Array.isArray(savedEvents) ? savedEvents : []);
    setLoggerGoals(Array.isArray(savedLoggerGoals) ? savedLoggerGoals : []);
    setLoggerTimer(savedLoggerTimer);
    setTimerSessions(Array.isArray(savedTimerSessions) ? savedTimerSessions : []);
    setSelectedGoalId(savedTimer.goalId ?? savedGoals.find((goal) => !goal.completed)?.id ?? null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
      window.localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
      window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      window.localStorage.setItem(LOGGER_GOALS_KEY, JSON.stringify(loggerGoals));
      window.localStorage.setItem(LOGGER_TIMER_KEY, JSON.stringify(loggerTimer));
      window.localStorage.setItem(LOGGER_SESSIONS_KEY, JSON.stringify(timerSessions));
      setStorageError(false);

      // IndexedDB offline persistence backup
      backupToIndexedDB('goals', goals);
      backupToIndexedDB('events', events);
      backupToIndexedDB('timerSessions', timerSessions);
      backupToIndexedDB('timer', timer);
    } catch {
      setStorageError(true);
    }
  }, [events, goals, loggerGoals, loggerTimer, timer, timerSessions, hydrated]);

  useEffect(() => {
    if (!timer.startedAt) return;
    const interval = window.setInterval(() => {
      setTimer((current) => current.startedAt ? { ...current, elapsed: current.elapsed + 1 } : current);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timer.startedAt]);

  useEffect(() => {
    limitNotifiedRef.current = null;
  }, [selectedGoalId, timer.startedAt]);

  useEffect(() => {
    if (!timer.startedAt || !timer.goalId) return;
    const currentGoal = goals.find((g) => g.id === timer.goalId);
    if (!currentGoal || !currentGoal.sessionLimitMinutes) return;

    const limitSecs = currentGoal.sessionLimitMinutes * 60;
    const sessionKey = `${currentGoal.id}-${timer.startedAt}`;

    if (timer.elapsed >= limitSecs && limitNotifiedRef.current !== sessionKey) {
      limitNotifiedRef.current = sessionKey;
      playSound('timesup', soundEnabled);
      setCelebration(`⏰ Time's up! You've reached your planned session time (${currentGoal.sessionLimitMinutes} min).`);
      window.setTimeout(() => setCelebration(''), 5000);
    }
  }, [timer.elapsed, timer.startedAt, timer.goalId, goals, soundEnabled]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const activeGoals = useMemo(() => goals.filter((goal) => !goal.completed), [goals]);
  const completedGoals = useMemo(() => goals.filter((goal) => goal.completed), [goals]);
  const totalMinutes = useMemo(() => goals.reduce((total, goal) => total + goal.minutes, 0), [goals]);
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? activeGoals[0] ?? goals[0];
  const selectedIsRunning = Boolean(timer.startedAt && timer.goalId === selectedGoal?.id);
  const progress = goals.length ? Math.round((completedGoals.length / goals.length) * 100) : 0;
  const loggerElapsedSeconds = loggerTimer.startedAt ? Math.max(0, Math.floor((now - loggerTimer.startedAt) / 1000)) : 0;
  const statsDays = useMemo(() => getStatsDays(timerSessions, now), [timerSessions, now]);
  const todayStatsSeconds = statsDays[6]?.totalSeconds ?? 0;
  const weeklyStatsSeconds = statsDays.reduce((total, day) => total + day.totalSeconds, 0);
  const maxStatsDaySeconds = Math.max(...statsDays.map((day) => day.totalSeconds), 1);
  const totalLoggedSeconds = useMemo(() => timerSessions.reduce((acc, s) => acc + s.durationSeconds, 0), [timerSessions]);
  const completedLoggerGoalsCount = useMemo(() => loggerGoals.filter((g) => g.targetHours > 0 && g.completedHours >= g.targetHours).length, [loggerGoals]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setLocation('/countdowns');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        setLocation('/goals');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        setLocation('/stats');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '4') {
        e.preventDefault();
        setLocation('/history');
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (selectedGoal) {
          if (selectedIsRunning) {
            pauseTimer();
          } else {
            startTimer();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGoal, selectedIsRunning, setLocation, soundEnabled]);

  const filteredLoggerGoals = useMemo(() => {
    let list = loggerGoals.filter((g) =>
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (sortBy === 'progress-desc') {
      list = [...list].sort((a, b) => (b.completedHours / (b.targetHours || 1)) - (a.completedHours / (a.targetHours || 1)));
    } else if (sortBy === 'progress-asc') {
      list = [...list].sort((a, b) => (a.completedHours / (a.targetHours || 1)) - (b.completedHours / (b.targetHours || 1)));
    } else if (sortBy === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'category') {
      list = [...list].sort((a, b) => a.category.localeCompare(b.category));
    }
    return list;
  }, [loggerGoals, searchQuery, sortBy]);

  const loggerGoalsByCategory = useMemo(() => loggerCategories.reduce<Record<LoggerCategory, LoggerGoal[]>>((groups, category) => {
    groups[category] = filteredLoggerGoals.filter((goal) => goal.category === category);
    return groups;
  }, { Study: [], Fitness: [], 'Side Projects': [], Other: [] }), [filteredLoggerGoals]);

  function exportData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      goals,
      events,
      loggerGoals,
      timerSessions,
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `goal-time-tracker-data-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setCelebration('App data exported as JSON backup file!');
    window.setTimeout(() => setCelebration(''), 2800);
  }

  function handleImportData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.goals)) setGoals(parsed.goals);
          if (Array.isArray(parsed.events)) setEvents(parsed.events);
          if (Array.isArray(parsed.loggerGoals)) setLoggerGoals(parsed.loggerGoals);
          if (Array.isArray(parsed.timerSessions)) setTimerSessions(parsed.timerSessions);
          playSound('victory', soundEnabled);
          confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
          setCelebration('Data imported successfully!');
          window.setTimeout(() => setCelebration(''), 2800);
        }
      } catch {
        setCelebration('Failed to parse import JSON file.');
        window.setTimeout(() => setCelebration(''), 2800);
      }
    };
    reader.readAsText(file);
  }

  function addGoal(title: string, note: string, sessionLimitMinutes?: number, subGoals?: SubGoal[]) {
    const palette: Goal['color'][] = ['terracotta', 'sage', 'ochre', 'plum'];
    const newGoal: Goal = {
      id: `${Date.now()}`,
      title,
      note: note || 'A small promise to keep today.',
      minutes: 0,
      createdAt: 'Just now',
      completed: false,
      color: palette[goals.length % palette.length],
      sessionLimitMinutes,
      subGoals: subGoals && subGoals.length > 0 ? subGoals : undefined,
    };
    setGoals((current) => [newGoal, ...current]);
    setSelectedGoalId(newGoal.id);
    setIsGoalFormOpen(false);
    setEditingGoal(null);
    playSound('start', soundEnabled);
    setCelebration('A new intention is on the page.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function updateGoal(id: string, title: string, note: string, sessionLimitMinutes?: number, subGoals?: SubGoal[]) {
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, title, note: note || 'A small promise to keep today.', sessionLimitMinutes, subGoals: subGoals && subGoals.length > 0 ? subGoals : undefined } : goal));
    setIsGoalFormOpen(false);
    setEditingGoal(null);
    playSound('start', soundEnabled);
    setCelebration('Intention updated successfully.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function toggleSubGoal(goalId: string, subGoalId: string) {
    setGoals((current) =>
      current.map((goal) => {
        if (goal.id !== goalId) return goal;
        const updatedSubGoals = (goal.subGoals || []).map((sub) =>
          sub.id === subGoalId ? { ...sub, completed: !sub.completed } : sub
        );
        return { ...goal, subGoals: updatedSubGoals };
      })
    );
  }

  function toggleComplete(goalId: string) {
    setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, completed: !goal.completed } : goal));
    const goal = goals.find((item) => item.id === goalId);
    if (goal && !goal.completed) {
      playSound('victory', soundEnabled);
      confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
      setCelebration('Goal achieved! 🎉 Keep the momentum going.');
      window.setTimeout(() => setCelebration(''), 2800);
    }
  }

  function removeGoal() {
    if (!goalToDelete) return;
    if (timer.goalId === goalToDelete.id) setTimer({ goalId: null, elapsed: 0, startedAt: null });
    setGoals((current) => current.filter((goal) => goal.id !== goalToDelete.id));
    if (selectedGoalId === goalToDelete.id) setSelectedGoalId(activeGoals.find((goal) => goal.id !== goalToDelete.id)?.id ?? null);
    setGoalToDelete(null);
  }

  function startTimer() {
    if (!selectedGoal) return;
    playSound('start', soundEnabled);
    if (timer.goalId !== selectedGoal.id) {
      setTimer({ goalId: selectedGoal.id, elapsed: 0, startedAt: Date.now() });
    } else if (!timer.startedAt) {
      setTimer((current) => ({ ...current, startedAt: Date.now() }));
    }
  }

  function pauseTimer() {
    playSound('stop', soundEnabled);
    setTimer((current) => ({ ...current, startedAt: null }));
  }

  function resetTimer() {
    if (selectedGoal && timer.elapsed > 0 && timer.goalId === selectedGoal.id) {
      const elapsedSecs = timer.elapsed;
      const addedMinutes = Math.max(1, Math.round(elapsedSecs / 60));
      setGoals((current) => current.map((g) => g.id === selectedGoal.id ? { ...g, minutes: g.minutes + addedMinutes } : g));
      setTimerSessions((current) => [{
        id: `${Date.now()}`,
        goalId: selectedGoal.id,
        goalName: selectedGoal.title,
        durationSeconds: elapsedSecs,
        durationHours: elapsedSecs / 3600,
        timestamp: new Date().toISOString(),
        plannedMinutes: selectedGoal.sessionLimitMinutes,
      }, ...current]);

      const limitSecs = (selectedGoal.sessionLimitMinutes || 0) * 60;
      if (limitSecs > 0) {
        if (elapsedSecs < limitSecs) {
          setCelebration(`Completed under planned time! 👏 (${addedMinutes}m logged)`);
        } else {
          setCelebration(`Planned session time reached! 🎯 (${addedMinutes}m logged)`);
        }
      } else {
        setCelebration(`${addedMinutes}m logged for ${selectedGoal.title}.`);
      }
      window.setTimeout(() => setCelebration(''), 3000);
      playSound('stop', soundEnabled);
    }
    setTimer({ goalId: selectedGoal?.id ?? null, elapsed: 0, startedAt: null });
  }

  function addEvent(name: string, datetime: string) {
    const newEvent: TrackerEvent = {
      id: `${Date.now()}`,
      name,
      datetime,
      createdAt: new Date().toISOString(),
    };
    setEvents((current) => [...current, newEvent].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()));
    setIsEventFormOpen(false);
    playSound('start', soundEnabled);
    setCelebration('Your event is on the horizon.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function removeEvent(eventId: string) {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  }

  function addLoggerGoal(name: string, targetHours: number, category: LoggerCategory) {
    const newGoal: LoggerGoal = {
      id: `${Date.now()}`,
      name,
      targetHours,
      completedHours: 0,
      category,
      createdAt: new Date().toISOString(),
    };
    setLoggerGoals((current) => [newGoal, ...current]);
    setIsLoggerGoalFormOpen(false);
    playSound('start', soundEnabled);
    setCelebration('Your long-term goal has a starting line.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function startLoggerTimer(goalId: string) {
    if (loggerTimer.goalId && loggerTimer.goalId !== goalId) {
      setCelebration('Stop the current session before starting another.');
      window.setTimeout(() => setCelebration(''), 2600);
      return;
    }
    playSound('start', soundEnabled);
    if (!loggerTimer.startedAt) setLoggerTimer({ goalId, startedAt: Date.now() });
  }

  function stopLoggerTimer() {
    if (!loggerTimer.goalId || !loggerTimer.startedAt) return;
    const durationSeconds = Math.max(0, Math.floor((Date.now() - loggerTimer.startedAt) / 1000));
    const goal = loggerGoals.find((item) => item.id === loggerTimer.goalId);
    if (!goal) {
      setLoggerTimer({ goalId: null, startedAt: null });
      return;
    }
    const durationHours = durationSeconds / 3600;
    const newCompletedHours = goal.completedHours + durationHours;
    const hit100 = goal.targetHours > 0 && goal.completedHours < goal.targetHours && newCompletedHours >= goal.targetHours;

    setLoggerGoals((current) => current.map((item) => item.id === goal.id ? { ...item, completedHours: newCompletedHours } : item));
    setTimerSessions((current) => [{
      id: `${Date.now()}`,
      goalId: goal.id,
      goalName: goal.name,
      durationSeconds,
      durationHours,
      timestamp: new Date().toISOString(),
    }, ...current]);
    setLoggerTimer({ goalId: null, startedAt: null });

    if (hit100) {
      playSound('victory', soundEnabled);
      confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      setCelebration(`🎉 Goal Achieved! You reached ${goal.targetHours}h for ${goal.name}!`);
    } else {
      playSound('stop', soundEnabled);
      setCelebration(durationSeconds ? `${formatLoggerHours(durationHours)} logged for ${goal.name}.` : 'That session was too short to log.');
    }
    window.setTimeout(() => setCelebration(''), 3000);
  }

  function removeLoggerGoal(goalId: string) {
    if (loggerTimer.goalId === goalId) setLoggerTimer({ goalId: null, startedAt: null });
    setLoggerGoals((current) => current.filter((goal) => goal.id !== goalId));
    setCelebration('The timer goal was removed. Its session history is still here.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function resetLoggerProgress(goalId: string) {
    setLoggerGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, completedHours: 0 } : goal));
    setCelebration('Progress reset. Your session history is unchanged.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function clearHistory() {
    setTimerSessions([]);
    setCelebration('History log cleared.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  if (!hydrated) return <LoadingState />;

  return (
    <div className="grain-overlay min-h-[100dvh] overflow-x-hidden bg-background">
      <input type="file" ref={fileInputRef} onChange={handleImportData} accept=".json" className="hidden" aria-hidden="true" />

      {/* Offline Status Banner */}
      {!pwaState.isOnline && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-center text-xs font-semibold text-amber-900 dark:text-amber-200 rise-in" data-testid="banner-offline">
          <WifiOff size={14} className="animate-pulse text-amber-600 dark:text-amber-400" />
          <span>You're offline — all goals, timers, and data are saved locally.</span>
        </div>
      )}

      {/* Service Worker Update Available Banner */}
      {pwaState.updateAvailable && (
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-sky-500/30 bg-sky-500/15 px-4 py-2 text-center text-xs font-bold text-sky-900 dark:text-sky-200 rise-in" data-testid="banner-update-available">
          <Sparkles size={14} className="text-sky-500" />
          <span>A new version of Goal & Time Tracker is ready.</span>
          <button type="button" onClick={() => pwaManager.applyUpdate()} className="rounded-full bg-[#5aaed6] px-3 py-1 text-xs font-bold text-[#0e2733] shadow-sm hover:opacity-90">
            Update Now
          </button>
        </div>
      )}

      <header className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3" data-testid="header-brand">
          <div className="grid size-10 place-items-center rounded-2xl bg-sidebar text-accent shadow-sm">
            <Target size={19} strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-display text-lg leading-none">Goal &amp; Time Tracker</p>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${pwaState.isOnline ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'}`} data-testid="badge-online-status">
                <span className={`size-1.5 rounded-full ${pwaState.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {pwaState.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Make time visible • PWA Ready</p>
          </div>
        </div>

        <div className="hidden items-center gap-2.5 sm:flex">
          {pwaState.isInstallable ? (
            <button type="button" onClick={() => pwaManager.promptInstall()} title="Install as standalone desktop/mobile app" className="inline-flex items-center gap-1.5 rounded-full border border-[#5aaed6] bg-[#eaf7fc] px-3.5 py-2 text-xs font-bold text-[#1e5a78] transition-transform hover:-translate-y-0.5 dark:bg-[#19323d] dark:text-[#88d2f0] dark:border-[#2d586e]" data-testid="button-install-pwa">
              <Download size={14} /> Install App
            </button>
          ) : (
            <button type="button" onClick={() => setIsInstallGuideOpen(true)} title="PWA & Offline Info" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-2 text-xs font-bold text-muted-foreground transition-transform hover:-translate-y-0.5 hover:text-foreground" data-testid="button-open-install-guide">
              <Smartphone size={14} /> Offline App
            </button>
          )}
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'} className="grid size-9 place-items-center rounded-full border border-border bg-card/80 text-foreground transition-transform hover:-translate-y-0.5" data-testid="button-theme-toggle">
            {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
          </button>
          <button type="button" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? 'Disable sound effects' : 'Enable sound effects'} className="grid size-9 place-items-center rounded-full border border-border bg-card/80 text-foreground transition-transform hover:-translate-y-0.5" data-testid="button-sound-toggle">
            {soundEnabled ? <Volume2 size={17} className="text-[#5aaed6]" /> : <VolumeX size={17} className="text-muted-foreground" />}
          </button>
          <button type="button" onClick={exportData} title="Export app data as JSON" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3.5 py-2 text-xs font-bold text-foreground transition-transform hover:-translate-y-0.5" data-testid="button-export-data">
            <Download size={14} /> Export
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} title="Import app data from JSON" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3.5 py-2 text-xs font-bold text-foreground transition-transform hover:-translate-y-0.5" data-testid="button-import-data">
            <Upload size={14} /> Import
          </button>
          <button type="button" onClick={() => setIsGoalFormOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="button-header-add-goal">
            <Plus size={15} /> New goal
          </button>
          <button type="button" onClick={() => setIsEventFormOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#5aaed6] px-4 py-2 text-xs font-bold text-[#173849] shadow-sm transition-transform hover:-translate-y-0.5" data-testid="button-header-add-event">
            <Plus size={15} /> New event
          </button>
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="grid size-11 place-items-center rounded-full border border-border bg-card text-foreground" data-testid="button-mobile-theme">
            {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
          </button>
          <button type="button" onClick={() => setSoundEnabled(!soundEnabled)} className="grid size-11 place-items-center rounded-full border border-border bg-card text-foreground" data-testid="button-mobile-sound">
            {soundEnabled ? <Volume2 size={18} className="text-[#5aaed6]" /> : <VolumeX size={18} className="text-muted-foreground" />}
          </button>
          <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation menu" className="grid size-11 place-items-center rounded-full border border-border bg-card text-foreground" data-testid="button-mobile-menu">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="mx-4 mb-4 rounded-2xl border border-border bg-card p-4 shadow-xl sm:hidden rise-in" data-testid="mobile-drawer">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setIsGoalFormOpen(true); setMobileMenuOpen(false); }} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground dark:bg-[#87CEEB] dark:text-[#0a2533]"><Plus size={15} /> New Goal</button>
            <button type="button" onClick={() => { setIsEventFormOpen(true); setMobileMenuOpen(false); }} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#5aaed6] py-2.5 text-xs font-bold text-[#173849] dark:bg-[#87CEEB] dark:text-[#0a2533]"><Plus size={15} /> New Event</button>
            <button type="button" onClick={() => { exportData(); setMobileMenuOpen(false); }} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2 text-xs font-bold text-foreground"><Download size={15} /> Export</button>
            <button type="button" onClick={() => { fileInputRef.current?.click(); setMobileMenuOpen(false); }} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2 text-xs font-bold text-foreground"><Upload size={15} /> Import</button>
          </div>
        </div>
      )}

      {storageError && <div className="mx-auto max-w-6xl px-5 sm:px-8"><div className="rounded-2xl border border-[#d28a77] bg-[#f6e1db] px-4 py-3 text-sm text-[#7e392a]" role="alert" data-testid="status-storage-error">Your browser could not save this update. Check local storage permissions and try again.</div></div>}
      {celebration && <div className="fixed bottom-20 sm:bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-sidebar px-5 py-3 text-sm font-semibold text-sidebar-foreground shadow-2xl rise-in" role="status" data-testid="status-celebration"><CheckCircle2 size={17} className="text-accent shrink-0" /> {celebration}</div>}

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav aria-label="Mobile Navigation Bar" className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-card-border bg-card/95 px-2 py-2 backdrop-blur-lg shadow-lg md:hidden">
        {[
          { id: 'goals', path: '/goals', label: 'Goals', emoji: '🎯' },
          { id: 'countdowns', path: '/countdowns', label: 'Countdowns', emoji: '⏱️' },
          { id: 'stats', path: '/stats', label: 'Stats', emoji: '📊' },
          { id: 'history', path: '/history', label: 'History', emoji: '📜' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLocation(tab.path)}
              className={`flex min-h-[48px] min-w-[64px] flex-col items-center justify-center rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-[#87CEEB] text-[#0a2533] shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
              data-testid={`mobile-tab-${tab.id}`}
            >
              <span className="text-lg leading-none">{tab.emoji}</span>
              <span className="mt-1 text-[11px] leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-2 sm:px-8 sm:pb-14 lg:px-12">
        {/* Desktop Navigation Tabs */}
        <nav aria-label="Main Navigation" className="mb-8 hidden items-center justify-between gap-3 rounded-2xl border border-card-border bg-card/80 p-2 shadow-sm backdrop-blur-md md:flex">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {[
              { id: 'goals', path: '/goals', label: 'Goals', emoji: '🎯' },
              { id: 'countdowns', path: '/countdowns', label: 'Countdowns', emoji: '⏱️' },
              { id: 'stats', path: '/stats', label: 'Stats', emoji: '📊' },
              { id: 'history', path: '/history', label: 'History', emoji: '📜' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLocation(tab.path)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-[#87CEEB] text-[#003850] shadow-md scale-[1.02]'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <span className="text-base">{tab.emoji}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex pr-2">
            <span className="rounded-lg bg-muted px-2.5 py-1 font-mono-d font-semibold">Ctrl+1..4</span>
            <span>quick switch</span>
          </div>
        </nav>

        {/* Tab Content 1: Goals */}
        {(activeTab === 'goals' || activeTab === 'goals') && (
          <div className="space-y-12 rise-in">
            {/* Quick Stats Summary Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#b9ddeb] bg-[#eaf7fc] p-4 text-xs font-semibold text-[#2e7799] dark:border-[#355461] dark:bg-[#19323d] dark:text-[#8bd0ed]" data-testid="quick-stats-dashboard">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <span className="inline-flex items-center gap-1.5"><Target size={15} /> <strong>Total:</strong> {loggerGoals.length + goals.length} goals</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#55734d]" /> <strong>Completed:</strong> {completedGoals.length + completedLoggerGoalsCount} finished</span>
                <span className="inline-flex items-center gap-1.5"><Timer size={15} /> <strong>Logged:</strong> {formatDurationHM(totalLoggedSeconds)}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">Press Space to start/stop timer</span>
            </div>

            <section className="grid gap-7 lg:grid-cols-[1.15fr_.85fr] lg:items-stretch">
              <div className="relative overflow-hidden rounded-[2rem] bg-sidebar px-6 py-8 text-sidebar-foreground shadow-md sm:px-10 sm:py-10 lg:min-h-[390px] lg:px-12">
                <div className="absolute -right-16 -top-20 size-72 rounded-full border-[1px] border-accent/20 bg-accent/10" />
                <div className="absolute -bottom-24 right-28 size-52 rounded-full border border-sidebar-border" />
                <div className="relative z-[1] max-w-xl">
                  <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.19em] text-accent"><span className="size-1.5 rounded-full bg-accent" /> {formatDate()}</p>
                  <h1 className="font-display text-4xl leading-[1.05] tracking-[-0.02em] sm:text-6xl">A little progress<br /><em className="font-normal text-accent">goes a long way.</em></h1>
                  <p className="mt-6 max-w-md text-sm leading-6 text-sidebar-foreground/70 sm:text-base">Give your attention somewhere meaningful today. You do not need a perfect plan — just the next honest step.</p>
                  <div className="mt-9 flex flex-wrap items-end gap-x-10 gap-y-5">
                    <div>
                      <p className="font-display text-4xl text-accent" data-testid="text-total-time">{formatMinutes(totalMinutes)}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.15em] text-sidebar-foreground/55">time invested</p>
                    </div>
                    <div className="h-10 w-px bg-sidebar-border" />
                    <div>
                      <p className="font-display text-4xl" data-testid="text-progress">{completedGoals.length}<span className="text-xl text-sidebar-foreground/40"> / {goals.length}</span></p>
                      <p className="mt-1 text-xs uppercase tracking-[0.15em] text-sidebar-foreground/55">intentions kept</p>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-6 right-7 hidden rotate-[-9deg] font-display text-5xl text-sidebar-foreground/10 sm:block">keep going</div>
              </div>

              <section className={`relative flex min-h-[360px] flex-col justify-between overflow-hidden rounded-[2rem] border bg-card p-6 paper-shadow sm:p-8 transition-colors ${selectedGoal?.sessionLimitMinutes && (timer.goalId === selectedGoal?.id ? timer.elapsed : 0) >= selectedGoal.sessionLimitMinutes * 60 ? 'border-amber-500/80 bg-amber-500/5 dark:border-amber-400/80 dark:bg-amber-500/10' : 'border-card-border'}`} aria-labelledby="timer-heading">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Focus room</span>
                  {selectedGoal?.sessionLimitMinutes && selectedGoal.sessionLimitMinutes > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf7fc] px-3 py-1 text-xs font-bold text-[#2e7799] dark:bg-[#162235] dark:text-[#87CEEB]" data-testid="badge-timer-session-limit">
                      ⏱️ Planned: {formatMinutes(selectedGoal.sessionLimitMinutes)}
                    </span>
                  ) : null}
                </div>

                <div>
                  <h2 id="timer-heading" className="mt-2 font-display text-2xl font-bold sm:text-3xl">Give this moment a name.</h2>
                  <label htmlFor="timer-goal" className="sr-only">Goal for this time session</label>
                  <div className="relative mt-4">
                    <select id="timer-goal" value={selectedGoal?.id ?? ''} onChange={(event) => setSelectedGoalId(event.target.value || null)} className="w-full appearance-none rounded-xl border border-input bg-background px-4 py-3 pr-10 text-sm font-semibold text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c]" data-testid="select-timer-goal">
                      {activeGoals.length ? activeGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title} {goal.sessionLimitMinutes ? `(${formatMinutes(goal.sessionLimitMinutes)})` : ''}</option>) : <option value="">Create a goal to begin</option>}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-muted-foreground" size={17} />
                  </div>
                </div>

                <div className="py-4 text-center">
                  {selectedGoal?.sessionLimitMinutes && selectedGoal.sessionLimitMinutes > 0 ? (
                    <>
                      <div className="mb-2 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTimerMode(timerMode === 'countdown' ? 'countup' : 'countdown')}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-bold text-foreground transition-colors hover:bg-muted dark:bg-[#162235] dark:border-[#2d425c]"
                          data-testid="button-toggle-timer-mode"
                        >
                          <Clock3 size={13} className="text-[#5aaed6]" /> Mode: {timerMode === 'countdown' ? 'Countdown ⏱️' : 'Count-up 📈'}
                        </button>
                      </div>

                      {(() => {
                        const currentElapsed = timer.goalId === selectedGoal.id ? timer.elapsed : 0;
                        const limitSecs = selectedGoal.sessionLimitMinutes! * 60;
                        const isLimitReached = currentElapsed >= limitSecs;
                        const remainingSecs = Math.max(0, limitSecs - currentElapsed);
                        const overageSecs = currentElapsed > limitSecs ? currentElapsed - limitSecs : 0;

                        return (
                          <div>
                            <p className={`font-mono-d text-5xl tracking-[-0.05em] sm:text-6xl ${isLimitReached ? 'text-amber-600 dark:text-amber-400 animate-pulse font-bold' : selectedIsRunning ? 'text-primary dark:text-[#87CEEB]' : 'text-foreground'}`} data-testid="text-timer">
                              {timerMode === 'countdown'
                                ? (isLimitReached ? `+${formatTimer(overageSecs)}` : formatTimer(remainingSecs))
                                : formatTimer(currentElapsed)
                              }
                            </p>

                            <div className="mx-auto mt-3 max-w-xs">
                              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted dark:bg-[#162235]">
                                <div
                                  className={`h-full transition-all duration-300 ${isLimitReached ? 'bg-amber-500 dark:bg-amber-400' : 'bg-[#5aaed6] dark:bg-[#87CEEB]'}`}
                                  style={{ width: `${Math.min(100, Math.round((currentElapsed / limitSecs) * 100))}%` }}
                                  data-testid="timer-progress-bar"
                                />
                              </div>
                            </div>

                            <p className="mt-2 text-xs font-semibold text-muted-foreground dark:text-[#D1D5DB]" data-testid="text-timer-remaining">
                              {isLimitReached ? (
                                <span className="text-amber-600 dark:text-amber-400 font-bold" data-testid="status-time-is-up">
                                  ⏰ Time's up! You've reached your planned session time (+{formatTimer(overageSecs)} over).
                                </span>
                              ) : timerMode === 'countdown' ? (
                                <span>⏳ <strong>{formatTimer(remainingSecs)}</strong> left of {formatMinutes(selectedGoal.sessionLimitMinutes!)} planned</span>
                              ) : (
                                <span>⏱️ <strong>{formatTimer(currentElapsed)}</strong> / {formatTimer(limitSecs)} ({formatMinutes(selectedGoal.sessionLimitMinutes!)} planned)</span>
                              )}
                            </p>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <p className={`font-mono-d text-5xl tracking-[-0.05em] sm:text-6xl ${selectedIsRunning ? 'text-primary dark:text-[#87CEEB]' : 'text-foreground'}`} data-testid="text-timer">{formatTimer(timer.goalId === selectedGoal?.id ? timer.elapsed : 0)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{selectedIsRunning ? 'The clock is yours.' : timer.elapsed ? 'Paused — resume when you are ready.' : 'No rush. Begin when it feels right.'}</p>
                    </>
                  )}
                </div>

                {selectedGoal?.subGoals && selectedGoal.subGoals.length > 0 && (
                  <div className="mt-4 rounded-xl border border-border/80 bg-background/60 p-3 text-left dark:bg-[#162235]/80 dark:border-[#2d425c]" data-testid="focus-room-subgoals-container">
                    <div className="flex items-center justify-between pb-1 text-[11px] font-bold text-muted-foreground dark:text-[#D1D5DB]">
                      <span className="uppercase tracking-wider">Target Items Checklist</span>
                      <span className="font-mono-d text-[#2e7799] dark:text-[#87CEEB]" data-testid="focus-room-subgoals-count">
                        {selectedGoal.subGoals.filter((s) => s.completed).length} / {selectedGoal.subGoals.length}
                      </span>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 pt-1">
                      {selectedGoal.subGoals.map((sub) => (
                        <div
                          key={sub.id}
                          onClick={() => toggleSubGoal(selectedGoal.id, sub.id)}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/80 dark:text-white dark:hover:bg-[#1f2d3d]"
                          data-testid={`focus-subgoal-${sub.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={sub.completed}
                            onChange={() => {}}
                            className="size-3.5 rounded border-gray-300 text-primary focus:ring-[#87CEEB] pointer-events-none"
                            data-testid={`checkbox-focus-subgoal-${sub.id}`}
                          />
                          <span className={`flex-1 text-xs font-medium ${sub.completed ? 'line-through text-muted-foreground dark:text-slate-400' : ''}`}>
                            {sub.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-center gap-2">
                  {selectedIsRunning ? (
                    <button type="button" onClick={pauseTimer} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 dark:bg-[#87CEEB] dark:text-[#0a2533]" data-testid="button-pause-timer"><Pause size={16} /> Pause</button>
                  ) : (
                    <button type="button" onClick={startTimer} disabled={!selectedGoal} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#87CEEB] dark:text-[#0a2533]" data-testid="button-start-timer"><Play size={16} fill="currentColor" /> {timer.elapsed ? 'Resume' : 'Start session'}</button>
                  )}
                  <button type="button" onClick={resetTimer} title="Finish and log session" className="grid size-11 place-items-center rounded-xl border border-input bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary dark:border-[#2d425c] dark:hover:text-[#87CEEB]" data-testid="button-reset-timer"><RotateCcw size={17} /></button>
                </div>
              </section>
            </section>

            <section aria-labelledby="goals-heading">
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground dark:text-[#D1D5DB]">Your little list</p>
                  <h2 id="goals-heading" className="mt-1 font-display text-3xl font-bold text-foreground dark:text-white sm:text-4xl">Current intentions</h2>
                </div>
                <button type="button" onClick={() => setShowCompleted((current) => !current)} className="hidden items-center gap-2 text-xs font-bold text-muted-foreground transition-colors hover:text-primary dark:text-[#D1D5DB] dark:hover:text-[#87CEEB] sm:flex" data-testid="button-toggle-completed">
                  {showCompleted ? 'Hide completed' : `See completed (${completedGoals.length})`} <ArrowRight size={14} />
                </button>
              </div>

              {activeGoals.length === 0 ? (
                <EmptyGoals onCreate={() => { setEditingGoal(null); setIsGoalFormOpen(true); }} />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeGoals.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index} selected={selectedGoalId === goal.id} onSelect={() => setSelectedGoalId(goal.id)} onComplete={() => toggleComplete(goal.id)} onDelete={() => setGoalToDelete(goal)} onEdit={() => { setEditingGoal(goal); setIsGoalFormOpen(true); }} onToggleSubGoal={toggleSubGoal} />)}
                </div>
              )}

              {showCompleted && completedGoals.length > 0 && <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{completedGoals.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index} selected={selectedGoalId === goal.id} onSelect={() => setSelectedGoalId(goal.id)} onComplete={() => toggleComplete(goal.id)} onDelete={() => setGoalToDelete(goal)} onEdit={() => { setEditingGoal(goal); setIsGoalFormOpen(true); }} onToggleSubGoal={toggleSubGoal} />)}</div>}
              <button type="button" onClick={() => { setEditingGoal(null); setIsGoalFormOpen(true); }} className="mt-4 flex min-h-[102px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#c9bda9] bg-card/35 text-sm font-bold text-muted-foreground transition-colors hover:border-primary hover:bg-card hover:text-primary dark:border-[#38587a] dark:text-[#D1D5DB] dark:hover:border-[#87CEEB] dark:hover:text-[#87CEEB]" data-testid="button-add-goal-empty">
                <Plus size={17} /> Add another intention
              </button>
            </section>

            {/* Goal Timer Logger Section */}
            <section aria-labelledby="logger-heading">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">Build the hours</p>
                  <h2 id="logger-heading" className="mt-1 font-display text-3xl font-bold text-foreground dark:text-white sm:text-4xl">Goal Timer Logger</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px]">
                    <Search size={15} className="absolute left-3 top-3 text-muted-foreground dark:text-slate-400" />
                    <input type="text" placeholder="Search goals..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#87CEEB]" data-testid="input-search-goals" />
                  </div>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c]" data-testid="select-sort-goals">
                    <option value="default">Default Sort</option>
                    <option value="progress-desc">Highest Progress</option>
                    <option value="progress-asc">Lowest Progress</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="category">Category</option>
                  </select>
                  <button type="button" onClick={() => setIsLoggerGoalFormOpen(true)} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-2 text-xs font-bold text-[#173849] dark:text-[#0a2533] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#72bde0] dark:hover:bg-[#a1d9f0]" data-testid="button-add-logger-goal">
                    <Plus size={15} /> New timer goal
                  </button>
                </div>
              </div>

              {loggerGoals.length === 0 ? (
                <EmptyLoggerGoals onCreate={() => setIsLoggerGoalFormOpen(true)} />
              ) : (
                <div className="space-y-8">
                  {loggerCategories.map((category) => {
                    const categoryGoals = loggerGoalsByCategory[category];
                    const categoryStyle = loggerCategoryStyles[category];
                    const CategoryIcon = categoryStyle.icon;
                    return (
                      <section key={category} aria-labelledby={`logger-category-${category.replace(/\s+/g, '-').toLowerCase()}`} data-testid={`logger-category-${category.replace(/\s+/g, '-').toLowerCase()}`}>
                        <div className="mb-4 flex items-center gap-3">
                          <div className={`grid size-9 place-items-center rounded-xl ${categoryStyle.soft} ${categoryStyle.ink} ${categoryStyle.darkSoft} ${categoryStyle.darkInk}`}><CategoryIcon size={16} /></div>
                          <div>
                            <h3 id={`logger-category-${category.replace(/\s+/g, '-').toLowerCase()}`} className="font-display text-2xl font-bold text-foreground dark:text-white">{category}</h3>
                            <p className="text-xs text-muted-foreground dark:text-[#D1D5DB]">{categoryGoals.length ? `${categoryGoals.length} ${categoryGoals.length === 1 ? 'goal' : 'goals'}` : 'No matching goals'}</p>
                          </div>
                        </div>
                        {categoryGoals.length ? (
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {categoryGoals.map((goal, index) => <LoggerGoalCard key={goal.id} goal={goal} elapsedSeconds={loggerTimer.goalId === goal.id ? loggerElapsedSeconds : 0} isRunning={loggerTimer.goalId === goal.id && Boolean(loggerTimer.startedAt)} onStart={() => startLoggerTimer(goal.id)} onStop={stopLoggerTimer} onDelete={() => removeLoggerGoal(goal.id)} onReset={() => resetLoggerProgress(goal.id)} index={index} />)}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-[#b9ddeb] bg-card/35 px-5 py-4 text-sm text-muted-foreground dark:border-[#38587a] dark:bg-card/50 dark:text-[#D1D5DB]">No goals found in this category.</div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab Content 2: Countdowns */}
        {activeTab === 'countdowns' && (
          <section className="space-y-6 rise-in" aria-labelledby="events-heading">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-card-border bg-card p-5 sm:p-6 paper-shadow">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">Mark the moment</p>
                <h2 id="events-heading" className="mt-1 font-display text-2xl font-bold text-foreground dark:text-white sm:text-4xl">Event Countdowns</h2>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground dark:text-[#D1D5DB]">Keep track of upcoming deadlines, milestones, celebrations, and personal goals.</p>
              </div>
              <button type="button" onClick={() => setIsEventFormOpen(true)} className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-[#5aaed6] dark:bg-[#87CEEB] px-5 py-2.5 text-xs font-bold text-[#173849] dark:text-[#0a2533] shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#72bde0] dark:hover:bg-[#a1d9f0]" data-testid="button-add-event">
                <Plus size={16} /> Add event
              </button>
            </div>
            {events.length === 0 ? (
              <EmptyEvents onCreate={() => setIsEventFormOpen(true)} />
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {events.map((event, index) => <EventCard key={event.id} event={event} now={now} index={index} onDelete={() => removeEvent(event.id)} />)}
              </div>
            )}
          </section>
        )}

        {/* Tab Content 3: Stats */}
        {activeTab === 'stats' && (
          <section className="space-y-6 rise-in" aria-labelledby="stats-heading">
            <div className="rounded-2xl border border-card-border bg-card p-6 paper-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4387a9]">Analytics &amp; Productivity</p>
                  <h2 id="stats-heading" className="mt-1 font-display text-3xl sm:text-4xl">Statistics Dashboard</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Detailed overview of your focus habits over the past 7 days.</p>
                </div>
                <button type="button" onClick={() => setIsStatsOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-[#b9ddeb] bg-[#eaf7fc] px-4 py-2 text-xs font-bold text-[#2e7799]" data-testid="button-expand-stats">
                  <BarChart3 size={15} /> Modal View
                </button>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#b9ddeb] bg-[#eaf7fc] p-5 dark:border-[#355461] dark:bg-[#19323d]">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4387a9]">Today's Focus</p>
                  <p className="mt-3 font-mono-d text-4xl font-bold text-[#2e7799] dark:text-[#8bd0ed]">{formatLoggerHours(todayStatsSeconds / 3600)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Logged across all session timers</p>
                </div>
                <div className="rounded-2xl border border-[#b9ddeb] bg-card p-5 dark:border-[#355461]">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4387a9]">7-Day Total</p>
                  <p className="mt-3 font-mono-d text-4xl font-bold text-[#2e7799] dark:text-[#8bd0ed]">{formatLoggerHours(weeklyStatsSeconds / 3600)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Cumulative hours recorded</p>
                </div>
                <div className="rounded-2xl border border-[#b9ddeb] bg-card p-5 dark:border-[#355461]">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4387a9]">Total Logged</p>
                  <p className="mt-3 font-mono-d text-4xl font-bold text-[#2e7799] dark:text-[#8bd0ed]">{formatDurationHM(totalLoggedSeconds)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">All-time timer duration</p>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-[#dcecf3] bg-background/80 p-6 dark:border-[#355461]">
                <h3 className="font-display text-2xl">Daily Activity Chart</h3>
                <div className="mt-6 grid h-44 grid-cols-7 items-end gap-2 sm:gap-4">
                  {statsDays.map((day) => {
                    const height = day.totalSeconds ? Math.max(12, Math.round((day.totalSeconds / maxStatsDaySeconds) * 100)) : 6;
                    return (
                      <div key={day.dateKey} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={`${day.dateLabel}: ${formatLoggerHours(day.totalSeconds / 3600)}`}>
                        <span className="text-[11px] font-bold text-[#4387a9]">{day.totalSeconds ? formatLoggerHours(day.totalSeconds / 3600) : '0h'}</span>
                        <div className="flex h-28 w-full items-end rounded-xl bg-[#eaf7fc] dark:bg-[#19323d]">
                          <div className="w-full rounded-xl bg-gradient-to-t from-[#5aaed6] to-[#87CEEB] transition-all duration-500" style={{ height: `${height}%` }} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{day.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Tab Content 4: History */}
        {activeTab === 'history' && (
          <section className="space-y-6 rise-in" aria-labelledby="history-heading">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-card-border bg-card p-6 paper-shadow">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4387a9]">Session Logs</p>
                <h2 id="history-heading" className="mt-1 font-display text-3xl sm:text-4xl">Full Timer History</h2>
                <p className="mt-1 text-sm text-muted-foreground">A complete chronological history of all your logged timer sessions.</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsHistoryOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[#b9ddeb] bg-[#eaf7fc] px-4 py-2 text-xs font-bold text-[#2e7799]" data-testid="button-open-history-modal">
                  <History size={15} /> Modal View
                </button>
                {timerSessions.length > 0 && (
                  <button type="button" onClick={clearHistory} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/20" data-testid="button-clear-history-tab">
                    <Trash2 size={14} /> Clear Log
                  </button>
                )}
              </div>
            </div>

            {timerSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b9ddeb] bg-[#eaf7fc]/50 px-6 py-12 text-center dark:border-[#355461] dark:bg-[#19323d]/50" data-testid="history-tab-empty">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#c9ebf8] text-[#4387a9] dark:bg-[#29434e] dark:text-[#8bd0ed]"><History size={22} /></div>
                <h3 className="mt-4 font-display text-xl">Your timer sessions will appear here 📝</h3>
                <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted-foreground">Complete a timer session in the Goals tab to build your record.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#dcecf3] rounded-2xl border border-card-border bg-card p-6 paper-shadow dark:divide-[#355461]">
                {timerSessions.map((session) => (
                  <div key={session.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4 first:pt-0 last:pb-0">
                    <div>
                      <h4 className="font-display text-lg text-foreground">{session.goalName}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{formatSessionDate(session.timestamp)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf7fc] px-3.5 py-1.5 font-mono-d text-xs font-bold text-[#2e7799] dark:bg-[#19323d] dark:text-[#8bd0ed]">
                      <Timer size={14} /> {formatDurationHM(session.durationSeconds)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-[1440px] px-5 pb-8 pt-2 text-center text-xs text-muted-foreground sm:px-8 lg:px-12">Made for the days that matter, one small step at a time.</footer>

      {isGoalFormOpen && (
        <GoalForm
          initialGoal={editingGoal}
          onClose={() => { setIsGoalFormOpen(false); setEditingGoal(null); }}
          onSubmit={(title, note, limit, subGoals) => {
            if (editingGoal) {
              updateGoal(editingGoal.id, title, note, limit, subGoals);
            } else {
              addGoal(title, note, limit, subGoals);
            }
          }}
        />
      )}
      {isEventFormOpen && <EventForm onClose={() => setIsEventFormOpen(false)} onSubmit={addEvent} />}
      {isLoggerGoalFormOpen && <LoggerGoalForm onClose={() => setIsLoggerGoalFormOpen(false)} onSubmit={addLoggerGoal} />}
      {isStatsOpen && <StatsPanel days={statsDays} todaySeconds={todayStatsSeconds} weeklySeconds={weeklyStatsSeconds} maxDaySeconds={maxStatsDaySeconds} onClose={() => setIsStatsOpen(false)} />}
      {isHistoryOpen && <HistoryLogModal sessions={timerSessions} onClose={() => setIsHistoryOpen(false)} onClearHistory={clearHistory} />}
      {isInstallGuideOpen && <InstallPwaModal pwaState={pwaState} onClose={() => setIsInstallGuideOpen(false)} />}
      {goalToDelete && <DeleteDialog goal={goalToDelete} onCancel={() => setGoalToDelete(null)} onConfirm={removeGoal} />}
    </div>
  );
}

function formatDate() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function GoalCard({ goal, selected, index, onSelect, onComplete, onDelete, onEdit, onToggleSubGoal }: { goal: Goal; selected: boolean; index: number; onSelect: () => void; onComplete: () => void; onDelete: () => void; onEdit?: () => void; onToggleSubGoal?: (goalId: string, subGoalId: string) => void }) {
  const style = colorStyles[goal.color];
  const Icon = style.icon;
  const completion = goal.completed ? 100 : goal.minutes > 0 ? Math.min(99, Math.max(1, Math.round((goal.minutes / 60) * 100))) : 0;
  const motivation = getMotivationalMessage(completion);

  const completedSubCount = goal.subGoals ? goal.subGoals.filter((s) => s.completed).length : 0;
  const totalSubCount = goal.subGoals ? goal.subGoals.length : 0;

  return (
    <article className={`group relative rounded-2xl border bg-card p-5 transition-all duration-300 rise-in rise-in-delay-${Math.min(index + 1, 3)} ${selected ? 'border-primary/60 shadow-md -translate-y-0.5 dark:border-[#87CEEB] dark:shadow-[0_0_15px_rgba(135,206,235,0.15)]' : 'border-card-border soft-shadow hover:-translate-y-0.5 hover:border-primary/35 dark:hover:border-[#87CEEB]/50'}`} data-testid={`card-goal-${goal.id}`}>
      <button type="button" onClick={onSelect} className="absolute inset-0 z-0 rounded-2xl text-left" aria-label={`Select ${goal.title} for the timer`} data-testid={`button-select-goal-${goal.id}`} />
      <div className="relative z-[1] pointer-events-none">
        <div className="flex items-start justify-between gap-3">
          <div className={`grid size-10 place-items-center rounded-xl ${style.soft} ${style.ink}`}><Icon size={18} /></div>
          <div className="pointer-events-auto flex items-center gap-1">
            {onEdit && (
              <button type="button" onClick={onEdit} aria-label={`Edit ${goal.title}`} className="grid size-8 place-items-center rounded-full text-muted-foreground dark:text-[#9CA3AF] transition-colors hover:bg-muted dark:hover:bg-[#162235] hover:text-foreground dark:hover:text-white" data-testid={`button-edit-goal-${goal.id}`}><Pencil size={14} /></button>
            )}
            <button type="button" onClick={onComplete} aria-label={goal.completed ? `Mark ${goal.title} active` : `Mark ${goal.title} complete`} className={`grid size-8 place-items-center rounded-full transition-colors ${goal.completed ? 'bg-[#78966d] text-[#f8f5eb]' : 'border border-border text-muted-foreground hover:border-[#78966d] hover:text-[#55734d] dark:text-[#D1D5DB] dark:border-slate-600'}`} data-testid={`button-complete-goal-${goal.id}`}>{goal.completed ? <Check size={15} strokeWidth={3} /> : <Circle size={15} />}</button>
            <button type="button" onClick={onDelete} aria-label={`Delete ${goal.title}`} className="grid size-8 place-items-center rounded-full text-muted-foreground dark:text-[#9CA3AF] transition-colors hover:bg-[#f3dfd5] hover:text-destructive dark:hover:bg-[#56372d]" data-testid={`button-delete-goal-${goal.id}`}><Trash2 size={15} /></button>
          </div>
        </div>
        <h3 className={`mt-5 font-display text-[1.35rem] font-bold leading-tight ${goal.completed ? 'text-muted-foreground line-through decoration-primary/50 dark:text-slate-400' : 'text-foreground dark:text-white'}`} data-testid={`text-goal-title-${goal.id}`}>{goal.title}</h3>
        <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground dark:text-[#D1D5DB]" data-testid={`text-goal-note-${goal.id}`}>{goal.note}</p>

        {goal.sessionLimitMinutes && goal.sessionLimitMinutes > 0 ? (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#eaf7fc] px-3 py-1 text-xs font-bold text-[#2e7799] dark:bg-[#162235] dark:text-[#87CEEB]" data-testid={`badge-session-limit-${goal.id}`}>
            <Clock3 size={12} /> <span>Planned: {formatMinutes(goal.sessionLimitMinutes)}</span>
          </div>
        ) : null}

        {goal.subGoals && goal.subGoals.length > 0 && (
          <div className="mt-4 rounded-xl border border-border/80 bg-background/60 p-3 dark:bg-[#162235]/70 dark:border-[#2d425c]" data-testid={`subgoals-container-${goal.id}`}>
            <div className="flex items-center justify-between pb-2 text-[11px] font-bold text-muted-foreground dark:text-[#D1D5DB]">
              <span className="uppercase tracking-wider">Target Items</span>
              <span className="font-mono-d text-[#2e7799] dark:text-[#87CEEB]" data-testid={`text-subgoals-counter-${goal.id}`}>
                {completedSubCount} / {totalSubCount}
              </span>
            </div>
            <div className="space-y-1.5 pt-1">
              {goal.subGoals.map((sub) => (
                <div
                  key={sub.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onToggleSubGoal) onToggleSubGoal(goal.id, sub.id);
                  }}
                  className="pointer-events-auto flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/70 dark:text-white dark:hover:bg-[#1f2d3d]"
                  data-testid={`card-subgoal-${goal.id}-${sub.id}`}
                >
                  <input
                    type="checkbox"
                    checked={sub.completed}
                    onChange={() => {}}
                    className="size-3.5 rounded border-gray-300 text-primary focus:ring-[#87CEEB] pointer-events-none"
                    data-testid={`checkbox-card-subgoal-${goal.id}-${sub.id}`}
                  />
                  <span className={`flex-1 text-xs font-medium ${sub.completed ? 'line-through text-muted-foreground dark:text-slate-400' : ''}`}>
                    {sub.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted dark:bg-[#162235]" aria-label={`${completion}% complete`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}>
            <div className={`h-full rounded-full ${style.bar} transition-all duration-500`} style={{ width: `${completion}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs font-semibold" data-testid={`goal-motivation-container-${goal.id}`}>
            <span className="text-foreground dark:text-white" data-testid={`text-goal-motivation-${goal.id}`}>{motivation}</span>
            <span className="font-mono-d text-muted-foreground dark:text-[#D1D5DB]" data-testid={`text-goal-percentage-${goal.id}`}>{completion}% completed</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-mono-d text-muted-foreground dark:text-[#D1D5DB]"><Clock3 size={13} /> {formatMinutes(goal.minutes)}</span>
          <span className="text-muted-foreground dark:text-[#D1D5DB]">{goal.createdAt}</span>
        </div>
      </div>
      {selected && <div className="absolute bottom-0 left-5 right-5 h-0.5 rounded-full bg-primary dark:bg-[#87CEEB]" />}
    </article>
  );
}

function MiniStat({ icon: Icon, label, value, testId }: { icon: typeof Clock3; label: string; value: string; testId: string }) {
  return <div className="rounded-xl bg-background px-3 py-3" data-testid={testId}><Icon size={15} className="text-primary dark:text-[#87CEEB]" /><p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground dark:text-[#D1D5DB]">{label}</p><p className="mt-1 truncate text-sm font-bold text-foreground dark:text-white" title={value}>{value}</p></div>;
}

function StatsPanel({ days, todaySeconds, weeklySeconds, maxDaySeconds, onClose }: { days: Array<{ dateKey: string; label: string; dateLabel: string; totalSeconds: number }>; todaySeconds: number; weeklySeconds: number; maxDaySeconds: number; onClose: () => void }) {
  const weeklyHours = weeklySeconds / 3600;
  const encouragement = weeklySeconds > 0
    ? 'A little time, repeated, becomes a life you can see.'
    : 'Your next focused session will give this week a beginning.';
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-sidebar/45 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-[#b9ddeb] bg-card p-5 shadow-2xl rise-in dark:border-[#38587a] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="stats-panel-title" data-testid="stats-panel">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]"><BarChart3 size={15} /> Your rhythm</p>
            <h2 id="stats-panel-title" className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-4xl">Time made visible.</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-[#D1D5DB] sm:mt-2 sm:text-sm">A gentle look at the focused sessions you have finished lately.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close stats" className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[#eaf7fc] hover:text-[#2e7799] dark:text-[#D1D5DB] dark:hover:bg-[#1f2d3d] dark:hover:text-[#87CEEB]" data-testid="button-close-stats"><X size={20} /></button>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#b9ddeb] bg-[#eaf7fc] p-5 dark:border-[#38587a] dark:bg-[#1f2d3d]" data-testid="stats-today">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2e7799] dark:text-[#87CEEB]">Today</p>
            <p className="mt-3 font-mono-d text-4xl font-bold tracking-[-0.05em] text-[#2e7799] dark:text-[#87CEEB]" data-testid="text-stats-today">{formatLoggerHours(todaySeconds / 3600)}</p>
            <p className="mt-1 text-sm text-[#497080] dark:text-[#D1D5DB]">Keep the next small promise.</p>
          </div>
          <div className="rounded-2xl border border-[#b9ddeb] bg-card p-5 dark:border-[#38587a]" data-testid="stats-week">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2e7799] dark:text-[#87CEEB]">Last 7 days</p>
            <p className="mt-3 font-mono-d text-4xl font-bold tracking-[-0.05em] text-[#2e7799] dark:text-[#87CEEB]" data-testid="text-stats-week">{formatLoggerHours(weeklyHours)}</p>
            <p className="mt-1 text-sm text-muted-foreground dark:text-[#D1D5DB]">Every finished session counts.</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#dcecf3] bg-background/70 p-4 dark:border-[#38587a] sm:p-5" data-testid="stats-breakdown">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground dark:text-[#D1D5DB]">Daily rhythm</p>
              <h3 className="mt-1 font-display text-2xl font-bold text-foreground dark:text-white">The last seven days</h3>
            </div>
            <Timer size={20} className="text-[#5aaed6] dark:text-[#87CEEB]" />
          </div>
          <div className="mt-6 grid h-36 grid-cols-7 items-end gap-2 sm:gap-3">
            {days.map((day) => {
              const height = day.totalSeconds ? Math.max(12, Math.round((day.totalSeconds / maxDaySeconds) * 100)) : 4;
              return (
                <div key={day.dateKey} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={`${day.dateLabel}: ${formatLoggerHours(day.totalSeconds / 3600)}`} data-testid={`stats-day-${day.dateKey}`}>
                  <span className="hidden text-[10px] font-bold text-[#2e7799] dark:text-[#87CEEB] sm:block">{day.totalSeconds ? formatLoggerHours(day.totalSeconds / 3600) : '—'}</span>
                  <div className="flex h-24 w-full items-end rounded-lg bg-[#eaf7fc] dark:bg-[#162235]">
                    <div className="w-full rounded-lg bg-[#5aaed6] dark:bg-[#87CEEB] transition-all duration-500" style={{ height: `${height}%` }} aria-label={`${day.label}, ${formatLoggerHours(day.totalSeconds / 3600)}`} role="img" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground dark:text-[#D1D5DB]">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-5 text-center text-sm italic leading-6 text-muted-foreground dark:text-[#D1D5DB]" data-testid="stats-encouragement">{encouragement}</p>
      </section>
    </div>
  );
}

function EmptyGoals({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#c9bda9] bg-card/50 px-6 py-10 text-center transition-all duration-300 hover:scale-[1.005] dark:border-[#4a4035] dark:bg-[#25201b] dark:shadow-[0_0_20px_rgba(201,151,53,0.1)]" data-testid="empty-goals">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e2eadc] text-[#55734d] dark:bg-[#2a3d27] dark:text-[#a5d697]">
        <Leaf size={22} />
      </div>
      <h3 className="mt-4 font-display text-2xl font-bold text-foreground dark:text-white dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
        A clear page can be a beginning.
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm font-medium leading-6 text-muted-foreground dark:text-[#D1D5DB]">
        Add one intention that would make today feel a little more like yours.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:opacity-90 hover:scale-[1.03] hover:shadow-lg"
        data-testid="button-create-first-goal"
      >
        <Plus size={16} strokeWidth={2.5} /> Create your first goal
      </button>
    </div>
  );
}

function EmptyEvents({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#9bcde3] bg-[#eaf7fc]/70 px-6 py-10 text-center transition-all duration-300 hover:scale-[1.005] dark:border-[#38587a] dark:bg-[#1E2A4A] dark:shadow-[0_0_20px_rgba(135,206,235,0.15)]" data-testid="empty-events">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#c9ebf8] text-[#2e7799] dark:bg-[#283e52] dark:text-[#87CEEB]">
        <Clock3 size={22} />
      </div>
      <h3 className="mt-4 font-display text-2xl font-bold text-foreground dark:text-white dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] sm:text-3xl">
        Give something good a date.
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm font-medium leading-6 text-muted-foreground dark:text-[#D1D5DB]">
        Add a birthday, trip, deadline, or any moment you want to look forward to.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#87CEEB] px-5 py-2.5 text-sm font-bold text-[#0a2533] shadow-md transition-all duration-200 hover:bg-[#72c2e6] hover:scale-[1.03] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
        data-testid="button-create-first-event"
      >
        <Plus size={16} strokeWidth={2.5} /> Add your first event
      </button>
    </div>
  );
}

function EventCard({ event, now, index, onDelete }: { event: TrackerEvent; now: number; index: number; onDelete: () => void }) {
  const countdown = getCountdown(event.datetime, now);
  return (
    <article className={`relative overflow-hidden rounded-2xl border border-[#b9ddeb] bg-card p-5 shadow-[0_8px_22px_-16px_rgba(46,119,153,.55)] dark:border-[#38587a] dark:bg-[#1E2A4A] dark:shadow-[0_8px_22px_-16px_rgba(0,0,0,.8)] rise-in rise-in-delay-${Math.min(index + 1, 3)}`} data-testid={`card-event-${event.id}`}>
      <div className="absolute -right-9 -top-12 size-32 rounded-full border border-[#9bcde3]/60 bg-[#eaf7fc] dark:border-[#38587a]/60 dark:bg-[#192b3c]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#c9ebf8] text-[#2e7799] dark:bg-[#283e52] dark:text-[#87CEEB]"><Clock3 size={18} /></div>
          <button type="button" onClick={onDelete} aria-label={`Delete ${event.name}`} className="grid size-8 place-items-center rounded-full text-[#6b8d9b] transition-colors hover:bg-[#dff3fb] hover:text-[#2e7799] dark:text-[#9CA3AF] dark:hover:bg-[#283e52] dark:hover:text-[#87CEEB]" data-testid={`button-delete-event-${event.id}`}><Trash2 size={15} /></button>
        </div>
        <h3 className="mt-5 font-display text-[1.35rem] font-bold leading-tight text-foreground dark:text-white" data-testid={`text-event-name-${event.id}`}>{event.name}</h3>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2e7799] dark:text-[#87CEEB]" data-testid={`text-event-date-${event.id}`}><Clock3 size={13} /> {formatEventDate(event.datetime)}</p>
        {countdown ? (
          <div className="mt-5 grid grid-cols-4 gap-2" data-testid={`countdown-${event.id}`} aria-label={`Countdown to ${event.name}`}>
            {Object.entries(countdown).map(([unit, value]) => (
              <div key={unit} className="rounded-xl bg-[#eaf7fc] px-2 py-3 text-center dark:bg-[#162235] dark:border dark:border-[#2d425c]">
                <p className="font-mono-d text-lg font-bold text-[#2e7799] dark:text-[#87CEEB] sm:text-xl">{String(value).padStart(2, '0')}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#528096] dark:text-[#D1D5DB]">{unit}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-[#eaf7fc] px-4 py-4 text-center text-sm font-bold text-[#2e7799] dark:bg-[#162235] dark:text-[#87CEEB] dark:border dark:border-[#2d425c]" role="status" data-testid={`event-passed-${event.id}`}>🎉 Event passed!</div>
        )}
      </div>
    </article>
  );
}

function EmptyLoggerGoals({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#9bcde3] bg-[#eaf7fc]/70 px-6 py-10 text-center transition-all duration-300 hover:scale-[1.005] dark:border-[#38587a] dark:bg-[#1E2A4A] dark:shadow-[0_0_20px_rgba(135,206,235,0.15)]" data-testid="empty-logger-goals">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#c9ebf8] text-[#2e7799] dark:bg-[#283e52] dark:text-[#87CEEB]">
        <Timer size={22} />
      </div>
      <h3 className="mt-4 font-display text-2xl font-bold text-foreground dark:text-white dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] sm:text-3xl">
        Make the hours count.
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm font-medium leading-6 text-muted-foreground dark:text-[#D1D5DB]">
        Create a goal with a bigger horizon, then log focused sessions as you move toward it.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#87CEEB] px-5 py-2.5 text-sm font-bold text-[#0a2533] shadow-md transition-all duration-200 hover:bg-[#72c2e6] hover:scale-[1.03] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
        data-testid="button-create-first-logger-goal"
      >
        <Plus size={16} strokeWidth={2.5} /> Create a timer goal
      </button>
    </div>
  );
}

function LoggerGoalCard({ goal, elapsedSeconds, isRunning, onStart, onStop, onDelete, onReset, index }: { goal: LoggerGoal; elapsedSeconds: number; isRunning: boolean; onStart: () => void; onStop: () => void; onDelete: () => void; onReset: () => void; index: number }) {
  const style = loggerCategoryStyles[goal.category];
  const Icon = style.icon;
  const completion = goal.targetHours > 0 ? Math.min(100, Math.round((goal.completedHours / goal.targetHours) * 100)) : 0;
  const motivation = getMotivationalMessage(completion);

  return (
    <article className={`relative overflow-hidden rounded-2xl border border-[#b9ddeb] bg-card p-5 shadow-[0_8px_22px_-16px_rgba(46,119,153,.55)] dark:border-[#38587a] dark:bg-[#1E2A4A] dark:shadow-[0_8px_22px_-16px_rgba(0,0,0,.8)] rise-in rise-in-delay-${Math.min(index + 1, 3)}`} data-testid={`card-logger-goal-${goal.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`grid size-10 place-items-center rounded-xl ${style.soft} ${style.ink} ${style.darkSoft} ${style.darkInk}`}><Icon size={18} /></div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${style.soft} ${style.ink} ${style.darkSoft} ${style.darkInk}`} data-testid={`text-logger-category-${goal.id}`}>{goal.category}</span>
      </div>
      <h3 className="mt-5 font-display text-[1.35rem] font-bold leading-tight text-foreground dark:text-white" data-testid={`text-logger-goal-name-${goal.id}`}>{goal.name}</h3>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-mono-d text-xl font-bold text-[#2e7799] dark:text-[#87CEEB]" data-testid={`text-logger-progress-${goal.id}`}>{formatLoggerHours(goal.completedHours)}</p>
          <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">of {formatLoggerHours(goal.targetHours)} target</p>
        </div>
        <span className="font-mono-d text-xs font-bold text-[#2e7799] dark:text-[#87CEEB]">{completion}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dcecf3] dark:bg-[#162235]" aria-label={`${completion}% complete`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}><div className="h-full rounded-full bg-[#5aaed6] dark:bg-[#87CEEB] transition-all duration-500" style={{ width: `${completion}%` }} /></div>
      <div className="mt-2 flex items-center justify-between text-xs font-semibold" data-testid={`logger-motivation-container-${goal.id}`}>
        <span className="text-[#2e7799] dark:text-[#87CEEB]" data-testid={`text-logger-motivation-${goal.id}`}>{motivation}</span>
        <span className="font-mono-d text-muted-foreground dark:text-[#D1D5DB]" data-testid={`text-logger-percentage-${goal.id}`}>{completion}% completed</span>
      </div>
      <div className="mt-5 rounded-xl bg-[#eaf7fc] px-4 py-3 text-center dark:bg-[#162235] dark:border dark:border-[#2d425c]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#528096] dark:text-[#D1D5DB]">{isRunning ? 'Session in progress' : 'Ready when you are'}</p>
        <p className="mt-1 font-mono-d text-2xl font-bold tracking-[-0.04em] text-[#2e7799] dark:text-[#87CEEB]" data-testid={`text-logger-elapsed-${goal.id}`}>{formatTimer(elapsedSeconds)}</p>
      </div>
      <div className="mt-4">
        {isRunning ? (
          <button type="button" onClick={onStop} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e7799] dark:bg-[#20526e] px-4 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5" data-testid={`button-stop-logger-${goal.id}`}><Square size={15} fill="currentColor" /> Stop</button>
        ) : (
          <button type="button" onClick={onStart} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-3 text-sm font-bold text-[#173849] dark:text-[#0a2533] transition-all hover:bg-[#72bde0] dark:hover:bg-[#a1d9f0] hover:-translate-y-0.5" data-testid={`button-start-logger-${goal.id}`}><Play size={16} fill="currentColor" /> Start</button>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[#dcecf3] pt-3 dark:border-[#2d425c]">
        <button type="button" onClick={onReset} disabled={goal.completedHours === 0} className="text-xs font-bold text-[#2e7799] dark:text-[#87CEEB] transition-colors hover:text-[#173849] dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-reset-logger-${goal.id}`}>Reset progress</button>
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground dark:text-[#9CA3AF] transition-colors hover:text-destructive" data-testid={`button-delete-logger-${goal.id}`}><Trash2 size={13} /> Delete</button>
      </div>
    </article>
  );
}

function LoadingState() {
  return <div className="min-h-[100dvh] bg-background px-5 py-6 sm:px-10"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-10 w-56 rounded-xl bg-muted" /><div className="mt-10 grid gap-6 lg:grid-cols-2"><div className="h-96 rounded-[2rem] bg-sidebar/80" /><div className="h-96 rounded-[2rem] bg-muted" /></div><div className="mt-10 h-32 rounded-2xl bg-muted" /></div></div>;
}

function GoalForm({ initialGoal, onClose, onSubmit }: { initialGoal?: Goal | null; onClose: () => void; onSubmit: (title: string, note: string, sessionLimitMinutes?: number, subGoals?: SubGoal[]) => void }) {
  const [title, setTitle] = useState(initialGoal?.title ?? '');
  const [note, setNote] = useState(initialGoal?.note ?? '');

  const defaultLimitMins = initialGoal?.sessionLimitMinutes;
  const initialUnit = defaultLimitMins && defaultLimitMins % 60 === 0 && defaultLimitMins >= 60 ? 'hours' : 'minutes';
  const initialValue = defaultLimitMins
    ? (initialUnit === 'hours' ? String(defaultLimitMins / 60) : String(defaultLimitMins))
    : '';

  const [sessionLimitValue, setSessionLimitValue] = useState(initialValue);
  const [sessionLimitUnit, setSessionLimitUnit] = useState<'minutes' | 'hours'>(initialUnit);

  const [subGoals, setSubGoals] = useState<SubGoal[]>(initialGoal?.subGoals ?? []);
  const [subGoalInput, setSubGoalInput] = useState('');

  const canSubmit = title.trim().length > 1;

  function handleAddSubGoal() {
    const trimmed = subGoalInput.trim();
    if (!trimmed) return;
    setSubGoals((prev) => [
      ...prev,
      {
        id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: trimmed,
        completed: false,
      },
    ]);
    setSubGoalInput('');
  }

  function handleRemoveSubGoal(id: string) {
    setSubGoals((prev) => prev.filter((item) => item.id !== id));
  }

  function handleToggleSubGoalInForm(id: string) {
    setSubGoals((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    let limitMinutes: number | undefined;
    const parsed = parseFloat(sessionLimitValue);
    if (!isNaN(parsed) && parsed > 0) {
      limitMinutes = sessionLimitUnit === 'hours' ? Math.round(parsed * 60) : Math.round(parsed);
    }

    onSubmit(title.trim(), note.trim(), limitMinutes, subGoals);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-sidebar/50 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-card-border bg-card p-6 shadow-2xl rise-in dark:border-[#38587a] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="goal-form-title">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary dark:text-[#87CEEB]">{initialGoal ? 'Edit intention' : 'New intention'}</p>
            <h2 id="goal-form-title" className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl">{initialGoal ? 'Update your focus goal' : 'What would feel good to finish?'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close goal form" className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted dark:text-[#D1D5DB] dark:hover:bg-[#162235]" data-testid="button-close-goal-form"><X size={20} /></button>
        </div>
        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="goal-title" className="text-sm font-bold text-foreground dark:text-white">Goal name</label>
            <input id="goal-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Sketch the first page" className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-goal-title" />
          </div>
          <div>
            <label htmlFor="goal-note" className="text-sm font-bold text-foreground dark:text-white">A kind note <span className="font-normal text-muted-foreground dark:text-[#D1D5DB]">(optional)</span></label>
            <textarea id="goal-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why does this matter today?" rows={3} className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-goal-note" />
          </div>
          <div>
            <label htmlFor="goal-session-limit" className="text-sm font-bold text-foreground dark:text-white">Time to spend / Session duration <span className="font-normal text-muted-foreground dark:text-[#D1D5DB]">(optional)</span></label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="goal-session-limit"
                type="number"
                min="1"
                step="any"
                value={sessionLimitValue}
                onChange={(event) => setSessionLimitValue(event.target.value)}
                placeholder="e.g. 45"
                className="min-h-[44px] flex-1 rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
                data-testid="input-goal-session-limit"
              />
              <select
                value={sessionLimitUnit}
                onChange={(event) => setSessionLimitUnit(event.target.value as 'minutes' | 'hours')}
                className="min-h-[44px] rounded-xl border border-input bg-background px-3 py-3 text-base sm:text-sm font-bold text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
                data-testid="select-goal-session-limit-unit"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">Set a planned target time for each focus session.</p>
          </div>

          <div>
            <label htmlFor="goal-target-items-input" className="text-sm font-bold text-foreground dark:text-white">
              Target items <span className="font-normal text-muted-foreground dark:text-[#D1D5DB]">(optional)</span>
            </label>
            <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">
              Break this goal into smaller topics, tasks, or chapters.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="goal-target-items-input"
                value={subGoalInput}
                onChange={(event) => setSubGoalInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddSubGoal();
                  }
                }}
                placeholder="e.g. Functions, Loops, Practice problems"
                className="min-h-[44px] flex-1 rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
                data-testid="input-target-item"
              />
              <button
                type="button"
                onClick={handleAddSubGoal}
                disabled={!subGoalInput.trim()}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#5aaed6] px-4 py-3 text-xs font-bold text-[#173849] transition-all hover:bg-[#72bde0] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#87CEEB] dark:text-[#0a2533] dark:hover:bg-[#72c2e6]"
                data-testid="button-add-target-item"
              >
                <Plus size={16} /> Add
              </button>
            </div>

            {subGoals.length > 0 && (
              <ul className="mt-3 space-y-2 rounded-xl border border-border bg-background/50 p-3 dark:bg-[#162235]/60 dark:border-[#2d425c]" data-testid="list-target-items">
                {subGoals.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs font-medium text-foreground dark:border-[#2d425c] dark:bg-[#1f2d3d] dark:text-white"
                    data-testid={`target-item-${sub.id}`}
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={sub.completed}
                        onChange={() => handleToggleSubGoalInForm(sub.id)}
                        className="size-4 rounded border-gray-300 text-primary focus:ring-[#87CEEB]"
                        data-testid={`checkbox-target-item-${sub.id}`}
                      />
                      <span className={sub.completed ? 'line-through text-muted-foreground dark:text-slate-400' : ''}>
                        {sub.name}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubGoal(sub.id)}
                      title="Remove item"
                      className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive dark:text-slate-400 dark:hover:bg-[#2d425c]"
                      data-testid={`button-remove-target-item-${sub.id}`}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button type="submit" disabled={!canSubmit} className="mt-7 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#87CEEB] dark:text-[#0a2533] dark:hover:bg-[#72c2e6]" data-testid="button-submit-goal">{initialGoal ? 'Save changes' : 'Add to my list'} <ArrowRight size={16} /></button>
      </form>
    </div>
  );
}

function EventForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, datetime: string) => void }) {
  const [name, setName] = useState('');
  const [datetime, setDatetime] = useState('');
  const canSubmit = name.trim().length > 1 && datetime.length > 0;
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (canSubmit) onSubmit(name.trim(), datetime); }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-sidebar/50 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-[#b9ddeb] bg-card p-6 shadow-2xl rise-in dark:border-[#38587a] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="event-form-title">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">New countdown</p>
            <h2 id="event-form-title" className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl">What are you looking forward to?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close new event form" className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-[#eaf7fc] dark:text-[#D1D5DB] dark:hover:bg-[#162235]" data-testid="button-close-event-form"><X size={20} /></button>
        </div>
        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="event-name" className="text-sm font-bold text-foreground dark:text-white">Event name</label>
            <input id="event-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekend by the sea" className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-event-name" />
          </div>
          <div>
            <label htmlFor="event-datetime" className="text-sm font-bold text-foreground dark:text-white">Date and time</label>
            <input id="event-datetime" type="datetime-local" value={datetime} onChange={(event) => setDatetime(event.target.value)} className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-event-datetime" />
          </div>
        </div>
        <button type="submit" disabled={!canSubmit} className="mt-7 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-3 text-sm font-bold text-[#173849] dark:text-[#0a2533] transition-colors hover:bg-[#72bde0] dark:hover:bg-[#72c2e6] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-submit-event">Start the countdown <ArrowRight size={16} /></button>
      </form>
    </div>
  );
}

function LoggerGoalForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, targetHours: number, category: LoggerCategory) => void }) {
  const [name, setName] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [category, setCategory] = useState<LoggerCategory>('Study');
  const parsedHours = Number(targetHours);
  const canSubmit = name.trim().length > 1 && Number.isFinite(parsedHours) && parsedHours > 0;
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (canSubmit) onSubmit(name.trim(), parsedHours, category); }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-sidebar/50 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-[#b9ddeb] bg-card p-6 shadow-2xl rise-in dark:border-[#38587a] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="logger-goal-form-title">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">New timer goal</p>
            <h2 id="logger-goal-form-title" className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl">What do you want to put hours toward?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close new timer goal form" className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-[#eaf7fc] dark:text-[#D1D5DB] dark:hover:bg-[#162235]" data-testid="button-close-logger-goal-form"><X size={20} /></button>
        </div>
        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="logger-goal-name" className="text-sm font-bold text-foreground dark:text-white">Goal name</label>
            <input id="logger-goal-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Study Math" className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-logger-goal-name" />
          </div>
          <div>
            <label htmlFor="logger-target-hours" className="text-sm font-bold text-foreground dark:text-white">Target hours</label>
            <input id="logger-target-hours" type="number" inputMode="decimal" min="0.25" step="0.25" value={targetHours} onChange={(event) => setTargetHours(event.target.value)} placeholder="e.g. 150" className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-logger-target-hours" />
          </div>
          <div>
            <label htmlFor="logger-category" className="text-sm font-bold text-foreground dark:text-white">Category</label>
            <div className="relative mt-2">
              <select id="logger-category" value={category} onChange={(event) => setCategory(event.target.value as LoggerCategory)} className="min-h-[44px] w-full appearance-none rounded-xl border border-input bg-background px-4 py-3 pr-10 text-base sm:text-sm font-semibold text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c]" data-testid="select-logger-category">
                <option>Study</option>
                <option>Fitness</option>
                <option>Side Projects</option>
                <option>Other</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-muted-foreground dark:text-slate-400" size={17} />
            </div>
          </div>
        </div>
        <button type="submit" disabled={!canSubmit} className="mt-7 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-3 text-sm font-bold text-[#173849] dark:text-[#0a2533] transition-colors hover:bg-[#72bde0] dark:hover:bg-[#72c2e6] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-submit-logger-goal">Create timer goal <ArrowRight size={16} /></button>
      </form>
    </div>
  );
}

function DeleteDialog({ goal, onCancel, onConfirm }: { goal: Goal; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-sidebar/50 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
      <div className="w-full max-w-sm rounded-t-[2rem] border border-card-border bg-card p-6 shadow-2xl rise-in dark:border-[#38587a] sm:rounded-[1.5rem]" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
        <div className="grid size-11 place-items-center rounded-xl bg-[#f3dfd5] text-destructive dark:bg-[#4d2823] dark:text-[#f87171]"><Trash2 size={19} /></div>
        <h2 id="delete-title" className="mt-5 font-display text-2xl font-bold text-foreground dark:text-white">Let this one go?</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-[#D1D5DB]">“{goal.title}” and its time history will be removed from this page.</p>
        <div className="mt-7 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 min-h-[44px] rounded-xl border border-input px-4 py-3 text-sm font-bold text-foreground hover:bg-muted dark:text-white dark:border-[#2d425c] dark:hover:bg-[#162235]" data-testid="button-cancel-delete">Keep it</button>
          <button type="button" onClick={onConfirm} className="flex-1 min-h-[44px] rounded-xl bg-destructive px-4 py-3 text-sm font-bold text-destructive-foreground" data-testid="button-confirm-delete">Delete goal</button>
        </div>
      </div>
    </div>
  );
}

function HistoryLogModal({ sessions, onClose, onClearHistory }: { sessions: TimerSession[]; onClose: () => void; onClearHistory: () => void }) {
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [sessions]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-sidebar/45 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-[#b9ddeb] bg-card p-5 shadow-2xl rise-in dark:border-[#38587a] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="history-modal-title" data-testid="history-log-modal">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]"><History size={15} /> Your record</p>
            <h2 id="history-modal-title" className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-4xl">History Log</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-[#D1D5DB] sm:mt-2 sm:text-sm">A complete list of past timer sessions, ordered by most recent first.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close history log" className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[#eaf7fc] hover:text-[#2e7799] dark:text-[#D1D5DB] dark:hover:bg-[#162235] dark:hover:text-[#87CEEB]" data-testid="button-close-history"><X size={20} /></button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#dcecf3] pb-4 dark:border-[#38587a]">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground dark:text-[#D1D5DB]">{sortedSessions.length} {sortedSessions.length === 1 ? 'session' : 'sessions'} recorded</span>
          {sortedSessions.length > 0 && (
            <button type="button" onClick={() => setShowConfirmClear(true)} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3.5 py-1.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/20 dark:border-destructive/50 dark:bg-destructive/20 dark:text-[#f87171]" data-testid="button-clear-history"><Trash2 size={13} /> Clear History</button>
          )}
        </div>

        {showConfirmClear && (
          <div className="my-4 rounded-2xl border border-destructive/30 bg-[#fef2f2] p-4 rise-in dark:border-destructive/40 dark:bg-[#3b1719]" role="alertdialog">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive"><Trash2 size={17} /></div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-foreground dark:text-white">Wipe all session logs?</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground dark:text-[#D1D5DB]">This will permanently remove all {sortedSessions.length} recorded timer session logs. This action cannot be undone.</p>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => { onClearHistory(); setShowConfirmClear(false); }} className="rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5" data-testid="button-confirm-clear-history">Yes, clear history</button>
                  <button type="button" onClick={() => setShowConfirmClear(false)} className="rounded-xl border border-input bg-card px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted dark:text-white dark:border-[#2d425c]" data-testid="button-cancel-clear-history">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="app-scroll mt-4 max-h-[50vh] space-y-3 overflow-y-auto pr-1" data-testid="history-sessions-list">
          {sortedSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#b9ddeb] bg-[#eaf7fc]/50 px-6 py-12 text-center dark:border-[#38587a] dark:bg-[#162235]/50" data-testid="history-empty-state">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#c9ebf8] text-[#2e7799] dark:bg-[#283e52] dark:text-[#87CEEB]"><History size={22} /></div>
              <h3 className="mt-4 font-display text-xl font-bold text-foreground dark:text-white">No session logs yet</h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted-foreground dark:text-[#D1D5DB]">Completed timer sessions from your Goal Timer Logger will appear here.</p>
            </div>
          ) : (
            sortedSessions.map((session) => (
              <div key={session.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-[#dcecf3] bg-background/80 p-4 transition-all hover:border-[#5aaed6] hover:bg-background dark:border-[#38587a] dark:bg-[#162235] dark:hover:border-[#87CEEB]" data-testid={`history-item-${session.id}`}>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-display text-lg font-bold text-foreground dark:text-white" data-testid={`history-goal-name-${session.id}`}>{session.goalName}</h4>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]" data-testid={`history-date-${session.id}`}>{formatSessionDate(session.timestamp)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {session.plannedMinutes && session.plannedMinutes > 0 ? (
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground dark:bg-[#1f2d3d] dark:text-[#D1D5DB]" data-testid={`history-planned-${session.id}`}>
                      Target: {formatMinutes(session.plannedMinutes)}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf7fc] px-3 py-1.5 font-mono-d text-xs font-bold text-[#2e7799] dark:bg-[#1f2d3d] dark:text-[#87CEEB]" data-testid={`history-duration-${session.id}`}><Timer size={13} /> {formatDurationHM(session.durationSeconds)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function InstallPwaModal({ pwaState, onClose }: { pwaState: PWAState; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-sidebar/50 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-[#b9ddeb] bg-card p-6 shadow-2xl rise-in dark:border-[#38587a] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="pwa-modal-title" data-testid="pwa-install-modal">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-sidebar text-accent shadow-sm">
              <Smartphone size={22} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">Offline First</p>
              <h2 id="pwa-modal-title" className="font-display text-2xl font-bold text-foreground dark:text-white">PWA & Offline Guide</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close guide" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted dark:text-[#D1D5DB] dark:hover:bg-[#162235]" data-testid="button-close-pwa-modal"><X size={18} /></button>
        </div>

        <div className="mt-6 space-y-4 text-xs sm:text-sm">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={16} /> 100% Offline Capable
            </div>
            <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">
              Goal & Time Tracker caches all code, styles, and assets locally. Your goals, countdowns, timer sessions, and statistics remain accessible with zero internet connection.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-background p-4 dark:bg-[#162235]">
            <h3 className="flex items-center gap-2 font-bold text-foreground dark:text-white">
              <Download size={15} className="text-[#5aaed6]" /> How to install on your device:
            </h3>

            <div className="space-y-2.5 text-xs text-muted-foreground dark:text-[#D1D5DB]">
              <div className="flex items-start gap-2.5">
                <Laptop size={16} className="mt-0.5 shrink-0 text-foreground dark:text-white" />
                <div>
                  <strong className="text-foreground dark:text-white">Desktop (Chrome / Edge / Brave):</strong>
                  <p>Click the <strong>Install App</strong> button in the header, or click the install icon (+) in your browser address bar.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Smartphone size={16} className="mt-0.5 shrink-0 text-foreground dark:text-white" />
                <div>
                  <strong className="text-foreground dark:text-white">iOS Safari (iPhone / iPad):</strong>
                  <p>Tap the <strong>Share</strong> button, then scroll down and tap <strong>"Add to Home Screen"</strong>.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Smartphone size={16} className="mt-0.5 shrink-0 text-foreground dark:text-white" />
                <div>
                  <strong className="text-foreground dark:text-white">Android (Chrome / Firefox):</strong>
                  <p>Tap the 3 dots menu top-right, then select <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong>.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3 text-xs font-semibold dark:bg-[#1f2d3d]">
            <span>Service Worker: <strong className="text-emerald-600 dark:text-emerald-400">{pwaState.swRegistered ? 'Active & Registered' : 'Initializing'}</strong></span>
            <span>Network: <strong className={pwaState.isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{pwaState.isOnline ? '🟢 Connected' : '🔴 Offline Mode'}</strong></span>
          </div>
        </div>

        <div className="mt-6">
          {pwaState.isInstallable ? (
            <button type="button" onClick={() => { pwaManager.promptInstall(); onClose(); }} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-md transition-all hover:opacity-90 dark:bg-[#87CEEB] dark:text-[#0a2533]" data-testid="button-pwa-modal-install-now">
              <Download size={16} /> Install App Now
            </button>
          ) : (
            <button type="button" onClick={onClose} className="min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm font-bold text-foreground hover:bg-muted dark:bg-[#162235] dark:text-white dark:border-[#2d425c]" data-testid="button-pwa-modal-close">
              Close Guide
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;