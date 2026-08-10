import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import confetti from 'canvas-confetti';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  parseISO,
  isValid,
  subDays,
  addYears,
  addDays,
} from 'date-fns';
import { pwaManager, PWAState } from './pwaRegister';
import { backupToIndexedDB } from './lib/offlineDb';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Bookmark,
  Briefcase,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock3,
  Code,
  Coffee,
  Compass,
  Download,
  Dumbbell,
  Edit3,
  FileText,
  Flag,
  Folder,
  FolderKanban,
  FolderOpen,
  GripVertical,
  History,
  Flame,
  Laptop,
  Layers,
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
  Tag,
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
  Zap,
} from 'lucide-react';

type SubGoal = {
  id: string;
  name: string;
  type?: 'header' | 'subtopic';
  completed?: boolean;
  children?: SubGoal[];
};

export type GoalStreak = {
  count: number;
  lastDate: string | null;
  bestStreak: number;
  active: boolean;
};

type Goal = {
  id: string;
  title: string;
  note: string;
  minutes: number;
  createdAt: string;
  targetDate?: string;
  completed: boolean;
  color: 'terracotta' | 'sage' | 'ochre' | 'plum';
  sessionLimitMinutes?: number;
  subGoals?: SubGoal[];
  linkedGoalId?: string;
  streak?: GoalStreak;
};

type TimerState = {
  goalId: string | null;
  elapsed: number;
  startedAt: number | null;
};

export type RecurrenceType = 'none' | 'yearly' | 'monthly' | 'weekly';

type TrackerEvent = {
  id: string;
  name: string;
  datetime: string;
  createdAt: string;
  recurring?: boolean;
  recurrenceType?: RecurrenceType;
  nextOccurrence?: string;
};

type LoggerCategory = string;

type LoggerGoal = {
  id: string;
  name: string;
  targetHours: number;
  completedHours: number;
  category: LoggerCategory;
  createdAt: string;
  streak?: GoalStreak;
};

type LoggerTimerState = {
  goalId: string | null;
  startedAt: number | null;
  accumulatedSeconds: number;
  isPaused: boolean;
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

type DailyTaskItem = {
  taskId: string;
  title: string;
  completed: boolean;
  goalId?: string;
};

type DailyTasksMap = Record<string, DailyTaskItem[]>;

export function getGoalLoggedDates(
  goalId: string,
  goalName: string,
  linkedGoalId: string | undefined,
  timerSessions: TimerSession[],
  dailyTasks: DailyTasksMap
): Set<string> {
  const dates = new Set<string>();

  for (const session of timerSessions || []) {
    if (session.durationSeconds >= 60 && session.timestamp) {
      const matchId = session.goalId === goalId || (Boolean(linkedGoalId) && session.goalId === linkedGoalId);
      const matchName = Boolean(session.goalName && goalName && session.goalName.trim().toLowerCase() === goalName.trim().toLowerCase());
      if (matchId || matchName) {
        try {
          const d = new Date(session.timestamp);
          if (isValid(d)) {
            dates.add(format(d, 'yyyy-MM-dd'));
          }
        } catch (_) {}
      }
    }
  }

  if (dailyTasks) {
    Object.entries(dailyTasks).forEach(([dateStr, items]) => {
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.completed) {
            const matchId = item.goalId === goalId || (Boolean(linkedGoalId) && item.goalId === linkedGoalId);
            if (matchId) {
              dates.add(dateStr);
            }
          }
        }
      }
    });
  }

  return dates;
}

export function calculateStreakFromDates(dateSet: Set<string>, existingBest = 0): GoalStreak {
  if (!dateSet || dateSet.size === 0) {
    return { count: 0, lastDate: null, bestStreak: existingBest, active: false };
  }

  const sortedDates = Array.from(dateSet).sort();
  const lastDate = sortedDates[sortedDates.length - 1];

  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(now, 1), 'yyyy-MM-dd');

  const hasToday = dateSet.has(todayStr);
  const hasYesterday = dateSet.has(yesterdayStr);

  let active = false;
  let count = 0;

  if (hasToday) {
    active = true;
    let curr = new Date();
    while (dateSet.has(format(curr, 'yyyy-MM-dd'))) {
      count++;
      curr = subDays(curr, 1);
    }
  } else if (hasYesterday) {
    active = true;
    let curr = subDays(now, 1);
    while (dateSet.has(format(curr, 'yyyy-MM-dd'))) {
      count++;
      curr = subDays(curr, 1);
    }
  } else {
    active = false;
    count = 0;
  }

  let historicalMax = 0;
  let currentRun = 0;
  let prevDateMs: number | null = null;

  for (const dStr of sortedDates) {
    const d = parseISO(dStr);
    if (!isValid(d)) continue;
    const timeMs = d.getTime();

    if (prevDateMs === null) {
      currentRun = 1;
    } else {
      const diffDays = Math.round((timeMs - prevDateMs) / (1000 * 3600 * 24));
      if (diffDays === 1) {
        currentRun++;
      } else if (diffDays > 1) {
        currentRun = 1;
      }
    }
    if (currentRun > historicalMax) {
      historicalMax = currentRun;
    }
    prevDateMs = timeMs;
  }

  const bestStreak = Math.max(existingBest, historicalMax, count);

  return {
    count,
    lastDate,
    bestStreak,
    active,
  };
}

export function computeGoalStreak(
  goal: { id: string; name?: string; title?: string; linkedGoalId?: string; streak?: GoalStreak },
  timerSessions: TimerSession[],
  dailyTasks: DailyTasksMap
): GoalStreak {
  const name = goal.name || goal.title || '';
  const dates = getGoalLoggedDates(goal.id, name, goal.linkedGoalId, timerSessions, dailyTasks);
  return calculateStreakFromDates(dates, goal.streak?.bestStreak || 0);
}

export function computeCategoryStreak(
  categoryName: string,
  goalsInCategory: LoggerGoal[],
  timerSessions: TimerSession[],
  dailyTasks: DailyTasksMap
): GoalStreak {
  const categoryDates = new Set<string>();

  for (const g of goalsInCategory) {
    const dates = getGoalLoggedDates(g.id, g.name, undefined, timerSessions, dailyTasks);
    dates.forEach((d) => categoryDates.add(d));
  }

  for (const session of timerSessions || []) {
    if (session.durationSeconds >= 60 && session.timestamp) {
      const matchedGoal = goalsInCategory.find(
        (g) => g.id === session.goalId || (session.goalName && session.goalName.trim().toLowerCase() === g.name.trim().toLowerCase())
      );
      if (matchedGoal) {
        try {
          const d = new Date(session.timestamp);
          if (isValid(d)) {
            categoryDates.add(format(d, 'yyyy-MM-dd'));
          }
        } catch (_) {}
      }
    }
  }

  return calculateStreakFromDates(categoryDates);
}

export function getStreakEmojiAndMilestone(count: number, active: boolean) {
  if (!active || count === 0) {
    return { emoji: '🔴', text: '🔴 Streak broken', milestone: 'Reset', icon: '❄️' };
  }
  if (count >= 100) {
    return { emoji: '👑', text: '👑 100 day legend!', milestone: '100 Days', icon: '👑' };
  }
  if (count >= 60) {
    return { emoji: '⚡', text: '⚡ 60 days of mastery!', milestone: '60 Days', icon: '⚡' };
  }
  if (count >= 30) {
    return { emoji: '🏆', text: '🏆 Monthly streak!', milestone: 'Monthly', icon: '🏆' };
  }
  if (count >= 14) {
    return { emoji: '🔥🔥🔥', text: '🔥🔥🔥 Two weeks!', milestone: '2 Weeks', icon: '🔥' };
  }
  if (count >= 7) {
    return { emoji: '🔥🔥', text: '🔥🔥 Week streak!', milestone: '1 Week', icon: '🔥' };
  }
  if (count >= 3) {
    return { emoji: '🔥', text: '🔥 Getting started!', milestone: '3 Days', icon: '🔥' };
  }
  return { emoji: '🟢', text: '🟢 Active streak!', milestone: 'Active', icon: '🟢' };
}

export function StreakBadge({
  streak,
  goalName,
  onRecoverStreak,
}: {
  streak?: GoalStreak;
  goalName: string;
  onRecoverStreak?: () => void;
}) {
  if (!streak) return null;
  const { count, active, bestStreak, lastDate } = streak;
  const milestone = getStreakEmojiAndMilestone(count, active);

  return (
    <div
      className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 dark:border-amber-400/25 dark:bg-amber-400/10"
      data-testid={`streak-badge-${goalName.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{milestone.emoji}</span>
          <span className="font-mono-d text-xs font-extrabold text-amber-900 dark:text-amber-200" data-testid={`text-streak-count-${goalName.replace(/\s+/g, '-').toLowerCase()}`}>
            {count} {count === 1 ? 'day' : 'days'} streak
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              active
                ? 'bg-emerald-500/20 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-300'
                : 'bg-rose-500/20 text-rose-800 dark:bg-rose-400/20 dark:text-rose-300'
            }`}
            data-testid={`status-streak-active-${goalName.replace(/\s+/g, '-').toLowerCase()}`}
          >
            {active ? 'Active' : 'Broken'}
          </span>
        </div>

        <span className="text-[10px] font-bold text-amber-900/80 dark:text-amber-200/80">
          Best: <strong className="font-mono-d" data-testid={`text-streak-best-${goalName.replace(/\s+/g, '-').toLowerCase()}`}>{bestStreak}d</strong>
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-amber-900/90 dark:text-amber-200/90">
        <span className="font-medium italic">{milestone.text}</span>
        {!active && onRecoverStreak && (
          <button
            type="button"
            onClick={onRecoverStreak}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-amber-700 transition-colors dark:bg-amber-500 dark:hover:bg-amber-600"
            data-testid={`button-recover-streak-${goalName.replace(/\s+/g, '-').toLowerCase()}`}
            title="Recover broken streak (1 weekly streak freeze)"
          >
            🧊 Recover Streak
          </button>
        )}
      </div>
    </div>
  );
}

export function StreakCalendar({
  dateSet,
  daysCount = 7,
}: {
  dateSet: Set<string>;
  daysCount?: number;
}) {
  const now = new Date();
  const days = useMemo(() => {
    const list = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayLabel = format(d, 'E')[0]; // M, T, W...
      const formatted = format(d, 'MMM d, yyyy');
      const logged = dateSet.has(dateStr);
      list.push({ dateStr, dayLabel, formatted, logged, isToday: i === 0 });
    }
    return list;
  }, [dateSet, daysCount]);

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-background/50 p-2.5 dark:bg-[#162235]/60 dark:border-[#2d425c]">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground dark:text-[#D1D5DB]">
        <span>📅 Last {daysCount} Days Activity</span>
        <span className="font-mono-d text-emerald-600 dark:text-emerald-400">
          {days.filter((d) => d.logged).length}/{daysCount} logged
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-1">
        {days.map((day) => (
          <div key={day.dateStr} className="flex flex-col items-center gap-1" title={`${day.formatted}: ${day.logged ? 'Logged ✓' : 'No time logged'}`}>
            <div
              className={`size-3.5 rounded-full transition-all ${
                day.logged
                  ? 'bg-emerald-500 shadow-sm ring-2 ring-emerald-500/30'
                  : 'bg-muted dark:bg-slate-700'
              } ${day.isToday ? 'ring-2 ring-sky-500' : ''}`}
              data-testid={`streak-dot-${day.dateStr}`}
            />
            <span className="text-[9px] font-bold text-muted-foreground dark:text-[#D1D5DB]">{day.dayLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EditTargetHoursModal({
  goalTitle,
  currentHours,
  onClose,
  onSave,
}: {
  goalTitle: string;
  currentHours: number;
  onClose: () => void;
  onSave: (newHours: number) => void;
}) {
  const [val, setVal] = useState(String(currentHours));
  const parsed = parseFloat(val);
  const isValid = !isNaN(parsed) && parsed > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isValid) {
      onSave(parsed);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-sidebar/50 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-t-[2rem] border border-[#b9ddeb] bg-card p-6 shadow-2xl rise-in dark:border-[#38587a] sm:rounded-[1.5rem]" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">Target Adjustment</p>
            <h3 className="mt-1 font-display text-xl font-bold text-foreground dark:text-white">Edit Target Hours</h3>
            <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">“{goalTitle}” — existing completed hours will be preserved.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close edit target hours modal" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted dark:text-[#D1D5DB] dark:hover:bg-[#162235]">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5">
          <label htmlFor="edit-target-hours-input" className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-[#D1D5DB]">New Target Hours</label>
          <input
            id="edit-target-hours-input"
            type="number"
            step="0.25"
            min="0.25"
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-2.5 text-base sm:text-sm font-mono-d font-bold text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
            data-testid="input-edit-target-hours"
          />
        </div>

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-input px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted dark:text-white dark:border-[#2d425c]">Cancel</button>
          <button type="submit" disabled={!isValid} className="flex-1 min-h-[44px] rounded-xl bg-[#5aaed6] px-4 py-2.5 text-xs font-bold text-[#173849] hover:bg-[#72bde0] disabled:opacity-40 dark:bg-[#87CEEB] dark:text-[#0a2533]">Update Target</button>
        </div>
      </form>
    </div>
  );
}

const STORAGE_KEY = 'goal-time-tracker:v1';
const TIMER_KEY = 'goal-time-tracker:timer:v1';
const EVENTS_KEY = 'goal-time-tracker:events:v1';
const LOGGER_GOALS_KEY = 'goal-time-tracker:logger-goals:v1';
const LOGGER_TIMER_KEY = 'goal-time-tracker:logger-timer:v1';
const LOGGER_SESSIONS_KEY = 'goal-time-tracker:logger-sessions:v1';
const LOGGER_CATEGORIES_KEY = 'goal-time-tracker:categories:v1';
const DAILY_TASKS_KEY = 'goal-time-tracker:daily-tasks:v1';
const MAX_STREAK_KEY = 'goal-time-tracker:max-streak:v1';
const DEFAULT_CATEGORIES: string[] = ['Study', 'Fitness', 'Side Projects', 'Other'];
const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 180, 365];

const starterDailyTasks: DailyTasksMap = {
  [new Date().toISOString().slice(0, 10)]: [
    { taskId: 'int_123', title: 'Study Python Functions', completed: true, goalId: 'morning-pages' },
    { taskId: 'int_456', title: 'Review Bash Scripting Commands', completed: false, goalId: 'morning-pages' },
  ],
};

const starterGoals: Goal[] = [
  {
    id: 'morning-pages',
    title: 'Study Scripting Language',
    note: 'Master Python and Bash fundamentals step by step.',
    minutes: 38,
    createdAt: new Date().toISOString(),
    completed: false,
    color: 'terracotta',
    sessionLimitMinutes: 45,
    subGoals: [
      {
        id: 'item_1',
        type: 'header',
        name: 'Python',
        children: [
          { id: 'item_2', type: 'subtopic', name: 'Functions', completed: true },
          { id: 'item_3', type: 'subtopic', name: 'Loops', completed: false },
          { id: 'item_4', type: 'subtopic', name: 'Classes', completed: false },
        ],
      },
      {
        id: 'item_5',
        type: 'header',
        name: 'Bash',
        children: [
          { id: 'item_6', type: 'subtopic', name: 'Commands', completed: false },
          { id: 'item_7', type: 'subtopic', name: 'Scripting', completed: false },
          { id: 'item_8', type: 'subtopic', name: 'Variables', completed: false },
        ],
      },
    ],
  },
  { id: 'walk-by-water', title: 'Walk by the water', note: 'Twenty minutes without a podcast.', minutes: 20, createdAt: new Date(Date.now() - 86400000).toISOString(), completed: true, color: 'sage', sessionLimitMinutes: 20 },
  { id: 'read-chapter', title: 'Read one chapter', note: 'The book on the bedside table.', minutes: 47, createdAt: new Date(Date.now() - 172800000).toISOString(), completed: false, color: 'ochre', sessionLimitMinutes: 30 },
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

type CategoryStyle = { icon: typeof BookOpen; soft: string; ink: string; darkSoft: string; darkInk: string };

const defaultCategoryStyles: Record<string, CategoryStyle> = {
  Study: { icon: BookOpen, soft: 'bg-[#e4e0f4]', ink: 'text-[#685b99]', darkSoft: 'dark:bg-[#3b365a]', darkInk: 'dark:text-[#d5ccff]' },
  Fitness: { icon: Dumbbell, soft: 'bg-[#e2eadc]', ink: 'text-[#55734d]', darkSoft: 'dark:bg-[#304830]', darkInk: 'dark:text-[#b8d8ae]' },
  'Side Projects': { icon: FolderKanban, soft: 'bg-[#f3dfd5]', ink: 'text-[#96482f]', darkSoft: 'dark:bg-[#56372d]', darkInk: 'dark:text-[#f2b9a4]' },
  Other: { icon: Sparkles, soft: 'bg-[#f4e8c9]', ink: 'text-[#946c1d]', darkSoft: 'dark:bg-[#56461e]', darkInk: 'dark:text-[#f3d98b]' },
};

const customCategoryPalette: CategoryStyle[] = [
  { icon: Tag, soft: 'bg-[#dcecf3]', ink: 'text-[#2e7799]', darkSoft: 'dark:bg-[#1f3b4d]', darkInk: 'dark:text-[#87CEEB]' },
  { icon: Compass, soft: 'bg-[#e4e0f4]', ink: 'text-[#5c4f8a]', darkSoft: 'dark:bg-[#322c52]', darkInk: 'dark:text-[#c4b8f3]' },
  { icon: Layers, soft: 'bg-[#e2eadc]', ink: 'text-[#486341]', darkSoft: 'dark:bg-[#283e28]', darkInk: 'dark:text-[#a1cb96]' },
  { icon: Bookmark, soft: 'bg-[#f3dfd5]', ink: 'text-[#853e28]', darkSoft: 'dark:bg-[#4a2e25]', darkInk: 'dark:text-[#e8a38d]' },
  { icon: Target, soft: 'bg-[#f4e8c9]', ink: 'text-[#825c14]', darkSoft: 'dark:bg-[#463817]', darkInk: 'dark:text-[#e5c26b]' },
  { icon: Briefcase, soft: 'bg-[#e0f2f1]', ink: 'text-[#00695c]', darkSoft: 'dark:bg-[#133d37]', darkInk: 'dark:text-[#80cbc4]' },
  { icon: Award, soft: 'bg-[#fce4ec]', ink: 'text-[#880e4f]', darkSoft: 'dark:bg-[#4a1c31]', darkInk: 'dark:text-[#f48fb1]' },
  { icon: Zap, soft: 'bg-[#fff8e1]', ink: 'text-[#f57f17]', darkSoft: 'dark:bg-[#4a3e14]', darkInk: 'dark:text-[#ffe082]' },
];

function getCategoryStyle(categoryName: string): CategoryStyle {
  if (!categoryName) return customCategoryPalette[0];
  if (defaultCategoryStyles[categoryName]) {
    return defaultCategoryStyles[categoryName];
  }
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % customCategoryPalette.length;
  return customCategoryPalette[index];
}

function parseEventDateTime(datetime: string): number {
  if (!datetime) return NaN;
  if (/^\d+$/.test(datetime)) return Number(datetime);

  const timestamp = new Date(datetime).getTime();
  if (!Number.isNaN(timestamp)) return timestamp;

  const parts = datetime.split(/[-T :]/);
  if (parts.length >= 5) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const hours = parseInt(parts[3], 10);
    const minutes = parseInt(parts[4], 10);
    const seconds = parts[5] ? parseInt(parts[5], 10) : 0;
    return new Date(year, month, day, hours, minutes, seconds).getTime();
  }

  return NaN;
}

function getNextOccurrence(datetimeStr: string, recurrenceType?: RecurrenceType): Date {
  let targetDate = parseISO(datetimeStr);
  if (!isValid(targetDate)) {
    const ms = parseEventDateTime(datetimeStr);
    targetDate = new Date(ms);
  }
  if (!isValid(targetDate)) return new Date();

  const now = new Date();
  if (targetDate > now) {
    return targetDate;
  }

  if (!recurrenceType || recurrenceType === 'none') {
    return targetDate;
  }

  // Continuously advance until future date is reached
  while (targetDate <= now) {
    if (recurrenceType === 'yearly') {
      targetDate = addYears(targetDate, 1);
    } else if (recurrenceType === 'monthly') {
      targetDate = addMonths(targetDate, 1);
    } else if (recurrenceType === 'weekly') {
      targetDate = addDays(targetDate, 7);
    } else {
      break;
    }
  }
  return targetDate;
}

function formatEventDate(datetime: string) {
  const timestamp = parseEventDateTime(datetime);
  if (Number.isNaN(timestamp)) return 'Date not set';
  const date = new Date(timestamp);
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
  const targetTime = parseEventDateTime(datetime);
  if (Number.isNaN(targetTime)) return null;

  const difference = targetTime - now;
  if (difference <= 0) return null;

  const totalSeconds = Math.floor(difference / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function App() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [loggerGoals, setLoggerGoals] = useState<LoggerGoal[]>([]);
  const [loggerTimer, setLoggerTimer] = useState<LoggerTimerState>({ goalId: null, startedAt: null, accumulatedSeconds: 0, isPaused: false });
  const [timerSessions, setTimerSessions] = useState<TimerSession[]>([]);
  const [timer, setTimer] = useState<TimerState>({ goalId: null, elapsed: 0, startedAt: null });
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editingLoggerGoalForTarget, setEditingLoggerGoalForTarget] = useState<LoggerGoal | null>(null);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TrackerEvent | null>(null);
  const [isLoggerGoalFormOpen, setIsLoggerGoalFormOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
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

  // History Tab Selective Management State
  const [tabHistorySearch, setTabHistorySearch] = useState('');
  const [tabHistorySort, setTabHistorySort] = useState<'newest' | 'oldest' | 'longest' | 'shortest'>('newest');
  const [tabHistorySelectedIds, setTabHistorySelectedIds] = useState<string[]>([]);
  const [tabSessionToDelete, setTabSessionToDelete] = useState<TimerSession | null>(null);
  const [showConfirmTabBatch, setShowConfirmTabBatch] = useState(false);
  const [showConfirmTabClear, setShowConfirmTabClear] = useState(false);

  // Daily Calendar Tasks & Streak Record State
  const [dailyTasks, setDailyTasks] = useState<DailyTasksMap>({});
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => new Date());
  const [calendarNewTaskInput, setCalendarNewTaskInput] = useState('');
  const [calendarSelectedGoalId, setCalendarSelectedGoalId] = useState('');
  const [maxStreakRecord, setMaxStreakRecord] = useState<number>(0);
  const prevStreakRef = useRef<number | null>(null);

  const activeTab = useMemo(() => {
    if (location === '/calendar') return 'calendar';
    if (location === '/countdowns') return 'countdowns';
    if (location === '/stats') return 'stats';
    if (location === '/history') return 'history';
    return 'goals';
  }, [location]);

  const dailyStreak = useMemo(() => {
    const activeDates = new Set<string>();

    Object.entries(dailyTasks).forEach(([dateStr, items]) => {
      if (Array.isArray(items) && items.some((item) => item.completed)) {
        activeDates.add(dateStr);
      }
    });

    timerSessions.forEach((session) => {
      if (session.timestamp) {
        try {
          const d = new Date(session.timestamp);
          if (isValid(d)) {
            activeDates.add(format(d, 'yyyy-MM-dd'));
          }
        } catch (_) {}
      }
    });

    goals.forEach((goal) => {
      if (goal.completed && goal.targetDate) {
        activeDates.add(goal.targetDate);
      }
    });

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    let checkDate = now;
    let streak = 0;

    if (activeDates.has(todayStr)) {
      while (activeDates.has(format(checkDate, 'yyyy-MM-dd'))) {
        streak++;
        checkDate = subDays(checkDate, 1);
      }
    } else {
      checkDate = subDays(now, 1);
      while (activeDates.has(format(checkDate, 'yyyy-MM-dd'))) {
        streak++;
        checkDate = subDays(checkDate, 1);
      }
    }

    return streak;
  }, [dailyTasks, timerSessions, goals]);

  const streakMilestoneInfo = useMemo(() => {
    const nextMilestone = STREAK_MILESTONES.find((m) => m > dailyStreak) || Math.ceil((dailyStreak + 1) / 50) * 50;
    const prevMilestone = [...STREAK_MILESTONES].reverse().find((m) => m <= dailyStreak) || 0;
    const range = nextMilestone - prevMilestone;
    const progressInRange = dailyStreak - prevMilestone;
    const streakProgressPct = Math.min(100, Math.max(0, Math.round((progressInRange / range) * 100)));

    return {
      nextMilestone,
      prevMilestone,
      streakProgressPct,
    };
  }, [dailyStreak]);

  useEffect(() => {
    if (!hydrated) return;

    if (prevStreakRef.current === null) {
      prevStreakRef.current = dailyStreak;
      if (dailyStreak > maxStreakRecord) {
        setMaxStreakRecord(dailyStreak);
        try {
          window.localStorage.setItem(MAX_STREAK_KEY, JSON.stringify(dailyStreak));
        } catch (_) {}
      }
      return;
    }

    if (dailyStreak > maxStreakRecord) {
      setMaxStreakRecord(dailyStreak);
      try {
        window.localStorage.setItem(MAX_STREAK_KEY, JSON.stringify(dailyStreak));
      } catch (_) {}

      playSound('victory', soundEnabled);
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
        colors: ['#f97316', '#ef4444', '#eab308', '#ff4500', '#fbbf24'],
      });
      setCelebration(`🔥 NEW STREAK RECORD! You reached a ${dailyStreak}-day streak! Keep the fire burning! 🔥`);
      window.setTimeout(() => setCelebration(''), 4500);
    }

    prevStreakRef.current = dailyStreak;
  }, [dailyStreak, maxStreakRecord, hydrated, soundEnabled]);

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
    const savedCategories = readJson<string[]>(LOGGER_CATEGORIES_KEY, DEFAULT_CATEGORIES);
    const savedGoals = readJson<Goal[]>(STORAGE_KEY, starterGoals);
    const savedTimer = readJson<TimerState>(TIMER_KEY, { goalId: null, elapsed: 0, startedAt: null });
    const savedEvents = readJson<TrackerEvent[]>(EVENTS_KEY, []);
    const savedLoggerGoals = readJson<LoggerGoal[]>(LOGGER_GOALS_KEY, []);
    const savedLoggerTimer = readJson<LoggerTimerState>(LOGGER_TIMER_KEY, { goalId: null, startedAt: null, accumulatedSeconds: 0, isPaused: false });
    const savedTimerSessions = readJson<TimerSession[]>(LOGGER_SESSIONS_KEY, []);
    const savedDailyTasks = readJson<DailyTasksMap>(DAILY_TASKS_KEY, starterDailyTasks);
    const savedMaxStreak = readJson<number>(MAX_STREAK_KEY, 0);
    
    const initialCategories = Array.isArray(savedCategories) && savedCategories.length > 0 ? savedCategories : DEFAULT_CATEGORIES;
    const goalCategories = (Array.isArray(savedLoggerGoals) ? savedLoggerGoals : []).map((g) => g.category).filter(Boolean);
    const mergedCategories = Array.from(new Set([...initialCategories, ...goalCategories]));

    setCategories(mergedCategories);
    setGoals(Array.isArray(savedGoals) ? savedGoals : starterGoals);
    setTimer(savedTimer);
    setEvents(Array.isArray(savedEvents) ? savedEvents : []);
    setLoggerGoals(Array.isArray(savedLoggerGoals) ? savedLoggerGoals : []);
    setLoggerTimer({
      goalId: savedLoggerTimer?.goalId ?? null,
      startedAt: savedLoggerTimer?.startedAt ?? null,
      accumulatedSeconds: savedLoggerTimer?.accumulatedSeconds ?? 0,
      isPaused: savedLoggerTimer?.isPaused ?? false,
    });
    setTimerSessions(Array.isArray(savedTimerSessions) ? savedTimerSessions : []);
    setDailyTasks(savedDailyTasks && Object.keys(savedDailyTasks).length > 0 ? savedDailyTasks : starterDailyTasks);
    setMaxStreakRecord(typeof savedMaxStreak === 'number' ? savedMaxStreak : 0);
    setSelectedGoalId(savedTimer.goalId ?? savedGoals.find((goal) => !goal.completed)?.id ?? null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LOGGER_CATEGORIES_KEY, JSON.stringify(categories));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
      window.localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
      window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      window.localStorage.setItem(LOGGER_GOALS_KEY, JSON.stringify(loggerGoals));
      window.localStorage.setItem(LOGGER_TIMER_KEY, JSON.stringify(loggerTimer));
      window.localStorage.setItem(LOGGER_SESSIONS_KEY, JSON.stringify(timerSessions));
      window.localStorage.setItem(DAILY_TASKS_KEY, JSON.stringify(dailyTasks));
      setStorageError(false);

      // IndexedDB offline persistence backup
      backupToIndexedDB('goals', goals);
      backupToIndexedDB('events', events);
      backupToIndexedDB('timerSessions', timerSessions);
      backupToIndexedDB('timer', timer);
      backupToIndexedDB('dailyTasks', dailyTasks);
    } catch {
      setStorageError(true);
    }
  }, [categories, dailyTasks, events, goals, loggerGoals, loggerTimer, timer, timerSessions, hydrated]);

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
  const loggerElapsedSeconds = useMemo(() => {
    if (!loggerTimer.goalId) return 0;
    const currentSegment = loggerTimer.startedAt ? Math.max(0, Math.floor((now - loggerTimer.startedAt) / 1000)) : 0;
    return (loggerTimer.accumulatedSeconds || 0) + currentSegment;
  }, [loggerTimer, now]);
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

  const loggerGoalsWithStreaks = useMemo(() => {
    return loggerGoals.map((goal) => ({
      ...goal,
      streak: computeGoalStreak(goal, timerSessions, dailyTasks),
    }));
  }, [loggerGoals, timerSessions, dailyTasks]);

  const goalsWithStreaks = useMemo(() => {
    return goals.map((goal) => ({
      ...goal,
      streak: computeGoalStreak(goal, timerSessions, dailyTasks),
    }));
  }, [goals, timerSessions, dailyTasks]);

  const filteredLoggerGoals = useMemo(() => {
    let list = loggerGoalsWithStreaks.filter((g) =>
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
  }, [loggerGoalsWithStreaks, searchQuery, sortBy]);

  const allCategories = useMemo(() => {
    const set = new Set([...categories]);
    loggerGoals.forEach((g) => {
      if (g.category) set.add(g.category);
    });
    return Array.from(set);
  }, [categories, loggerGoals]);

  const displayedCategories = useMemo(() => {
    if (selectedCategoryFilter === 'All') return allCategories;
    return allCategories.filter((cat) => cat === selectedCategoryFilter);
  }, [allCategories, selectedCategoryFilter]);

  const loggerGoalsByCategory = useMemo(() => {
    return allCategories.reduce<Record<string, LoggerGoal[]>>((groups, category) => {
      groups[category] = filteredLoggerGoals.filter((goal) => goal.category === category);
      return groups;
    }, {});
  }, [allCategories, filteredLoggerGoals]);

  function addCategory(categoryName: string) {
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    setCategories((current) => {
      if (current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return current;
      return [...current, trimmed];
    });
    setCelebration(`Category "${trimmed}" created!`);
    window.setTimeout(() => setCelebration(''), 2500);
  }

  function renameCategory(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    setCategories((current) => current.map((c) => c === oldName ? trimmed : c));
    setLoggerGoals((current) => current.map((g) => g.category === oldName ? { ...g, category: trimmed } : g));
    if (selectedCategoryFilter === oldName) {
      setSelectedCategoryFilter(trimmed);
    }
    setCelebration(`Category renamed to "${trimmed}".`);
    window.setTimeout(() => setCelebration(''), 2500);
  }

  function deleteCategory(categoryName: string) {
    const count = loggerGoals.filter((g) => g.category === categoryName).length;
    if (count > 0) {
      setCelebration(`Cannot delete category "${categoryName}" while used by ${count} goal(s).`);
      window.setTimeout(() => setCelebration(''), 3000);
      return;
    }
    setCategories((current) => current.filter((c) => c !== categoryName));
    if (selectedCategoryFilter === categoryName) {
      setSelectedCategoryFilter('All');
    }
    setCelebration(`Category "${categoryName}" removed.`);
    window.setTimeout(() => setCelebration(''), 2500);
  }

  function exportData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      categories,
      goals,
      events,
      loggerGoals,
      timerSessions,
      dailyTasks,
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
          if (Array.isArray(parsed.categories)) setCategories(parsed.categories);
          if (Array.isArray(parsed.goals)) setGoals(parsed.goals);
          if (Array.isArray(parsed.events)) setEvents(parsed.events);
          if (Array.isArray(parsed.loggerGoals)) setLoggerGoals(parsed.loggerGoals);
          if (Array.isArray(parsed.timerSessions)) setTimerSessions(parsed.timerSessions);
          if (parsed.dailyTasks && typeof parsed.dailyTasks === 'object') setDailyTasks(parsed.dailyTasks);
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
    if (event.target) event.target.value = '';
  }

  // Daily Calendar Task Helpers
  function handleAddTaskToDate(dateStr: string, title: string, goalId?: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const newItem: DailyTaskItem = {
      taskId: `int_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: trimmed,
      completed: false,
      goalId,
    };
    setDailyTasks((current) => ({
      ...current,
      [dateStr]: [...(current[dateStr] || []), newItem],
    }));
    setCalendarNewTaskInput('');
    setCelebration(`Task added to ${dateStr}!`);
    window.setTimeout(() => setCelebration(''), 2200);
  }

  function handleToggleTaskOnDate(dateStr: string, taskId: string) {
    setDailyTasks((current) => {
      const list = current[dateStr] || [];
      const updated = list.map((item) => {
        if (item.taskId === taskId) {
          const nextCompleted = !item.completed;
          if (item.goalId) {
            setGoals((gList) => gList.map((g) => g.id === item.goalId ? { ...g, completed: nextCompleted } : g));
          }
          return { ...item, completed: nextCompleted };
        }
        return item;
      });
      return { ...current, [dateStr]: updated };
    });
  }

  function handleRemoveTaskFromDate(dateStr: string, taskId: string) {
    setDailyTasks((current) => {
      const list = current[dateStr] || [];
      return { ...current, [dateStr]: list.filter((item) => item.taskId !== taskId) };
    });
    setCelebration('Task removed from calendar.');
    window.setTimeout(() => setCelebration(''), 2000);
  }

  function handleAssignGoalToDate(goalId: string, dateStr: string) {
    const targetGoal = goals.find((g) => g.id === goalId);
    if (!targetGoal) return;
    setGoals((gList) => gList.map((g) => g.id === goalId ? { ...g, targetDate: dateStr } : g));
    const existingTasks = dailyTasks[dateStr] || [];
    if (!existingTasks.some((t) => t.taskId === goalId || t.goalId === goalId)) {
      const newDailyTask: DailyTaskItem = {
        taskId: targetGoal.id,
        title: targetGoal.title,
        completed: targetGoal.completed,
        goalId: targetGoal.id,
      };
      setDailyTasks((current) => ({
        ...current,
        [dateStr]: [...(current[dateStr] || []), newDailyTask],
      }));
    }
    setCalendarSelectedGoalId('');
    setCelebration(`Goal "${targetGoal.title}" assigned to ${dateStr}!`);
    window.setTimeout(() => setCelebration(''), 2500);
  }

  function addGoal(title: string, note: string, sessionLimitMinutes?: number, subGoals?: SubGoal[], linkedGoalId?: string, targetDate?: string) {
    const palette: Goal['color'][] = ['terracotta', 'sage', 'ochre', 'plum'];
    const newGoal: Goal = {
      id: `int_${Date.now()}`,
      title,
      note: note || 'A small promise to keep today.',
      minutes: 0,
      createdAt: new Date().toISOString(),
      targetDate: targetDate || undefined,
      completed: false,
      color: palette[goals.length % palette.length],
      sessionLimitMinutes,
      subGoals: subGoals && subGoals.length > 0 ? subGoals : undefined,
      linkedGoalId,
    };
    setGoals((current) => [newGoal, ...current]);
    setSelectedGoalId(newGoal.id);
    setIsGoalFormOpen(false);
    setEditingGoal(null);
    playSound('start', soundEnabled);
    setCelebration('A new intention is on the page.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function updateGoal(id: string, title: string, note: string, sessionLimitMinutes?: number, subGoals?: SubGoal[], linkedGoalId?: string, targetDate?: string) {
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, title, note: note || 'A small promise to keep today.', sessionLimitMinutes, subGoals: subGoals && subGoals.length > 0 ? subGoals : undefined, linkedGoalId, targetDate: targetDate || undefined } : goal));
    setIsGoalFormOpen(false);
    setEditingGoal(null);
    playSound('start', soundEnabled);
    setCelebration('Intention updated successfully.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function toggleSubGoalInTree(items: SubGoal[], subGoalId: string): SubGoal[] {
    return items.map((item) => {
      if (item.id === subGoalId) {
        return { ...item, completed: !item.completed };
      }
      if (item.children && item.children.length > 0) {
        return {
          ...item,
          children: toggleSubGoalInTree(item.children, subGoalId),
        };
      }
      return item;
    });
  }

  function toggleSubGoal(goalId: string, subGoalId: string) {
    setGoals((current) =>
      current.map((goal) => {
        if (goal.id !== goalId) return goal;
        const updatedSubGoals = toggleSubGoalInTree(goal.subGoals || [], subGoalId);
        return { ...goal, subGoals: updatedSubGoals };
      })
    );
  }

  function toggleComplete(goalId: string) {
    const goal = goals.find((item) => item.id === goalId);
    setGoals((current) => current.map((g) => g.id === goalId ? { ...g, completed: !g.completed } : g));
    if (goal && !goal.completed) {
      if (goal.linkedGoalId) {
        const hoursToAdd = (goal.sessionLimitMinutes || 60) / 60;
        setLoggerGoals((current) =>
          current.map((lg) => {
            if (lg.id === goal.linkedGoalId) {
              return { ...lg, completedHours: lg.completedHours + hoursToAdd };
            }
            return lg;
          })
        );
      }
      playSound('victory', soundEnabled);
      confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
      const linkedGoal = loggerGoals.find((lg) => lg.id === goal?.linkedGoalId);
      if (linkedGoal) {
        const hoursToAdd = (goal.sessionLimitMinutes || 60) / 60;
        const newCompletedHours = linkedGoal.completedHours + hoursToAdd;
        const percent = linkedGoal.targetHours > 0 ? Math.min(100, Math.round((newCompletedHours / linkedGoal.targetHours) * 100)) : 0;
        setCelebration(`Goal achieved! Added to ${linkedGoal.name}. Progress: ${formatLoggerHours(newCompletedHours)} / ${formatLoggerHours(linkedGoal.targetHours)} hours (${percent}%) 🎉`);
      } else {
        setCelebration('Goal achieved! 🎉 Keep the momentum going.');
      }
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
      const addedHours = elapsedSecs / 3600;

      setGoals((current) => current.map((g) => g.id === selectedGoal.id ? { ...g, minutes: g.minutes + addedMinutes } : g));

      if (selectedGoal.linkedGoalId) {
        setLoggerGoals((current) =>
          current.map((lg) => {
            if (lg.id === selectedGoal.linkedGoalId) {
              return { ...lg, completedHours: lg.completedHours + addedHours };
            }
            return lg;
          })
        );
      }

      setTimerSessions((current) => [{
        id: `${Date.now()}`,
        goalId: selectedGoal.id,
        goalName: selectedGoal.title,
        durationSeconds: elapsedSecs,
        durationHours: elapsedSecs / 3600,
        timestamp: new Date().toISOString(),
        plannedMinutes: selectedGoal.sessionLimitMinutes,
      }, ...current]);

      const linkedGoal = loggerGoals.find((lg) => lg.id === selectedGoal.linkedGoalId);
      const limitSecs = (selectedGoal.sessionLimitMinutes || 0) * 60;
      if (linkedGoal) {
        const updatedHours = linkedGoal.completedHours + addedHours;
        const pct = linkedGoal.targetHours > 0 ? Math.min(100, Math.round((updatedHours / linkedGoal.targetHours) * 100)) : 0;
        setCelebration(`Logged ${addedMinutes}m! Progress for ${linkedGoal.name}: ${formatLoggerHours(updatedHours)} / ${formatLoggerHours(linkedGoal.targetHours)} hours (${pct}%)`);
      } else if (limitSecs > 0) {
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

  function addEvent(name: string, datetime: string, recurring?: boolean, recurrenceType?: RecurrenceType) {
    const nextOccurrence = recurring && recurrenceType && recurrenceType !== 'none'
      ? getNextOccurrence(datetime, recurrenceType).toISOString()
      : undefined;

    const newEvent: TrackerEvent = {
      id: `${Date.now()}`,
      name,
      datetime,
      createdAt: new Date().toISOString(),
      recurring,
      recurrenceType: recurring ? recurrenceType : 'none',
      nextOccurrence,
    };
    setEvents((current) => [...current, newEvent].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()));
    setIsEventFormOpen(false);
    setEditingEvent(null);
    playSound('start', soundEnabled);
    setCelebration('Your event is on the horizon.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function updateEvent(id: string, name: string, datetime: string, recurring?: boolean, recurrenceType?: RecurrenceType) {
    const nextOccurrence = recurring && recurrenceType && recurrenceType !== 'none'
      ? getNextOccurrence(datetime, recurrenceType).toISOString()
      : undefined;

    setEvents((current) =>
      current
        .map((ev) =>
          ev.id === id
            ? {
                ...ev,
                name,
                datetime,
                recurring,
                recurrenceType: recurring ? recurrenceType : 'none',
                nextOccurrence,
              }
            : ev
        )
        .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
    );
    setIsEventFormOpen(false);
    setEditingEvent(null);
    playSound('victory', soundEnabled);
    setCelebration(`Event "${name}" updated!`);
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function removeEvent(eventId: string) {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  }

  function editLoggerGoalTargetHours(goalId: string, newTarget: number) {
    const goal = loggerGoals.find((g) => g.id === goalId);
    if (!goal) return;
    if (newTarget < goal.completedHours) {
      setCelebration('Target must be greater than completed hours!');
      window.setTimeout(() => setCelebration(''), 2800);
      return;
    }
    setLoggerGoals((current) =>
      current.map((g) => (g.id === goalId ? { ...g, targetHours: newTarget } : g))
    );
    playSound('victory', soundEnabled);
    setCelebration(`Target for "${goal.name}" updated to ${newTarget} hrs. Completed progress preserved! 🎉`);
    window.setTimeout(() => setCelebration(''), 3000);
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
      setCelebration('Stop or finish the current active timer session before starting another.');
      window.setTimeout(() => setCelebration(''), 2600);
      return;
    }
    playSound('start', soundEnabled);
    setLoggerTimer({
      goalId,
      startedAt: Date.now(),
      accumulatedSeconds: 0,
      isPaused: false,
    });
  }

  function pauseLoggerTimer() {
    if (!loggerTimer.goalId || loggerTimer.isPaused) return;
    playSound('stop', soundEnabled);
    const segmentSeconds = loggerTimer.startedAt ? Math.max(0, Math.floor((Date.now() - loggerTimer.startedAt) / 1000)) : 0;
    const newAccumulated = (loggerTimer.accumulatedSeconds || 0) + segmentSeconds;
    setLoggerTimer({
      goalId: loggerTimer.goalId,
      startedAt: null,
      accumulatedSeconds: newAccumulated,
      isPaused: true,
    });
    const goal = loggerGoals.find((item) => item.id === loggerTimer.goalId);
    setCelebration(goal ? `Timer paused for ${goal.name}.` : 'Timer paused.');
    window.setTimeout(() => setCelebration(''), 2500);
  }

  function resumeLoggerTimer() {
    if (!loggerTimer.goalId || !loggerTimer.isPaused) return;
    playSound('start', soundEnabled);
    setLoggerTimer({
      goalId: loggerTimer.goalId,
      startedAt: Date.now(),
      accumulatedSeconds: loggerTimer.accumulatedSeconds || 0,
      isPaused: false,
    });
    const goal = loggerGoals.find((item) => item.id === loggerTimer.goalId);
    setCelebration(goal ? `Timer resumed for ${goal.name}.` : 'Timer resumed.');
    window.setTimeout(() => setCelebration(''), 2500);
  }

  function stopLoggerTimer() {
    if (!loggerTimer.goalId) return;
    const segmentSeconds = loggerTimer.startedAt ? Math.max(0, Math.floor((Date.now() - loggerTimer.startedAt) / 1000)) : 0;
    const durationSeconds = (loggerTimer.accumulatedSeconds || 0) + segmentSeconds;
    const goal = loggerGoals.find((item) => item.id === loggerTimer.goalId);
    if (!goal) {
      setLoggerTimer({ goalId: null, startedAt: null, accumulatedSeconds: 0, isPaused: false });
      return;
    }
    const durationHours = durationSeconds / 3600;
    const newCompletedHours = goal.completedHours + durationHours;
    const hit100 = goal.targetHours > 0 && goal.completedHours < goal.targetHours && newCompletedHours >= goal.targetHours;

    setLoggerGoals((current) => current.map((item) => item.id === goal.id ? { ...item, completedHours: newCompletedHours } : item));
    if (durationSeconds > 0) {
      setTimerSessions((current) => [{
        id: `${Date.now()}`,
        goalId: goal.id,
        goalName: goal.name,
        durationSeconds,
        durationHours,
        timestamp: new Date().toISOString(),
      }, ...current]);
    }
    setLoggerTimer({ goalId: null, startedAt: null, accumulatedSeconds: 0, isPaused: false });

    if (hit100) {
      playSound('victory', soundEnabled);
      confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      setCelebration(`🎉 Goal Achieved! You reached ${goal.targetHours}h for ${goal.name}!`);
    } else {
      playSound('stop', soundEnabled);
      setCelebration(durationSeconds > 0 ? `${formatLoggerHours(durationHours)} logged for ${goal.name}.` : 'Session stopped without logging.');
    }
    window.setTimeout(() => setCelebration(''), 3000);
  }

  function removeLoggerGoal(goalId: string) {
    if (loggerTimer.goalId === goalId) {
      setLoggerTimer({ goalId: null, startedAt: null, accumulatedSeconds: 0, isPaused: false });
    }
    setLoggerGoals((current) => current.filter((goal) => goal.id !== goalId));
    setCelebration('The timer goal was removed. Its session history is still here.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  function resetLoggerProgress(goalId: string) {
    setLoggerGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, completedHours: 0 } : goal));
    setCelebration('Progress reset. Your session history is unchanged.');
    window.setTimeout(() => setCelebration(''), 2600);
  }

  const filteredTabSessions = useMemo(() => {
    let result = timerSessions.filter((s) =>
      s.goalName.toLowerCase().includes(tabHistorySearch.toLowerCase()) ||
      formatSessionDate(s.timestamp).toLowerCase().includes(tabHistorySearch.toLowerCase())
    );
    if (tabHistorySort === 'newest') {
      result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else if (tabHistorySort === 'oldest') {
      result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (tabHistorySort === 'longest') {
      result.sort((a, b) => b.durationSeconds - a.durationSeconds);
    } else if (tabHistorySort === 'shortest') {
      result.sort((a, b) => a.durationSeconds - b.durationSeconds);
    }
    return result;
  }, [timerSessions, tabHistorySearch, tabHistorySort]);

  function deleteSession(sessionId: string) {
    setTimerSessions((current) => current.filter((s) => s.id !== sessionId));
    setTabHistorySelectedIds((current) => current.filter((id) => id !== sessionId));
    setCelebration('Session log entry deleted.');
    window.setTimeout(() => setCelebration(''), 2200);
  }

  function deleteSessions(sessionIds: string[]) {
    const idsToDelete = new Set(sessionIds);
    setTimerSessions((current) => current.filter((s) => !idsToDelete.has(s.id)));
    setTabHistorySelectedIds((current) => current.filter((id) => !idsToDelete.has(id)));
    setCelebration(`${sessionIds.length} session log(s) deleted.`);
    window.setTimeout(() => setCelebration(''), 2200);
  }

  function clearHistory() {
    setTimerSessions([]);
    setTabHistorySelectedIds([]);
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
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-lg leading-none">Goal &amp; Time Tracker</p>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${pwaState.isOnline ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'}`} data-testid="badge-online-status">
                <span className={`size-1.5 rounded-full ${pwaState.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {pwaState.isOnline ? 'Online' : 'Offline'}
              </span>
              <div
                className="inline-flex items-center gap-2.5 rounded-2xl border border-orange-500/35 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-red-500/10 px-3 py-1.5 text-xs font-bold text-orange-600 transition-all hover:scale-[1.02] hover:border-orange-500/50 hover:shadow-sm dark:text-orange-300 dark:border-orange-500/40"
                title={`Daily Streak: ${dailyStreak} ${dailyStreak === 1 ? 'day' : 'days'}. Next milestone: ${streakMilestoneInfo.nextMilestone} days (${dailyStreak}/${streakMilestoneInfo.nextMilestone} days, ${streakMilestoneInfo.streakProgressPct}%). Record streak: ${maxStreakRecord} days.`}
                data-testid="badge-daily-streak"
              >
                <div className="flex items-center gap-1.5">
                  <Flame size={15} className="fill-orange-500 text-orange-500 animate-pulse filter drop-shadow-[0_0_4px_rgba(249,115,22,0.6)]" />
                  <span className="font-extrabold tracking-tight">{dailyStreak} {dailyStreak === 1 ? 'day streak' : 'days streak'}</span>
                </div>

                {/* Fire-themed Milestone Progress Indicator */}
                <div className="flex items-center gap-2 border-l border-orange-500/25 pl-2.5">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[10px] leading-tight font-bold text-orange-700/90 dark:text-orange-300/90">
                      <span>Milestone: {streakMilestoneInfo.nextMilestone}d</span>
                      <span className="font-mono-d ml-1.5">{streakMilestoneInfo.streakProgressPct}%</span>
                    </div>
                    <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-orange-200/80 dark:bg-orange-950/80">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 transition-all duration-500 shadow-[0_0_8px_rgba(249,115,22,0.7)]"
                        style={{ width: `${Math.max(6, streakMilestoneInfo.streakProgressPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
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
          { id: 'calendar', path: '/calendar', label: 'Calendar', emoji: '📅' },
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
              className={`flex min-h-[48px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-[#87CEEB] text-[#0a2533] shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
              data-testid={`mobile-tab-${tab.id}`}
            >
              <span className="text-lg leading-none">{tab.emoji}</span>
              <span className="mt-1 text-[10px] leading-none">{tab.label}</span>
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
              { id: 'calendar', path: '/calendar', label: 'Calendar', emoji: '📅' },
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
            <span className="rounded-lg bg-muted px-2.5 py-1 font-mono-d font-semibold">Ctrl+1..5</span>
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

                {selectedGoal?.linkedGoalId && (() => {
                  const linked = loggerGoals.find((lg) => lg.id === selectedGoal.linkedGoalId);
                  if (!linked) return null;
                  const pct = linked.targetHours > 0 ? Math.min(100, Math.round((linked.completedHours / linked.targetHours) * 100)) : 0;
                  return (
                    <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-left dark:border-[#2d425c] dark:bg-[#162235]/90" data-testid="focus-room-linked-goal-container">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#2e7799] dark:text-[#87CEEB]">
                        <Target size={14} />
                        <span data-testid="focus-room-linked-goal-name">Linked Goal: {linked.name}</span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground dark:text-[#D1D5DB]" data-testid="focus-room-linked-goal-progress">
                        Progress: {formatLoggerHours(linked.completedHours)} / {formatLoggerHours(linked.targetHours)} hours ({pct}%)
                      </p>
                    </div>
                  );
                })()}

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
                  {activeGoals.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index} selected={selectedGoalId === goal.id} onSelect={() => setSelectedGoalId(goal.id)} onComplete={() => toggleComplete(goal.id)} onDelete={() => setGoalToDelete(goal)} onEdit={() => { setEditingGoal(goal); setIsGoalFormOpen(true); }} onToggleSubGoal={toggleSubGoal} loggerGoals={loggerGoals} />)}
                </div>
              )}

              {showCompleted && completedGoals.length > 0 && <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{completedGoals.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index} selected={selectedGoalId === goal.id} onSelect={() => setSelectedGoalId(goal.id)} onComplete={() => toggleComplete(goal.id)} onDelete={() => setGoalToDelete(goal)} onEdit={() => { setEditingGoal(goal); setIsGoalFormOpen(true); }} onToggleSubGoal={toggleSubGoal} loggerGoals={loggerGoals} />)}</div>}
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
                  <button
                    type="button"
                    onClick={() => setIsCategoryManagerOpen(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-input bg-card px-3.5 py-2 text-xs font-bold text-foreground transition-all hover:bg-muted dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:hover:bg-[#1f2d3d]"
                    data-testid="button-manage-categories"
                  >
                    <Tag size={14} className="text-[#2e7799] dark:text-[#87CEEB]" /> Categories
                  </button>
                  <div className="relative min-w-[180px]">
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

              {/* Category Filter Pills */}
              {allCategories.length > 0 && loggerGoals.length > 0 && (
                <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="category-filter-bar">
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryFilter('All')}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                      selectedCategoryFilter === 'All'
                        ? 'bg-[#2e7799] text-white dark:bg-[#87CEEB] dark:text-[#0a2533]'
                        : 'border border-input bg-card text-muted-foreground hover:bg-muted dark:bg-[#162235] dark:text-[#D1D5DB] dark:border-[#2d425c]'
                    }`}
                    data-testid="filter-category-all"
                  >
                    All ({loggerGoals.length})
                  </button>

                  {allCategories.map((cat) => {
                    const count = loggerGoals.filter((g) => g.category === cat).length;
                    const style = getCategoryStyle(cat);
                    const isSelected = selectedCategoryFilter === cat;
                    const catGoals = loggerGoals.filter((g) => g.category === cat);
                    const catStreak = computeCategoryStreak(cat, catGoals, timerSessions, dailyTasks);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategoryFilter(cat)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                          isSelected
                            ? `${style.soft} ${style.ink} ${style.darkSoft} ${style.darkInk} ring-2 ring-[#5aaed6] dark:ring-[#87CEEB]`
                            : 'border border-input bg-card text-muted-foreground hover:bg-muted dark:bg-[#162235] dark:text-[#D1D5DB] dark:border-[#2d425c]'
                        }`}
                        data-testid={`filter-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <span>{cat}</span>
                        <span className="rounded-full bg-background/50 px-1.5 py-0.2 text-[10px] opacity-80">{count}</span>
                        {catStreak.count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-mono-d text-[10px]" data-testid={`category-streak-pill-${cat.replace(/\s+/g, '-').toLowerCase()}`}>
                            🔥{catStreak.count}d
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {loggerGoals.length === 0 ? (
                <EmptyLoggerGoals onCreate={() => setIsLoggerGoalFormOpen(true)} />
              ) : (
                <div className="space-y-8">
                  {displayedCategories.map((category) => {
                    const categoryGoals = loggerGoalsByCategory[category] || [];
                    const categoryStyle = getCategoryStyle(category);
                    const CategoryIcon = categoryStyle.icon;

                    if (categoryGoals.length === 0 && (searchQuery || selectedCategoryFilter !== 'All')) {
                      return null;
                    }

                    const catStreak = computeCategoryStreak(category, categoryGoals, timerSessions, dailyTasks);

                    return (
                      <section key={category} aria-labelledby={`logger-category-${category.replace(/\s+/g, '-').toLowerCase()}`} data-testid={`logger-category-${category.replace(/\s+/g, '-').toLowerCase()}`}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`grid size-9 place-items-center rounded-xl ${categoryStyle.soft} ${categoryStyle.ink} ${categoryStyle.darkSoft} ${categoryStyle.darkInk}`}><CategoryIcon size={16} /></div>
                            <div>
                              <h3 id={`logger-category-${category.replace(/\s+/g, '-').toLowerCase()}`} className="font-display text-2xl font-bold text-foreground dark:text-white">{category}</h3>
                              <p className="text-xs text-muted-foreground dark:text-[#D1D5DB]">{categoryGoals.length ? `${categoryGoals.length} ${categoryGoals.length === 1 ? 'goal' : 'goals'}` : 'No matching goals'}</p>
                            </div>
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300" data-testid={`category-streak-${category.replace(/\s+/g, '-').toLowerCase()}`}>
                            <Flame size={14} className="text-amber-500 animate-pulse shrink-0" />
                            <span>Category Streak: <strong className="font-mono-d" data-testid={`text-category-streak-count-${category.replace(/\s+/g, '-').toLowerCase()}`}>{catStreak.count} days</strong> ({catStreak.active ? 'Active 🔥' : 'Broken ❄️'})</span>
                            <span className="opacity-80">• Best: <strong className="font-mono-d">{catStreak.bestStreak}d</strong></span>
                          </div>
                        </div>
                        {categoryGoals.length ? (
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {categoryGoals.map((goal, index) => {
                              const isThisGoalTimer = loggerTimer.goalId === goal.id;
                              const isRunning = isThisGoalTimer && !loggerTimer.isPaused && Boolean(loggerTimer.startedAt);
                              const isPaused = isThisGoalTimer && Boolean(loggerTimer.isPaused);
                              const elapsed = isThisGoalTimer ? loggerElapsedSeconds : 0;
                              return (
                                <LoggerGoalCard
                                  key={goal.id}
                                  goal={goal}
                                  elapsedSeconds={elapsed}
                                  isRunning={isRunning}
                                  isPaused={isPaused}
                                  onStart={() => startLoggerTimer(goal.id)}
                                  onPause={pauseLoggerTimer}
                                  onResume={resumeLoggerTimer}
                                  onStop={stopLoggerTimer}
                                  onDelete={() => removeLoggerGoal(goal.id)}
                                  onReset={() => resetLoggerProgress(goal.id)}
                                  index={index}
                                />
                              );
                            })}
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

        {/* Tab Content: Daily Calendar View */}
        {activeTab === 'calendar' && (() => {
          const monthStart = startOfMonth(currentMonthDate);
          const monthEnd = endOfMonth(monthStart);
          const startDate = startOfWeek(monthStart);
          const endDate = endOfWeek(monthEnd);
          const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

          const selectedDateFormatted = parseISO(selectedDateStr);
          const selectedDateTitle = isValid(selectedDateFormatted)
            ? format(selectedDateFormatted, 'EEEE, MMMM d, yyyy')
            : selectedDateStr;

          const dayTasks = dailyTasks[selectedDateStr] || [];
          const goalsForDate = goals.filter((g) => g.targetDate === selectedDateStr);
          const unlinkedGoalsForDate = goalsForDate.filter((g) => !dayTasks.some((t) => t.goalId === g.id || t.taskId === g.id));

          const allSelectedDateTasks: DailyTaskItem[] = [
            ...dayTasks,
            ...unlinkedGoalsForDate.map((g) => ({
              taskId: g.id,
              title: g.title,
              completed: g.completed,
              goalId: g.id,
            })),
          ];

          const totalTasksCount = allSelectedDateTasks.length;
          const completedTasksCount = allSelectedDateTasks.filter((t) => t.completed).length;
          const taskProgressPct = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

          return (
            <div className="space-y-8 rise-in" data-testid="calendar-view">
              {/* Calendar View Top Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-card-border bg-card p-6 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">
                    <CalendarDays size={16} />
                    <span>Daily Calendar View</span>
                  </div>
                  <h2 className="mt-1 font-display text-3xl font-bold text-foreground dark:text-white sm:text-4xl">
                    Intentions &amp; Tasks by Day
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB] sm:text-sm">
                    Organize daily tasks, view completion status, and assign intentions to specific dates.
                  </p>
                </div>

                {/* Month Navigation Controls */}
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/80 p-1.5 shadow-sm dark:bg-[#162235]">
                  <button
                    type="button"
                    onClick={() => setCurrentMonthDate((prev) => subMonths(prev, 1))}
                    className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-[#1f2d3d]"
                    title="Previous Month"
                    data-testid="button-calendar-prev-month"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="min-w-[130px] text-center font-display text-base font-bold text-foreground dark:text-white" data-testid="text-calendar-month-title">
                    {format(currentMonthDate, 'MMMM yyyy')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentMonthDate((prev) => addMonths(prev, 1))}
                    className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-[#1f2d3d]"
                    title="Next Month"
                    data-testid="button-calendar-next-month"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      setCurrentMonthDate(today);
                      setSelectedDateStr(format(today, 'yyyy-MM-dd'));
                    }}
                    className="rounded-xl bg-[#5aaed6]/15 px-3 py-1.5 text-xs font-bold text-[#2e7799] hover:bg-[#5aaed6]/25 dark:bg-[#87CEEB]/20 dark:text-[#87CEEB]"
                    data-testid="button-calendar-today"
                  >
                    Today
                  </button>
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-[1.2fr_.8fr]">
                {/* Monthly Calendar Grid */}
                <div className="rounded-3xl border border-card-border bg-card p-5 shadow-sm sm:p-6" data-testid="calendar-grid-card">
                  {/* Days of week header */}
                  <div className="mb-3 grid grid-cols-7 gap-1 text-center">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName) => (
                      <div key={dayName} className="py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-[#D1D5DB]">
                        {dayName}
                      </div>
                    ))}
                  </div>

                  {/* Days grid */}
                  <div className="grid grid-cols-7 gap-1.5" data-testid="grid-calendar-days">
                    {calendarDays.map((day) => {
                      const dateKey = format(day, 'yyyy-MM-dd');
                      const isCurrentMonth = isSameMonth(day, currentMonthDate);
                      const isDayToday = isToday(day);
                      const isSelected = dateKey === selectedDateStr;

                      const cellCustomTasks = dailyTasks[dateKey] || [];
                      const cellGoalTasks = goals.filter((g) => g.targetDate === dateKey);
                      const totalCellTasks = cellCustomTasks.length + cellGoalTasks.filter((g) => !cellCustomTasks.some((t) => t.goalId === g.id)).length;
                      const completedCellTasks = cellCustomTasks.filter((t) => t.completed).length + cellGoalTasks.filter((g) => g.completed && !cellCustomTasks.some((t) => t.goalId === g.id)).length;

                      return (
                        <button
                          key={dateKey}
                          type="button"
                          onClick={() => setSelectedDateStr(dateKey)}
                          className={`group relative flex min-h-[72px] flex-col justify-between rounded-2xl border p-2 text-left transition-all duration-150 ${
                            isSelected
                              ? 'border-[#5aaed6] bg-[#e0f2fe]/90 ring-2 ring-[#87CEEB] dark:border-[#87CEEB] dark:bg-[#1c2e42]'
                              : isDayToday
                              ? 'border-emerald-500/50 bg-emerald-500/10 dark:border-emerald-400/50 dark:bg-emerald-500/15'
                              : isCurrentMonth
                              ? 'border-border/60 bg-background/60 hover:bg-muted/80 dark:border-[#2d425c] dark:bg-[#162235]/60 dark:hover:bg-[#1f2d3d]'
                              : 'border-transparent bg-background/20 opacity-40 hover:opacity-75 dark:bg-[#101826]/40'
                          }`}
                          data-testid={`calendar-cell-${dateKey}`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-mono-d text-xs font-bold ${
                                isSelected
                                  ? 'text-[#0a2533] dark:text-[#87CEEB]'
                                  : isDayToday
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-foreground dark:text-white'
                              }`}
                            >
                              {format(day, 'd')}
                            </span>
                            {isDayToday && (
                              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-600 dark:bg-emerald-400/20 dark:text-emerald-300">
                                Today
                              </span>
                            )}
                          </div>

                          {/* Task Indicators */}
                          {totalCellTasks > 0 ? (
                            <div className="mt-1 flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="size-1.5 rounded-full bg-[#5aaed6] dark:bg-[#87CEEB]" />
                                <span className="text-[10px] font-bold text-[#2e7799] dark:text-[#87CEEB]">
                                  {completedCellTasks}/{totalCellTasks} done
                                </span>
                              </div>
                              <div className="h-1 w-full overflow-hidden rounded-full bg-muted dark:bg-[#101826]">
                                <div
                                  className="h-full bg-[#5aaed6] transition-all duration-300 dark:bg-[#87CEEB]"
                                  style={{ width: `${Math.round((completedCellTasks / totalCellTasks) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] italic text-muted-foreground/40 group-hover:text-muted-foreground/70">
                              + task
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Date Tasks Panel */}
                <div className="space-y-6" data-testid="panel-selected-date-tasks">
                  <div className="rounded-3xl border border-card-border bg-card p-6 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border/80 pb-4 dark:border-[#2d425c]">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#2e7799] dark:text-[#87CEEB]">
                          Scheduled Tasks
                        </span>
                        <h3 className="mt-1 font-display text-xl font-bold text-foreground dark:text-white" data-testid="text-selected-date-title">
                          {selectedDateTitle}
                        </h3>
                      </div>
                      <span className="rounded-full bg-[#5aaed6]/15 px-3 py-1 text-xs font-bold text-[#2e7799] dark:bg-[#87CEEB]/20 dark:text-[#87CEEB]">
                        {completedTasksCount} / {totalTasksCount} finished
                      </span>
                    </div>

                    {/* Daily progress bar */}
                    {totalTasksCount > 0 && (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1.5">
                          <span>Daily Completion</span>
                          <span>{taskProgressPct}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-[#162235]">
                          <div
                            className="h-full bg-[#5aaed6] transition-all duration-300 dark:bg-[#87CEEB]"
                            style={{ width: `${taskProgressPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Task List */}
                    <div className="mt-5 space-y-2.5">
                      {allSelectedDateTasks.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/80 bg-background/50 p-6 text-center dark:border-[#2d425c]">
                          <CalendarDays className="mx-auto text-muted-foreground" size={24} />
                          <p className="mt-2 text-xs font-medium text-muted-foreground">
                            No tasks scheduled for this day yet.
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                            Add a quick task below or assign an existing intention!
                          </p>
                        </div>
                      ) : (
                        allSelectedDateTasks.map((task) => (
                          <div
                            key={task.taskId}
                            className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs transition-colors ${
                              task.completed
                                ? 'border-border/40 bg-muted/30 text-muted-foreground dark:border-[#2d425c]/50 dark:bg-[#162235]/40'
                                : 'border-border bg-background dark:border-[#2d425c] dark:bg-[#162235]'
                            }`}
                            data-testid={`task-item-${task.taskId}`}
                          >
                            <label className="flex flex-1 cursor-pointer items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={task.completed}
                                onChange={() => handleToggleTaskOnDate(selectedDateStr, task.taskId)}
                                className="size-4 rounded border-gray-300 text-primary focus:ring-[#87CEEB]"
                                data-testid={`checkbox-task-${task.taskId}`}
                              />
                              <span className={`flex-1 font-medium truncate ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground dark:text-white'}`}>
                                {task.title}
                              </span>
                            </label>

                            <div className="flex items-center gap-1.5">
                              {task.goalId && (
                                <span className="rounded-full bg-[#5aaed6]/15 px-2 py-0.5 text-[10px] font-bold text-[#2e7799] dark:bg-[#87CEEB]/20 dark:text-[#87CEEB]">
                                  Intention
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveTaskFromDate(selectedDateStr, task.taskId)}
                                title="Remove task from date"
                                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                                data-testid={`button-remove-task-${task.taskId}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add Custom Task Form */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddTaskToDate(selectedDateStr, calendarNewTaskInput);
                      }}
                      className="mt-6 border-t border-border/80 pt-5 dark:border-[#2d425c]"
                    >
                      <label htmlFor="calendar-new-task-input" className="block text-xs font-bold text-foreground dark:text-white mb-2">
                        + Add Task to {selectedDateStr}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="calendar-new-task-input"
                          type="text"
                          placeholder="e.g. Complete chapter 3, 30 min cardio..."
                          value={calendarNewTaskInput}
                          onChange={(e) => setCalendarNewTaskInput(e.target.value)}
                          className="flex-1 rounded-xl border border-input bg-background px-3.5 py-2 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-1 focus:ring-[#87CEEB]"
                          data-testid="input-calendar-new-task"
                        />
                        <button
                          type="submit"
                          disabled={!calendarNewTaskInput.trim()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40 dark:bg-[#87CEEB] dark:text-[#0a2533]"
                          data-testid="button-calendar-add-task"
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    </form>

                    {/* Assign Existing Goal Selector */}
                    {activeGoals.length > 0 && (
                      <div className="mt-4 border-t border-border/80 pt-4 dark:border-[#2d425c]">
                        <label htmlFor="calendar-assign-goal-select" className="block text-xs font-bold text-foreground dark:text-white mb-2">
                          🎯 Assign Existing Intention to Date
                        </label>
                        <div className="flex gap-2">
                          <select
                            id="calendar-assign-goal-select"
                            value={calendarSelectedGoalId}
                            onChange={(e) => setCalendarSelectedGoalId(e.target.value)}
                            className="flex-1 appearance-none rounded-xl border border-input bg-background px-3.5 py-2 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c]"
                            data-testid="select-calendar-assign-goal"
                          >
                            <option value="">Select an intention...</option>
                            {activeGoals.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.title} {g.targetDate ? `(currently ${g.targetDate})` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!calendarSelectedGoalId}
                            onClick={() => handleAssignGoalToDate(calendarSelectedGoalId, selectedDateStr)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#5aaed6] px-4 py-2 text-xs font-bold text-[#0a2533] shadow-sm hover:opacity-90 disabled:opacity-40 dark:bg-[#87CEEB]"
                            data-testid="button-calendar-assign-goal"
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

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
                <p className="mt-1 text-sm text-muted-foreground">A complete chronological history of all your logged timer sessions with selective deletion.</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsHistoryOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[#b9ddeb] bg-[#eaf7fc] px-4 py-2 text-xs font-bold text-[#2e7799] dark:bg-[#162235] dark:text-[#87CEEB] dark:border-[#2d425c]" data-testid="button-open-history-modal">
                  <History size={15} /> Modal View
                </button>
                {timerSessions.length > 0 && tabHistorySelectedIds.length === 0 && (
                  <button type="button" onClick={() => setShowConfirmTabClear(true)} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 dark:border-destructive/50 dark:bg-destructive/20 dark:text-[#f87171]" data-testid="button-clear-history-tab">
                    <Trash2 size={14} /> Clear Log
                  </button>
                )}
              </div>
            </div>

            {timerSessions.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-card-border bg-card p-4 paper-shadow">
                <div className="relative min-w-[200px] flex-1">
                  <Search size={15} className="absolute left-3 top-3 text-muted-foreground dark:text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search history logs..."
                    value={tabHistorySearch}
                    onChange={(e) => setTabHistorySearch(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#87CEEB]"
                    data-testid="input-history-tab-search"
                  />
                </div>
                <select
                  value={tabHistorySort}
                  onChange={(e) => setTabHistorySort(e.target.value as typeof tabHistorySort)}
                  className="rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c]"
                  data-testid="select-history-tab-sort"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="longest">Longest Session</option>
                  <option value="shortest">Shortest Session</option>
                </select>
              </div>
            )}

            {/* Batch Delete confirmation prompt */}
            {showConfirmTabBatch && (
              <div className="rounded-2xl border border-destructive/30 bg-[#fef2f2] p-5 rise-in dark:border-destructive/40 dark:bg-[#3b1719]" role="alertdialog">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive"><Trash2 size={18} /></div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-bold text-foreground dark:text-white">Delete {tabHistorySelectedIds.length} selected session log(s)?</h3>
                    <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">These selected entries will be permanently removed from your history log.</p>
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => { deleteSessions(tabHistorySelectedIds); setTabHistorySelectedIds([]); setShowConfirmTabBatch(false); }} className="rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5" data-testid="button-confirm-batch-delete-tab">Yes, delete selected</button>
                      <button type="button" onClick={() => setShowConfirmTabBatch(false)} className="rounded-xl border border-input bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted dark:text-white dark:border-[#2d425c]" data-testid="button-cancel-batch-delete-tab">Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Clear All confirmation prompt */}
            {showConfirmTabClear && (
              <div className="rounded-2xl border border-destructive/30 bg-[#fef2f2] p-5 rise-in dark:border-destructive/40 dark:bg-[#3b1719]" role="alertdialog">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive"><Trash2 size={18} /></div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-bold text-foreground dark:text-white">Clear all history logs?</h3>
                    <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">This will permanently remove all {timerSessions.length} session logs.</p>
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => { clearHistory(); setShowConfirmTabClear(false); }} className="rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5" data-testid="button-confirm-clear-tab">Yes, clear all</button>
                      <button type="button" onClick={() => setShowConfirmTabClear(false)} className="rounded-xl border border-input bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted dark:text-white dark:border-[#2d425c]" data-testid="button-cancel-clear-tab">Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Single Session delete prompt */}
            {tabSessionToDelete && (
              <div className="rounded-2xl border border-destructive/30 bg-[#fef2f2] p-5 rise-in dark:border-destructive/40 dark:bg-[#3b1719]" role="alertdialog">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive"><Trash2 size={18} /></div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-bold text-foreground dark:text-white">Delete session log entry?</h3>
                    <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">Remove "{tabSessionToDelete.goalName}" log from {formatSessionDate(tabSessionToDelete.timestamp)} ({formatDurationHM(tabSessionToDelete.durationSeconds)})?</p>
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => { deleteSession(tabSessionToDelete.id); setTabSessionToDelete(null); }} className="rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5" data-testid="button-confirm-single-delete-tab">Delete</button>
                      <button type="button" onClick={() => setTabSessionToDelete(null)} className="rounded-xl border border-input bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted dark:text-white dark:border-[#2d425c]" data-testid="button-cancel-single-delete-tab">Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {timerSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b9ddeb] bg-[#eaf7fc]/50 px-6 py-12 text-center dark:border-[#355461] dark:bg-[#19323d]/50" data-testid="history-tab-empty">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#c9ebf8] text-[#4387a9] dark:bg-[#29434e] dark:text-[#8bd0ed]"><History size={22} /></div>
                <h3 className="mt-4 font-display text-xl">Your timer sessions will appear here 📝</h3>
                <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted-foreground">Complete a timer session in the Goals tab to build your record.</p>
              </div>
            ) : filteredTabSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b9ddeb] bg-[#eaf7fc]/50 px-6 py-12 text-center dark:border-[#355461] dark:bg-[#19323d]/50">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#c9ebf8] text-[#4387a9] dark:bg-[#29434e] dark:text-[#8bd0ed]"><History size={22} /></div>
                <h3 className="mt-4 font-display text-xl">No logs match your search</h3>
                <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted-foreground">Try clearing your search query or changing filters.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-card-border bg-card p-6 paper-shadow">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#dcecf3] pb-3 dark:border-[#355461]">
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = filteredTabSessions.length > 0 && filteredTabSessions.every((s) => tabHistorySelectedIds.includes(s.id));
                      if (allSelected) {
                        setTabHistorySelectedIds([]);
                      } else {
                        setTabHistorySelectedIds(filteredTabSessions.map((s) => s.id));
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground dark:text-[#D1D5DB]"
                    data-testid="checkbox-select-all-tab-sessions"
                  >
                    {filteredTabSessions.length > 0 && filteredTabSessions.every((s) => tabHistorySelectedIds.includes(s.id)) ? (
                      <CheckCircle2 size={16} className="text-[#2e7799] dark:text-[#87CEEB]" />
                    ) : (
                      <Square size={16} />
                    )}
                    <span>
                      {filteredTabSessions.length > 0 && filteredTabSessions.every((s) => tabHistorySelectedIds.includes(s.id)) ? 'Deselect All' : 'Select All'}
                    </span>
                  </button>

                  {tabHistorySelectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowConfirmTabBatch(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/15 px-3.5 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/25 dark:border-destructive/60 dark:bg-destructive/25 dark:text-[#f87171]"
                      data-testid="button-delete-selected-tab-sessions"
                    >
                      <Trash2 size={13} /> Delete Selected ({tabHistorySelectedIds.length})
                    </button>
                  )}
                </div>

                <div className="divide-y divide-[#dcecf3] dark:divide-[#355461]">
                  {filteredTabSessions.map((session) => {
                    const isSelected = tabHistorySelectedIds.includes(session.id);
                    return (
                      <div key={session.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              setTabHistorySelectedIds((prev) =>
                                prev.includes(session.id) ? prev.filter((id) => id !== session.id) : [...prev, session.id]
                              );
                            }}
                            className="text-muted-foreground hover:text-foreground dark:text-[#D1D5DB]"
                            data-testid={`checkbox-select-tab-session-${session.id}`}
                          >
                            {isSelected ? <CheckCircle2 size={18} className="text-[#2e7799] dark:text-[#87CEEB]" /> : <Square size={18} />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-display text-lg text-foreground dark:text-white" data-testid={`history-tab-goal-name-${session.id}`}>{session.goalName}</h4>
                            <p className="mt-0.5 text-xs text-muted-foreground dark:text-[#D1D5DB]" data-testid={`history-tab-date-${session.id}`}>{formatSessionDate(session.timestamp)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf7fc] px-3.5 py-1.5 font-mono-d text-xs font-bold text-[#2e7799] dark:bg-[#19323d] dark:text-[#8bd0ed]" data-testid={`history-tab-duration-${session.id}`}>
                            <Timer size={14} /> {formatDurationHM(session.durationSeconds)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setTabSessionToDelete(session)}
                            className="grid size-8 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:text-[#D1D5DB] dark:hover:bg-destructive/20 dark:hover:text-[#f87171]"
                            data-testid={`button-delete-tab-session-${session.id}`}
                            aria-label={`Delete log entry for ${session.goalName}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-[1440px] px-5 pb-8 pt-2 text-center text-xs text-muted-foreground sm:px-8 lg:px-12">Made for the days that matter, one small step at a time.</footer>

      {isGoalFormOpen && (
        <GoalForm
          initialGoal={editingGoal}
          loggerGoals={loggerGoals}
          onClose={() => { setIsGoalFormOpen(false); setEditingGoal(null); }}
          onSubmit={(title, note, limit, subGoals, linkedGoalId) => {
            if (editingGoal) {
              updateGoal(editingGoal.id, title, note, limit, subGoals, linkedGoalId);
            } else {
              addGoal(title, note, limit, subGoals, linkedGoalId);
            }
          }}
        />
      )}
      {isEventFormOpen && <EventForm onClose={() => setIsEventFormOpen(false)} onSubmit={addEvent} />}
      {isLoggerGoalFormOpen && (
        <LoggerGoalForm
          categories={allCategories}
          onClose={() => setIsLoggerGoalFormOpen(false)}
          onSubmit={addLoggerGoal}
          onAddCategory={addCategory}
        />
      )}
      {isCategoryManagerOpen && (
        <CategoryManagerModal
          categories={allCategories}
          goals={loggerGoals}
          onClose={() => setIsCategoryManagerOpen(false)}
          onAddCategory={addCategory}
          onRenameCategory={renameCategory}
          onDeleteCategory={deleteCategory}
        />
      )}
      {isStatsOpen && <StatsPanel days={statsDays} todaySeconds={todayStatsSeconds} weeklySeconds={weeklyStatsSeconds} maxDaySeconds={maxStatsDaySeconds} onClose={() => setIsStatsOpen(false)} />}
      {isHistoryOpen && <HistoryLogModal sessions={timerSessions} onClose={() => setIsHistoryOpen(false)} onClearHistory={clearHistory} onDeleteSession={deleteSession} onDeleteSessions={deleteSessions} />}
      {isInstallGuideOpen && <InstallPwaModal pwaState={pwaState} onClose={() => setIsInstallGuideOpen(false)} />}
      {goalToDelete && <DeleteDialog goal={goalToDelete} onCancel={() => setGoalToDelete(null)} onConfirm={removeGoal} />}
    </div>
  );
}

function formatDate() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function formatIntentionDate(dateStr: string) {
  if (!dateStr) {
    const now = new Date();
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    const day = now.getDate();
    const year = now.getFullYear();
    const mNum = now.getMonth() + 1;
    const yShort = String(year).slice(-2);
    return {
      desktop: `📅 ${month} ${day}, ${year}`,
      mobile: `📅 ${mNum}/${day}/${yShort}`,
      full: `${month} ${day}, ${year}`,
    };
  }

  let d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    d = new Date();
  }

  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  const mNum = d.getMonth() + 1;
  const yShort = String(year).slice(-2);

  return {
    desktop: `📅 ${month} ${day}, ${year}`,
    mobile: `📅 ${mNum}/${day}/${yShort}`,
    full: `${month} ${day}, ${year}`,
  };
}

function GoalCard({
  goal,
  selected,
  index,
  onSelect,
  onComplete,
  onDelete,
  onEdit,
  onToggleSubGoal,
  onRecoverStreak,
  loggerGoals,
  timerSessions = [],
  dailyTasks = {},
}: {
  goal: Goal;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onToggleSubGoal?: (goalId: string, subGoalId: string) => void;
  onRecoverStreak?: (goalId: string) => void;
  loggerGoals?: LoggerGoal[];
  timerSessions?: TimerSession[];
  dailyTasks?: DailyTasksMap;
}) {
  const style = colorStyles[goal.color];
  const Icon = style.icon;
  const completion = goal.completed ? 100 : goal.minutes > 0 ? Math.min(99, Math.max(1, Math.round((goal.minutes / 60) * 100))) : 0;
  const motivation = getMotivationalMessage(completion);

  const loggedDates = useMemo(() => {
    return getGoalLoggedDates(goal.id, goal.title, goal.linkedGoalId, timerSessions, dailyTasks);
  }, [goal.id, goal.title, goal.linkedGoalId, timerSessions, dailyTasks]);

  const { completedSubCount, totalSubCount } = useMemo(() => {
    let completed = 0;
    let total = 0;
    if (!goal.subGoals) return { completedSubCount: 0, totalSubCount: 0 };
    for (const item of goal.subGoals) {
      if (item.type === 'header') {
        if (item.children) {
          for (const child of item.children) {
            total++;
            if (child.completed) completed++;
          }
        }
      } else {
        total++;
        if (item.completed) completed++;
      }
    }
    return { completedSubCount: completed, totalSubCount: total };
  }, [goal.subGoals]);

  const [collapsedHeaders, setCollapsedHeaders] = useState<Record<string, boolean>>({});

  function toggleHeaderCollapse(headerId: string) {
    setCollapsedHeaders((prev) => ({ ...prev, [headerId]: !prev[headerId] }));
  }

  const linkedGoal = goal.linkedGoalId && loggerGoals ? loggerGoals.find((lg) => lg.id === goal.linkedGoalId) : null;
  const linkedPct = linkedGoal && linkedGoal.targetHours > 0 ? Math.min(100, Math.round((linkedGoal.completedHours / linkedGoal.targetHours) * 100)) : 0;

  const createdDate = formatIntentionDate(goal.createdAt);
  const targetDateFormatted = goal.targetDate ? formatIntentionDate(goal.targetDate) : null;

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

        {linkedGoal && (
          <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-[#2e7799] dark:border-[#38587a] dark:bg-[#162235] dark:text-[#87CEEB]" data-testid={`linked-goal-info-${goal.id}`}>
            <div className="flex items-center gap-1.5 font-bold">
              <Target size={13} />
              <span data-testid={`text-linked-goal-name-${goal.id}`}>Linked Goal: {linkedGoal.name}</span>
            </div>
            <div className="mt-1 font-semibold text-muted-foreground dark:text-[#D1D5DB]" data-testid={`text-linked-goal-progress-${goal.id}`}>
              Progress: {formatLoggerHours(linkedGoal.completedHours)} / {formatLoggerHours(linkedGoal.targetHours)} hours ({linkedPct}%)
            </div>
          </div>
        )}

        {goal.subGoals && goal.subGoals.length > 0 && (
          <div className="mt-4 rounded-xl border border-border/80 bg-background/60 p-3 dark:bg-[#162235]/70 dark:border-[#2d425c]" data-testid={`subgoals-container-${goal.id}`}>
            <div className="flex items-center justify-between pb-2 text-[11px] font-bold text-muted-foreground dark:text-[#D1D5DB]">
              <span className="uppercase tracking-wider flex items-center gap-1">
                <BookOpen size={12} className="text-[#2e7799] dark:text-[#87CEEB]" /> Target Items
              </span>
              <span className="font-mono-d text-[#2e7799] dark:text-[#87CEEB]" data-testid={`text-subgoals-counter-${goal.id}`}>
                {completedSubCount} / {totalSubCount}
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {goal.subGoals.map((item) => {
                if (item.type === 'header') {
                  const children = item.children || [];
                  const completedCount = children.filter((c) => c.completed).length;
                  const totalCount = children.length;
                  const isCollapsed = collapsedHeaders[item.id];

                  return (
                    <div key={item.id} className="rounded-xl border border-border/60 bg-card/60 p-2.5 dark:border-[#2d425c] dark:bg-[#192638]/70" data-testid={`subgoal-header-${goal.id}-${item.id}`}>
                      <div
                        className="pointer-events-auto flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted/60 dark:hover:bg-[#1f2d3d]"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleHeaderCollapse(item.id);
                        }}
                        data-testid={`header-row-${goal.id}-${item.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground dark:text-[#87CEEB]">
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </span>
                          <span className="text-xs font-bold text-foreground dark:text-white flex items-center gap-1.5 truncate" data-testid={`text-header-name-${item.id}`}>
                            <span>📘</span> {item.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-[#2e7799] dark:text-[#87CEEB] bg-[#eaf7fc] dark:bg-[#162235] px-2 py-0.5 rounded-full border border-sky-500/20">
                          {completedCount} / {totalCount}
                        </span>
                      </div>

                      {!isCollapsed && (
                        <div className="ml-3 mt-1.5 space-y-1 border-l-2 border-[#5aaed6]/30 dark:border-[#87CEEB]/30 pl-3">
                          {children.length === 0 ? (
                            <p className="py-1 text-[11px] italic text-muted-foreground">No subtopics added yet</p>
                          ) : (
                            children.map((sub) => (
                              <div
                                key={sub.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onToggleSubGoal) onToggleSubGoal(goal.id, sub.id);
                                }}
                                className="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/70 dark:text-white dark:hover:bg-[#1f2d3d]"
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
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onToggleSubGoal) onToggleSubGoal(goal.id, item.id);
                    }}
                    className="pointer-events-auto flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/70 dark:border-[#2d425c] dark:bg-[#1f2d3d]/50 dark:text-white dark:hover:bg-[#1f2d3d]"
                    data-testid={`card-subgoal-${goal.id}-${item.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => {}}
                      className="size-3.5 rounded border-gray-300 text-primary focus:ring-[#87CEEB] pointer-events-none"
                      data-testid={`checkbox-card-subgoal-${goal.id}-${item.id}`}
                    />
                    <span className={`flex-1 text-xs font-medium ${item.completed ? 'line-through text-muted-foreground dark:text-slate-400' : ''}`}>
                      {item.name}
                    </span>
                  </div>
                );
              })}
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

        {/* Goal Streak Badge */}
        <StreakBadge
          streak={goal.streak}
          goalName={goal.title}
          onRecoverStreak={onRecoverStreak ? () => onRecoverStreak(goal.id) : undefined}
        />

        {/* Streak Calendar Dots */}
        <StreakCalendar dateSet={loggedDates} daysCount={7} />

        <div className="mt-4 flex flex-wrap items-center justify-between border-t border-border/70 pt-3 text-xs gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono-d text-muted-foreground dark:text-[#D1D5DB]"><Clock3 size={13} /> {formatMinutes(goal.minutes)}</span>
          <div className="flex flex-wrap items-center gap-2">
            {targetDateFormatted && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#eaf7fc] px-2 py-0.5 text-[11px] font-bold text-[#2e7799] dark:bg-[#162235] dark:text-[#87CEEB]" data-testid={`text-goal-target-date-${goal.id}`}>
                <span className="hidden sm:inline">Due: {targetDateFormatted.full}</span>
                <span className="inline sm:hidden">Due: {targetDateFormatted.mobile}</span>
              </span>
            )}
            <span className="font-semibold text-muted-foreground dark:text-[#D1D5DB]" data-testid={`text-goal-created-at-${goal.id}`}>
              <span className="hidden sm:inline">{createdDate.desktop}</span>
              <span className="inline sm:hidden">{createdDate.mobile}</span>
            </span>
          </div>
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
    <div
      className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[#5aaed6] bg-gradient-to-br from-[#e0f2fe] via-[#f0f9fd] to-[#e0f2fe] p-8 text-center shadow-lg transition-all duration-300 hover:scale-[1.005] dark:border-[#87CEEB] dark:from-[#1e2a4a] dark:via-[#16213e] dark:to-[#131b30] dark:shadow-[0_0_25px_rgba(135,206,235,0.25)] sm:p-10"
      data-testid="empty-goals"
    >
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#c9ebf8] text-[#2e7799] shadow-inner dark:bg-[#283e52] dark:text-[#87CEEB] dark:shadow-[inset_0_0_12px_rgba(135,206,235,0.2)]">
        <Target size={26} strokeWidth={2.2} />
      </div>
      <h3 className="mt-4 font-display text-2xl font-bold tracking-tight text-[#0f2d3d] dark:text-white dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] sm:text-3xl">
        A clear page can be a beginning.
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-[#2c5266] dark:text-slate-200/90 sm:text-base">
        Add one intention that would make today feel a little more like yours.
      </p>
      <div className="mt-6">
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-full bg-[#5aaed6] px-6 py-3 text-sm font-bold text-[#0a2533] shadow-md transition-all duration-200 hover:bg-[#72bde0] hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(135,206,235,0.5)] focus:outline-none focus:ring-2 focus:ring-[#87CEEB] dark:bg-[#87CEEB] dark:text-[#0a2533] dark:hover:bg-[#a2e0f9]"
          data-testid="button-create-first-goal"
        >
          <Plus size={18} strokeWidth={2.5} /> Add your first intention
        </button>
      </div>
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

function EventCard({
  event,
  now: parentNow,
  index,
  onDelete,
  onEdit,
}: {
  event: TrackerEvent;
  now?: number;
  index: number;
  onDelete: () => void;
  onEdit?: (eventItem: TrackerEvent) => void;
}) {
  const [currentNow, setCurrentNow] = useState(() => Date.now());

  useEffect(() => {
    const targetTime = parseEventDateTime(event.datetime);

    if (Number.isNaN(targetTime) || targetTime <= Date.now()) {
      setCurrentNow(Date.now());
      return;
    }

    setCurrentNow(Date.now());

    const interval = window.setInterval(() => {
      const nowMs = Date.now();
      setCurrentNow(nowMs);

      if (targetTime <= nowMs) {
        window.clearInterval(interval);
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [event.datetime]);

  const activeNow = parentNow ? Math.max(parentNow, currentNow) : currentNow;
  
  // Auto-resolve recurring next occurrence if event date has passed
  const effectiveDatetime = useMemo(() => {
    if (event.recurrence && event.recurrence !== 'none') {
      const dt = parseISO(event.datetime);
      if (isValid(dt) && dt.getTime() < activeNow) {
        return getNextOccurrence(event.datetime, event.recurrence);
      }
    }
    return event.datetime;
  }, [event.datetime, event.recurrence, activeNow]);

  const countdown = getCountdown(effectiveDatetime, activeNow);

  return (
    <article className={`relative overflow-hidden rounded-2xl border border-[#b9ddeb] bg-card p-5 shadow-[0_8px_22px_-16px_rgba(46,119,153,.55)] dark:border-[#38587a] dark:bg-[#1E2A4A] dark:shadow-[0_8px_22px_-16px_rgba(0,0,0,.8)] rise-in rise-in-delay-${Math.min(index + 1, 3)}`} data-testid={`card-event-${event.id}`}>
      <div className="absolute -right-9 -top-12 size-32 rounded-full border border-[#9bcde3]/60 bg-[#eaf7fc] dark:border-[#38587a]/60 dark:bg-[#192b3c]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#c9ebf8] text-[#2e7799] dark:bg-[#283e52] dark:text-[#87CEEB]"><Clock3 size={18} /></div>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(event)}
                aria-label={`Edit ${event.name}`}
                className="grid size-8 place-items-center rounded-full text-[#6b8d9b] transition-colors hover:bg-[#dff3fb] hover:text-[#2e7799] dark:text-[#9CA3AF] dark:hover:bg-[#283e52] dark:hover:text-[#87CEEB]"
                data-testid={`button-edit-event-${event.id}`}
              >
                <Pencil size={14} />
              </button>
            )}
            <button type="button" onClick={onDelete} aria-label={`Delete ${event.name}`} className="grid size-8 place-items-center rounded-full text-[#6b8d9b] transition-colors hover:bg-[#dff3fb] hover:text-[#2e7799] dark:text-[#9CA3AF] dark:hover:bg-[#283e52] dark:hover:text-[#87CEEB]" data-testid={`button-delete-event-${event.id}`}><Trash2 size={15} /></button>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <h3 className="font-display text-[1.35rem] font-bold leading-tight text-foreground dark:text-white" data-testid={`text-event-name-${event.id}`}>{event.name}</h3>
          {event.recurrence && event.recurrence !== 'none' && (
            <span className="shrink-0 rounded-full bg-[#eaf7fc] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#2e7799] dark:bg-[#162235] dark:text-[#87CEEB]" data-testid={`badge-event-recurrence-${event.id}`}>
              🔄 {event.recurrence}
            </span>
          )}
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2e7799] dark:text-[#87CEEB]" data-testid={`text-event-date-${event.id}`}><Clock3 size={13} /> {formatEventDate(effectiveDatetime)}</p>
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

function LoggerGoalCard({
  goal,
  elapsedSeconds,
  isRunning,
  isPaused,
  timerSessions = [],
  dailyTasks = {},
  onStart,
  onPause,
  onResume,
  onStop,
  onDelete,
  onReset,
  onEditTarget,
  onRecoverStreak,
  index,
}: {
  goal: LoggerGoal;
  elapsedSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  timerSessions?: TimerSession[];
  dailyTasks?: DailyTasksMap;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDelete: () => void;
  onReset: () => void;
  onEditTarget?: (goal: LoggerGoal) => void;
  onRecoverStreak?: (goalId: string) => void;
  index: number;
}) {
  const style = getCategoryStyle(goal.category);
  const Icon = style.icon;
  const completion = goal.targetHours > 0 ? Math.min(100, Math.round((goal.completedHours / goal.targetHours) * 100)) : 0;
  const motivation = getMotivationalMessage(completion);

  const loggedDates = useMemo(() => {
    return getGoalLoggedDates(goal.id, goal.name, undefined, timerSessions, dailyTasks);
  }, [goal.id, goal.name, timerSessions, dailyTasks]);

  return (
    <article className={`relative overflow-hidden rounded-2xl border border-[#b9ddeb] bg-card p-5 shadow-[0_8px_22px_-16px_rgba(46,119,153,.55)] dark:border-[#38587a] dark:bg-[#1E2A4A] dark:shadow-[0_8px_22px_-16px_rgba(0,0,0,.8)] rise-in rise-in-delay-${Math.min(index + 1, 3)}`} data-testid={`card-logger-goal-${goal.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`grid size-10 place-items-center rounded-xl ${style.soft} ${style.ink} ${style.darkSoft} ${style.darkInk}`}><Icon size={18} /></div>
        <div className="flex items-center gap-1.5">
          {onEditTarget && (
            <button
              type="button"
              onClick={() => onEditTarget(goal)}
              className="inline-flex items-center gap-1 rounded-lg bg-muted/80 px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground dark:bg-[#162235] dark:text-[#D1D5DB] dark:hover:bg-[#203248]"
              data-testid={`button-edit-target-${goal.id}`}
              title="Edit target hours without losing progress"
            >
              <Pencil size={12} /> Edit Target
            </button>
          )}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${style.soft} ${style.ink} ${style.darkSoft} ${style.darkInk}`} data-testid={`text-logger-category-${goal.id}`}>{goal.category}</span>
        </div>
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

      {/* Goal Streak Badge Card */}
      <StreakBadge
        streak={goal.streak}
        goalName={goal.name}
        onRecoverStreak={onRecoverStreak ? () => onRecoverStreak(goal.id) : undefined}
      />

      {/* Mini Streak Calendar */}
      <StreakCalendar dateSet={loggedDates} daysCount={7} />
      <div className={`mt-5 rounded-xl px-4 py-3 text-center transition-colors ${
        isRunning
          ? 'bg-[#eaf7fc] border border-[#5aaed6]/40 dark:bg-[#162235] dark:border-[#87CEEB]/40'
          : isPaused
          ? 'bg-[#5aaed6]/15 border border-[#5aaed6]/40 dark:bg-[#87CEEB]/15 dark:border-[#87CEEB]/40'
          : 'bg-[#eaf7fc] dark:bg-[#162235] dark:border dark:border-[#2d425c]'
      }`}>
        <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]">
          {isRunning ? (
            <span className="inline-flex items-center gap-1.5 text-[#2e7799] dark:text-[#87CEEB]" data-testid={`status-running-logger-${goal.id}`}>
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Session in progress
            </span>
          ) : isPaused ? (
            <span className="inline-flex items-center gap-1.5 text-[#2e7799] dark:text-[#87CEEB] font-bold" data-testid={`status-paused-logger-${goal.id}`}>
              <Pause size={12} className="text-[#5aaed6] dark:text-[#87CEEB]" /> Paused
            </span>
          ) : (
            <span className="text-[#528096] dark:text-[#D1D5DB]" data-testid={`status-idle-logger-${goal.id}`}>
              Ready when you are
            </span>
          )}
        </div>
        <p className="mt-1 font-mono-d text-2xl font-bold tracking-[-0.04em] text-[#2e7799] dark:text-[#87CEEB]" data-testid={`text-logger-elapsed-${goal.id}`}>{formatTimer(elapsedSeconds)}</p>
      </div>
      <div className="mt-4">
        {isRunning ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPause}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-3 text-sm font-bold text-[#173849] dark:text-[#0a2533] transition-all hover:bg-[#72bde0] dark:hover:bg-[#a1d9f0] hover:-translate-y-0.5"
              data-testid={`button-pause-logger-${goal.id}`}
            >
              <Pause size={15} /> Pause
            </button>
            <button
              type="button"
              onClick={onStop}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2e7799] dark:bg-[#20526e] px-4 py-3 text-sm font-bold text-white transition-all hover:bg-[#235f7a] dark:hover:bg-[#28668a] hover:-translate-y-0.5"
              data-testid={`button-stop-logger-${goal.id}`}
            >
              <Square size={15} fill="currentColor" /> Stop
            </button>
          </div>
        ) : isPaused ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResume}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-3 text-sm font-bold text-[#173849] dark:text-[#0a2533] transition-all hover:bg-[#72bde0] dark:hover:bg-[#a1d9f0] hover:-translate-y-0.5"
              data-testid={`button-resume-logger-${goal.id}`}
            >
              <Play size={15} fill="currentColor" /> Resume
            </button>
            <button
              type="button"
              onClick={onStop}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2e7799] dark:bg-[#20526e] px-4 py-3 text-sm font-bold text-white transition-all hover:bg-[#235f7a] dark:hover:bg-[#28668a] hover:-translate-y-0.5"
              data-testid={`button-stop-logger-${goal.id}`}
            >
              <Square size={15} fill="currentColor" /> Stop
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-3 text-sm font-bold text-[#173849] dark:text-[#0a2533] transition-all hover:bg-[#72bde0] dark:hover:bg-[#a1d9f0] hover:-translate-y-0.5"
            data-testid={`button-start-logger-${goal.id}`}
          >
            <Play size={16} fill="currentColor" /> Start
          </button>
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

function GoalForm({ initialGoal, loggerGoals = [], onClose, onSubmit }: { initialGoal?: Goal | null; loggerGoals?: LoggerGoal[]; onClose: () => void; onSubmit: (title: string, note: string, sessionLimitMinutes?: number, subGoals?: SubGoal[], linkedGoalId?: string, targetDate?: string) => void }) {
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
  const [headerOrSubtopicInput, setHeaderOrSubtopicInput] = useState('');
  const [targetHeaderId, setTargetHeaderId] = useState<string>('');
  const [inlineSubtopicInputs, setInlineSubtopicInputs] = useState<Record<string, string>>({});
  const [linkedGoalId, setLinkedGoalId] = useState(initialGoal?.linkedGoalId ?? '');
  const [targetDate, setTargetDate] = useState(initialGoal?.targetDate ?? '');

  const [draggedInfo, setDraggedInfo] = useState<{
    id: string;
    type: 'top' | 'child';
    parentHeaderId?: string;
  } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const availableHeaders = useMemo(() => subGoals.filter((s) => s.type === 'header'), [subGoals]);

  const canSubmit = title.trim().length > 1;

  function handleDropOnItem(targetId: string, targetParentHeaderId?: string) {
    if (!draggedInfo) return;
    const { id: sourceId, parentHeaderId: sourceParentHeaderId } = draggedInfo;
    if (sourceId === targetId) return;

    setSubGoals((prev) => {
      const list: SubGoal[] = prev.map((item) => ({
        ...item,
        children: item.children ? [...item.children] : undefined,
      }));

      let extractedItem: SubGoal | null = null;

      if (!sourceParentHeaderId) {
        const idx = list.findIndex((i) => i.id === sourceId);
        if (idx !== -1) {
          extractedItem = list.splice(idx, 1)[0];
        }
      } else {
        const parent = list.find((i) => i.id === sourceParentHeaderId);
        if (parent && parent.children) {
          const idx = parent.children.findIndex((c) => c.id === sourceId);
          if (idx !== -1) {
            extractedItem = parent.children.splice(idx, 1)[0];
          }
        }
      }

      if (!extractedItem) return prev;

      if (!targetParentHeaderId) {
        const targetHeader = list.find((i) => i.id === targetId && i.type === 'header');
        if (targetHeader && extractedItem.type === 'subtopic') {
          if (!targetHeader.children) targetHeader.children = [];
          targetHeader.children.push(extractedItem);
        } else {
          const targetIdx = list.findIndex((i) => i.id === targetId);
          if (targetIdx !== -1) {
            list.splice(targetIdx, 0, extractedItem);
          } else {
            list.push(extractedItem);
          }
        }
      } else {
        const targetHeader = list.find((i) => i.id === targetParentHeaderId);
        if (targetHeader) {
          if (!targetHeader.children) targetHeader.children = [];
          const targetIdx = targetHeader.children.findIndex((c) => c.id === targetId);
          if (targetIdx !== -1) {
            targetHeader.children.splice(targetIdx, 0, extractedItem);
          } else {
            targetHeader.children.push(extractedItem);
          }
        } else {
          list.push(extractedItem);
        }
      }

      return list;
    });

    setDraggedInfo(null);
    setDragOverId(null);
  }

  function handleAddHeader() {
    const name = headerOrSubtopicInput.trim();
    if (!name) return;
    const newHeader: SubGoal = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'header',
      name,
      children: [],
    };
    setSubGoals((prev) => [...prev, newHeader]);
    setHeaderOrSubtopicInput('');
  }

  function handleAddSubtopic(headerId?: string, textOverride?: string) {
    const text = (textOverride !== undefined ? textOverride : headerOrSubtopicInput).trim();
    if (!text) return;
    const newSubtopic: SubGoal = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'subtopic',
      name: text,
      completed: false,
    };

    const destHeaderId = headerId !== undefined ? headerId : targetHeaderId;

    if (!destHeaderId) {
      setSubGoals((prev) => [...prev, newSubtopic]);
    } else {
      setSubGoals((prev) =>
        prev.map((item) => {
          if (item.id === destHeaderId) {
            return {
              ...item,
              children: [...(item.children || []), newSubtopic],
            };
          }
          return item;
        })
      );
    }

    if (textOverride === undefined) {
      setHeaderOrSubtopicInput('');
    }
  }

  function handleMoveTopItem(index: number, direction: 'up' | 'down') {
    setSubGoals((prev) => {
      const list = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIndex];
      list[targetIndex] = temp;
      return list;
    });
  }

  function handleMoveChildItem(headerId: string, childIndex: number, direction: 'up' | 'down') {
    setSubGoals((prev) =>
      prev.map((item) => {
        if (item.id !== headerId) return item;
        const children = [...(item.children || [])];
        const targetIndex = direction === 'up' ? childIndex - 1 : childIndex + 1;
        if (targetIndex < 0 || targetIndex >= children.length) return item;
        const temp = children[childIndex];
        children[childIndex] = children[targetIndex];
        children[targetIndex] = temp;
        return { ...item, children };
      })
    );
  }

  function handleRemoveTopItem(id: string) {
    setSubGoals((prev) => prev.filter((item) => item.id !== id));
  }

  function handleRemoveChildItem(headerId: string, childId: string) {
    setSubGoals((prev) =>
      prev.map((item) => {
        if (item.id !== headerId) return item;
        return {
          ...item,
          children: (item.children || []).filter((child) => child.id !== childId),
        };
      })
    );
  }

  function handleToggleSubtopicInForm(subtopicId: string) {
    setSubGoals((prev) => toggleSubGoalInTree(prev, subtopicId));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    let limitMinutes: number | undefined;
    const parsed = parseFloat(sessionLimitValue);
    if (!isNaN(parsed) && parsed > 0) {
      limitMinutes = sessionLimitUnit === 'hours' ? Math.round(parsed * 60) : Math.round(parsed);
    }

    onSubmit(title.trim(), note.trim(), limitMinutes, subGoals, linkedGoalId ? linkedGoalId : undefined, targetDate ? targetDate : undefined);
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
            <label htmlFor="select-linked-goal" className="text-sm font-bold text-foreground dark:text-white">
              Link to Main Goal <span className="font-normal text-muted-foreground dark:text-[#D1D5DB]">(optional)</span>
            </label>
            <select
              id="select-linked-goal"
              value={linkedGoalId}
              onChange={(event) => setLinkedGoalId(event.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
              data-testid="select-linked-goal"
            >
              <option value="">No linked goal</option>
              {loggerGoals.map((lg) => (
                <option key={lg.id} value={lg.id}>
                  {lg.name} ({formatLoggerHours(lg.targetHours)}h target)
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">
              Completing sessions for this intention will automatically add time to your main goal progress.
            </p>
          </div>

          <div>
            <label htmlFor="goal-target-date" className="text-sm font-bold text-foreground dark:text-white">
              Target date <span className="font-normal text-muted-foreground dark:text-[#D1D5DB]">(optional)</span>
            </label>
            <input
              id="goal-target-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
              data-testid="input-goal-target-date"
            />
            <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">
              Set an optional due or target date for this intention.
            </p>
          </div>

          <div>
            <label htmlFor="goal-target-items-input" className="text-sm font-bold text-foreground dark:text-white">
              Target items <span className="font-normal text-muted-foreground dark:text-[#D1D5DB]">(optional)</span>
            </label>
            <p className="mt-1 text-xs text-muted-foreground dark:text-[#D1D5DB]">
              Organize into Headers (e.g., "Python") and Subtopics (e.g., "Functions").
            </p>

            {/* Main Input Controls */}
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  id="goal-target-items-input"
                  value={headerOrSubtopicInput}
                  onChange={(e) => setHeaderOrSubtopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (targetHeaderId) {
                        handleAddSubtopic(targetHeaderId);
                      } else {
                        handleAddSubtopic('');
                      }
                    }
                  }}
                  placeholder="e.g. Python (Header) or Functions (Subtopic)"
                  className="min-h-[44px] flex-1 rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
                  data-testid="input-target-item"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddHeader}
                    disabled={!headerOrSubtopicInput.trim()}
                    className="inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-[#c9ebf8] px-3.5 py-2.5 text-xs font-bold text-[#1a536e] transition-all hover:bg-[#b5e2f5] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#20364f] dark:text-[#87CEEB] dark:hover:bg-[#294566]"
                    data-testid="button-add-header"
                  >
                    <BookOpen size={15} /> + Add Header
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddSubtopic(targetHeaderId)}
                    disabled={!headerOrSubtopicInput.trim()}
                    className="inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-[#5aaed6] px-4 py-2.5 text-xs font-bold text-[#173849] transition-all hover:bg-[#72bde0] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#87CEEB] dark:text-[#0a2533] dark:hover:bg-[#72c2e6]"
                    data-testid="button-add-subtopic"
                  >
                    <Plus size={16} /> + Add Subtopic
                  </button>
                </div>
              </div>

              {availableHeaders.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground dark:text-[#D1D5DB] font-medium">Attach subtopic under:</span>
                  <select
                    value={targetHeaderId}
                    onChange={(e) => setTargetHeaderId(e.target.value)}
                    className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-1 focus:ring-[#87CEEB]"
                    data-testid="select-target-header"
                  >
                    <option value="">(Standalone Subtopic)</option>
                    {availableHeaders.map((h) => (
                      <option key={h.id} value={h.id}>
                        📘 {h.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Hierarchical Tree List */}
            {subGoals.length > 0 && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-border bg-background/50 p-3 dark:bg-[#162235]/60 dark:border-[#2d425c]" data-testid="list-target-items">
                {subGoals.map((item, idx) => {
                  if (item.type === 'header') {
                    const children = item.children || [];
                    const inlineText = inlineSubtopicInputs[item.id] || '';
                    const isDragging = draggedInfo?.id === item.id;
                    const isDragOver = dragOverId === item.id;

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDraggedInfo({ id: item.id, type: 'top' });
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragOverId !== item.id) setDragOverId(item.id);
                        }}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          if (dragOverId === item.id) setDragOverId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDropOnItem(item.id);
                        }}
                        onDragEnd={() => {
                          setDraggedInfo(null);
                          setDragOverId(null);
                        }}
                        className={`rounded-xl border transition-all duration-150 p-3 shadow-sm ${
                          isDragging
                            ? 'opacity-40 border-dashed border-[#5aaed6] scale-[0.99]'
                            : isDragOver
                            ? 'ring-2 ring-[#87CEEB] bg-[#e0f2fe]/80 dark:bg-[#20364f]'
                            : 'border-border/80 bg-card dark:border-[#2d425c] dark:bg-[#1f2d3d]'
                        }`}
                        data-testid={`target-header-item-${item.id}`}
                      >
                        {/* Header Bar */}
                        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5 dark:border-[#2d425c]">
                          <div className="flex items-center gap-2">
                            <span
                              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                              title="Drag to reorder header"
                              data-testid={`grip-handle-${item.id}`}
                            >
                              <GripVertical size={16} />
                            </span>
                            <span className="text-base">📘</span>
                            <span className="text-xs font-bold text-foreground dark:text-white" data-testid={`text-header-title-${item.id}`}>
                              {item.name}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground dark:bg-[#162235] dark:text-[#87CEEB]">
                              Header ({children.length})
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveTopItem(idx, 'up')}
                              disabled={idx === 0}
                              title="Move Header Up"
                              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 dark:hover:bg-[#2d425c]"
                              data-testid={`button-move-up-${item.id}`}
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveTopItem(idx, 'down')}
                              disabled={idx === subGoals.length - 1}
                              title="Move Header Down"
                              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 dark:hover:bg-[#2d425c]"
                              data-testid={`button-move-down-${item.id}`}
                            >
                              <ArrowDown size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveTopItem(item.id)}
                              title="Remove Header"
                              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-red-950/40 dark:hover:text-red-300"
                              data-testid={`button-remove-header-${item.id}`}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Children Subtopics List */}
                        <div className="ml-3 mt-2 space-y-1.5 border-l-2 border-[#5aaed6]/30 dark:border-[#87CEEB]/30 pl-3">
                          {children.map((child, childIdx) => {
                            const isChildDragging = draggedInfo?.id === child.id;
                            const isChildDragOver = dragOverId === child.id;

                            return (
                              <div
                                key={child.id}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  setDraggedInfo({ id: child.id, type: 'child', parentHeaderId: item.id });
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (dragOverId !== child.id) setDragOverId(child.id);
                                }}
                                onDragLeave={(e) => {
                                  e.stopPropagation();
                                  if (dragOverId === child.id) setDragOverId(null);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDropOnItem(child.id, item.id);
                                }}
                                onDragEnd={() => {
                                  setDraggedInfo(null);
                                  setDragOverId(null);
                                }}
                                className={`flex items-center justify-between gap-2 rounded-lg border transition-all duration-150 px-2.5 py-1.5 text-xs ${
                                  isChildDragging
                                    ? 'opacity-40 border-dashed border-[#5aaed6]'
                                    : isChildDragOver
                                    ? 'ring-2 ring-[#87CEEB] bg-[#e0f2fe]/80 dark:bg-[#20364f]'
                                    : 'border-border/40 bg-background/60 dark:border-[#2d425c] dark:bg-[#162235]/60'
                                }`}
                                data-testid={`target-subtopic-item-${child.id}`}
                              >
                                <span
                                  className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                                  title="Drag subtopic"
                                  data-testid={`grip-handle-${child.id}`}
                                >
                                  <GripVertical size={14} />
                                </span>
                                <label className="flex flex-1 cursor-pointer items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={child.completed}
                                    onChange={() => handleToggleSubtopicInForm(child.id)}
                                    className="size-3.5 rounded border-gray-300 text-primary focus:ring-[#87CEEB]"
                                    data-testid={`checkbox-subtopic-${child.id}`}
                                  />
                                  <span className={`font-medium ${child.completed ? 'line-through text-muted-foreground dark:text-slate-400' : 'text-foreground dark:text-white'}`}>
                                    {child.name}
                                  </span>
                                </label>

                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveChildItem(item.id, childIdx, 'up')}
                                    disabled={childIdx === 0}
                                    title="Move Up"
                                    className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 dark:hover:bg-[#2d425c]"
                                    data-testid={`button-move-up-${child.id}`}
                                  >
                                    <ArrowUp size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveChildItem(item.id, childIdx, 'down')}
                                    disabled={childIdx === children.length - 1}
                                    title="Move Down"
                                    className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 dark:hover:bg-[#2d425c]"
                                    data-testid={`button-move-down-${child.id}`}
                                  >
                                    <ArrowDown size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveChildItem(item.id, child.id)}
                                    title="Remove Subtopic"
                                    className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive dark:hover:bg-[#2d425c]"
                                    data-testid={`button-remove-subtopic-${child.id}`}
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Inline Add Subtopic under this Header */}
                          <div className="mt-2 flex items-center gap-2 pt-1">
                            <input
                              value={inlineText}
                              onChange={(e) =>
                                setInlineSubtopicInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (inlineText.trim()) {
                                    handleAddSubtopic(item.id, inlineText);
                                    setInlineSubtopicInputs((prev) => ({ ...prev, [item.id]: '' }));
                                  }
                                }
                              }}
                              placeholder={`Add subtopic under ${item.name}...`}
                              className="h-8 flex-1 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-1 focus:ring-[#87CEEB]"
                              data-testid={`input-inline-subtopic-${item.id}`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (inlineText.trim()) {
                                  handleAddSubtopic(item.id, inlineText);
                                  setInlineSubtopicInputs((prev) => ({ ...prev, [item.id]: '' }));
                                }
                              }}
                              disabled={!inlineText.trim()}
                              className="h-8 rounded-lg bg-[#5aaed6]/80 px-2.5 text-[11px] font-bold text-[#0f2d3d] transition-colors hover:bg-[#5aaed6] disabled:opacity-40 dark:bg-[#87CEEB]/80 dark:text-[#0a2533] dark:hover:bg-[#87CEEB]"
                              data-testid={`button-add-inline-subtopic-${item.id}`}
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Standalone Subtopic (Not under a header)
                  const isDragging = draggedInfo?.id === item.id;
                  const isDragOver = dragOverId === item.id;

                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDraggedInfo({ id: item.id, type: 'top' });
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragOverId !== item.id) setDragOverId(item.id);
                      }}
                      onDragLeave={(e) => {
                        e.stopPropagation();
                        if (dragOverId === item.id) setDragOverId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDropOnItem(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggedInfo(null);
                        setDragOverId(null);
                      }}
                      className={`flex items-center justify-between gap-2.5 rounded-lg border transition-all duration-150 px-3 py-2 text-xs font-medium text-foreground ${
                        isDragging
                          ? 'opacity-40 border-dashed border-[#5aaed6]'
                          : isDragOver
                          ? 'ring-2 ring-[#87CEEB] bg-[#e0f2fe]/80 dark:bg-[#20364f]'
                          : 'border-border/60 bg-card dark:border-[#2d425c] dark:bg-[#1f2d3d] dark:text-white'
                      }`}
                      data-testid={`target-item-${item.id}`}
                    >
                      <span
                        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                        title="Drag item"
                        data-testid={`grip-handle-${item.id}`}
                      >
                        <GripVertical size={15} />
                      </span>
                      <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => handleToggleSubtopicInForm(item.id)}
                          className="size-4 rounded border-gray-300 text-primary focus:ring-[#87CEEB]"
                          data-testid={`checkbox-target-item-${item.id}`}
                        />
                        <span className={item.completed ? 'line-through text-muted-foreground dark:text-slate-400' : ''}>
                          {item.name}
                        </span>
                      </label>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveTopItem(idx, 'up')}
                          disabled={idx === 0}
                          title="Move Up"
                          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 dark:hover:bg-[#2d425c]"
                          data-testid={`button-move-up-${item.id}`}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveTopItem(idx, 'down')}
                          disabled={idx === subGoals.length - 1}
                          title="Move Down"
                          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 dark:hover:bg-[#2d425c]"
                          data-testid={`button-move-down-${item.id}`}
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveTopItem(item.id)}
                          title="Remove Item"
                          className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive dark:text-slate-400 dark:hover:bg-[#2d425c]"
                          data-testid={`button-remove-target-item-${item.id}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <button type="submit" disabled={!canSubmit} className="mt-7 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#87CEEB] dark:text-[#0a2533] dark:hover:bg-[#72c2e6]" data-testid="button-submit-goal">{initialGoal ? 'Save changes' : 'Add to my list'} <ArrowRight size={16} /></button>
      </form>
    </div>
  );
}

function EventForm({
  initialEvent,
  onClose,
  onSubmit,
}: {
  initialEvent?: EventItem | null;
  onClose: () => void;
  onSubmit: (name: string, datetime: string, recurrence?: EventRecurrence) => void;
}) {
  const [name, setName] = useState(initialEvent ? initialEvent.name : '');
  const [datetime, setDatetime] = useState(initialEvent ? initialEvent.datetime : '');
  const [recurrence, setRecurrence] = useState<EventRecurrence>(initialEvent?.recurrence || 'none');

  const canSubmit = name.trim().length > 1 && datetime.length > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(name.trim(), datetime, recurrence);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-sidebar/50 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-[#b9ddeb] bg-card p-6 shadow-2xl rise-in dark:border-[#38587a] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="event-form-title">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">{initialEvent ? 'Edit countdown' : 'New countdown'}</p>
            <h2 id="event-form-title" className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl">{initialEvent ? 'Update event details' : 'What are you looking forward to?'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close event form" className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-[#eaf7fc] dark:text-[#D1D5DB] dark:hover:bg-[#162235]" data-testid="button-close-event-form"><X size={20} /></button>
        </div>
        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="event-name" className="text-sm font-bold text-foreground dark:text-white">Event name</label>
            <input id="event-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sarah's Birthday, Anniversary" className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-event-name" />
          </div>
          <div>
            <label htmlFor="event-datetime" className="text-sm font-bold text-foreground dark:text-white">Date and time</label>
            <input id="event-datetime" type="datetime-local" value={datetime} onChange={(event) => setDatetime(event.target.value)} className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-event-datetime" />
          </div>
          <div>
            <label className="text-sm font-bold text-foreground dark:text-white">Recurrence / Repeat</label>
            <div className="mt-2 grid grid-cols-4 gap-2" data-testid="recurrence-options">
              {(['none', 'weekly', 'monthly', 'yearly'] as EventRecurrence[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecurrence(r)}
                  className={`min-h-[40px] rounded-xl text-xs font-bold capitalize transition-colors ${
                    recurrence === r
                      ? 'bg-[#5aaed6] text-[#173849] dark:bg-[#87CEEB] dark:text-[#0a2533]'
                      : 'border border-input bg-background text-muted-foreground hover:bg-muted dark:bg-[#162235] dark:text-[#D1D5DB]'
                  }`}
                  data-testid={`button-recurrence-${r}`}
                >
                  {r === 'none' ? 'One-time' : r}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button type="submit" disabled={!canSubmit} className="mt-7 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-3 text-sm font-bold text-[#173849] dark:text-[#0a2533] transition-colors hover:bg-[#72bde0] dark:hover:bg-[#72c2e6] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-submit-event">{initialEvent ? 'Save event' : 'Start countdown'} <ArrowRight size={16} /></button>
      </form>
    </div>
  );
}

function LoggerGoalForm({
  categories,
  onClose,
  onSubmit,
  onAddCategory,
}: {
  categories: string[];
  onClose: () => void;
  onSubmit: (name: string, targetHours: number, category: LoggerCategory) => void;
  onAddCategory: (categoryName: string) => void;
}) {
  const [name, setName] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0] || 'Study');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);

  const parsedHours = Number(targetHours);
  const activeCategory = isAddingNewCategory && newCategoryInput.trim() ? newCategoryInput.trim() : selectedCategory;
  const canSubmit = name.trim().length > 1 && Number.isFinite(parsedHours) && parsedHours > 0 && Boolean(activeCategory);

  function handleAddNewCategory() {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    onAddCategory(trimmed);
    setSelectedCategory(trimmed);
    setNewCategoryInput('');
    setIsAddingNewCategory(false);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let finalCat = selectedCategory;
    if (isAddingNewCategory && newCategoryInput.trim()) {
      finalCat = newCategoryInput.trim();
      onAddCategory(finalCat);
    }
    if (canSubmit) {
      onSubmit(name.trim(), parsedHours, finalCat);
    }
  }

  const categoryStyle = getCategoryStyle(activeCategory);
  const CategoryTagIcon = categoryStyle.icon;

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
            <input id="logger-goal-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Study Math, Master React" className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-logger-goal-name" />
          </div>

          <div>
            <label htmlFor="logger-target-hours" className="text-sm font-bold text-foreground dark:text-white">Target hours</label>
            <input id="logger-target-hours" type="number" inputMode="decimal" min="0.25" step="0.25" value={targetHours} onChange={(event) => setTargetHours(event.target.value)} placeholder="e.g. 100" className="mt-2 min-h-[44px] w-full rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]" data-testid="input-logger-target-hours" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="logger-category" className="text-sm font-bold text-foreground dark:text-white">Category</label>
              <button
                type="button"
                onClick={() => setIsAddingNewCategory((prev) => !prev)}
                className="text-xs font-bold text-[#2e7799] hover:underline dark:text-[#87CEEB]"
                data-testid="button-toggle-add-category"
              >
                {isAddingNewCategory ? 'Select existing' : '+ Add new category'}
              </button>
            </div>

            {!isAddingNewCategory ? (
              <div className="mt-2 space-y-3">
                <div className="relative">
                  <select
                    id="logger-category"
                    value={selectedCategory}
                    onChange={(event) => {
                      if (event.target.value === '__add_new__') {
                        setIsAddingNewCategory(true);
                      } else {
                        setSelectedCategory(event.target.value);
                      }
                    }}
                    className="min-h-[44px] w-full appearance-none rounded-xl border border-input bg-background px-4 py-3 pr-10 text-base sm:text-sm font-semibold text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c]"
                    data-testid="select-logger-category"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__add_new__">+ Add new category...</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-muted-foreground dark:text-slate-400" size={17} />
                </div>

                {/* Category Selection Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1" data-testid="container-category-pills">
                  {categories.map((cat) => {
                    const style = getCategoryStyle(cat);
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                          isSelected
                            ? `${style.soft} ${style.ink} ${style.darkSoft} ${style.darkInk} ring-2 ring-[#5aaed6] dark:ring-[#87CEEB]`
                            : 'border border-input bg-background/60 text-muted-foreground hover:bg-muted dark:bg-[#162235] dark:text-[#D1D5DB]'
                        }`}
                        data-testid={`pill-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <Tag size={12} />
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="New category (e.g. Design, Reading)"
                    className="min-h-[44px] flex-1 rounded-xl border border-input bg-background px-4 py-3 text-base sm:text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
                    data-testid="input-add-new-category"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddNewCategory();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddNewCategory}
                    disabled={!newCategoryInput.trim()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#5aaed6] px-4 py-3 text-xs font-bold text-[#173849] transition-all hover:bg-[#72bde0] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#87CEEB] dark:text-[#0a2533] dark:hover:bg-[#72c2e6]"
                    data-testid="button-save-new-category"
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
                <p className="text-xs text-muted-foreground dark:text-[#D1D5DB]">
                  New category will be saved and available for future goals.
                </p>
              </div>
            )}

            {/* Live Preview Tag */}
            {activeCategory && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground dark:text-[#D1D5DB]">Category tag preview:</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${categoryStyle.soft} ${categoryStyle.ink} ${categoryStyle.darkSoft} ${categoryStyle.darkInk}`} data-testid="badge-category-preview">
                  <CategoryTagIcon size={12} />
                  {activeCategory}
                </span>
              </div>
            )}
          </div>
        </div>

        <button type="submit" disabled={!canSubmit} className="mt-7 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#5aaed6] dark:bg-[#87CEEB] px-4 py-3 text-sm font-bold text-[#173849] dark:text-[#0a2533] transition-colors hover:bg-[#72bde0] dark:hover:bg-[#72c2e6] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-submit-logger-goal">Create timer goal <ArrowRight size={16} /></button>
      </form>
    </div>
  );
}

function CategoryManagerModal({
  categories,
  goals,
  onClose,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
}: {
  categories: string[];
  goals: LoggerGoal[];
  onClose: () => void;
  onAddCategory: (name: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (name: string) => void;
}) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const categoryCounts = useMemo(() => {
    return categories.reduce<Record<string, number>>((acc, cat) => {
      acc[cat] = goals.filter((g) => g.category === cat).length;
      return acc;
    }, {});
  }, [categories, goals]);

  function handleAdd() {
    if (!newCategoryName.trim()) return;
    onAddCategory(newCategoryName.trim());
    setNewCategoryName('');
  }

  function handleSaveRename(cat: string) {
    if (!editName.trim() || editName.trim() === cat) {
      setEditingCategory(null);
      return;
    }
    onRenameCategory(cat, editName.trim());
    setEditingCategory(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-sidebar/50 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-[#b9ddeb] bg-card p-6 shadow-2xl rise-in dark:border-[#38587a] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]">Organization</p>
            <h2 id="category-manager-title" className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl">Manage Custom Categories</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close category manager" className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-[#eaf7fc] dark:text-[#D1D5DB] dark:hover:bg-[#162235]" data-testid="button-close-category-manager">
            <X size={20} />
          </button>
        </div>

        {/* Add new category */}
        <div className="mt-6 rounded-2xl border border-input bg-background/50 p-4 dark:bg-[#162235]/60 dark:border-[#2d425c]">
          <label htmlFor="new-category-input" className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-[#D1D5DB]">
            Add New Category
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="new-category-input"
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Design, Languages, Music"
              className="min-h-[44px] flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#87CEEB]"
              data-testid="input-manage-new-category"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newCategoryName.trim()}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#5aaed6] px-4 py-2.5 text-xs font-bold text-[#173849] transition-all hover:bg-[#72bde0] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#87CEEB] dark:text-[#0a2533] dark:hover:bg-[#72c2e6]"
              data-testid="button-manage-add-category"
            >
              <Plus size={16} /> Add
            </button>
          </div>
        </div>

        {/* Categories List */}
        <div className="mt-6 space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-[#D1D5DB]">
            Saved Categories ({categories.length})
          </p>

          <div className="divide-y divide-border/60 rounded-2xl border border-border bg-card dark:border-[#2d425c] dark:bg-[#192638]">
            {categories.map((cat) => {
              const style = getCategoryStyle(cat);
              const count = categoryCounts[cat] || 0;
              const isEditing = editingCategory === cat;
              const CatIcon = style.icon;

              return (
                <div key={cat} className="flex items-center justify-between gap-3 p-3.5" data-testid={`category-row-${cat.replace(/\s+/g, '-').toLowerCase()}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${style.soft} ${style.ink} ${style.darkSoft} ${style.darkInk}`}>
                      <CatIcon size={16} />
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] focus:outline-none focus:ring-1 focus:ring-[#87CEEB]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(cat);
                            if (e.key === 'Escape') setEditingCategory(null);
                          }}
                          data-testid={`input-rename-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(cat)}
                          className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#5aaed6] text-white dark:bg-[#87CEEB] dark:text-[#0a2533]"
                          title="Save category name"
                          data-testid={`button-save-rename-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-display text-base font-bold text-foreground dark:text-white truncate">
                            {cat}
                          </h4>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.soft} ${style.ink} ${style.darkSoft} ${style.darkInk}`}>
                            {count} {count === 1 ? 'goal' : 'goals'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(cat);
                          setEditName(cat);
                        }}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground dark:text-[#D1D5DB] dark:hover:bg-[#162235]"
                        title="Edit category name"
                        data-testid={`button-edit-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <Pencil size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteCategory(cat)}
                        disabled={count > 0}
                        title={count > 0 ? `Cannot delete category with ${count} active goal(s)` : 'Delete category'}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground dark:text-[#D1D5DB]"
                        data-testid={`button-delete-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-input bg-card px-5 py-2.5 text-xs font-bold text-foreground hover:bg-muted dark:bg-[#162235] dark:text-white dark:border-[#2d425c]"
            data-testid="button-done-category-manager"
          >
            Done
          </button>
        </div>
      </div>
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

function HistoryLogModal({
  sessions,
  onClose,
  onClearHistory,
  onDeleteSession,
  onDeleteSessions,
}: {
  sessions: TimerSession[];
  onClose: () => void;
  onClearHistory: () => void;
  onDeleteSession: (id: string) => void;
  onDeleteSessions: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'longest' | 'shortest'>('newest');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showConfirmBatch, setShowConfirmBatch] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<TimerSession | null>(null);

  const filteredSessions = useMemo(() => {
    let result = sessions.filter((s) =>
      s.goalName.toLowerCase().includes(search.toLowerCase()) ||
      formatSessionDate(s.timestamp).toLowerCase().includes(search.toLowerCase())
    );
    if (sort === 'newest') {
      result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else if (sort === 'oldest') {
      result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (sort === 'longest') {
      result.sort((a, b) => b.durationSeconds - a.durationSeconds);
    } else if (sort === 'shortest') {
      result.sort((a, b) => a.durationSeconds - b.durationSeconds);
    }
    return result;
  }, [sessions, search, sort]);

  const allSelected = filteredSessions.length > 0 && filteredSessions.every((s) => selectedIds.includes(s.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSessions.map((s) => s.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchDelete = () => {
    onDeleteSessions(selectedIds);
    setSelectedIds([]);
    setShowConfirmBatch(false);
  };

  const handleSingleDelete = () => {
    if (sessionToDelete) {
      onDeleteSession(sessionToDelete.id);
      setSelectedIds((prev) => prev.filter((id) => id !== sessionToDelete.id));
      setSessionToDelete(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-sidebar/45 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-[#b9ddeb] bg-card p-5 shadow-2xl rise-in dark:border-[#38587a] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[1.75rem] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="history-modal-title" data-testid="history-log-modal">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#2e7799] dark:text-[#87CEEB]"><History size={15} /> Your record</p>
            <h2 id="history-modal-title" className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-4xl">History Log</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-[#D1D5DB] sm:mt-2 sm:text-sm">Manage, search, and selectively delete past timer session entries.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close history log" className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[#eaf7fc] hover:text-[#2e7799] dark:text-[#D1D5DB] dark:hover:bg-[#162235] dark:hover:text-[#87CEEB]" data-testid="button-close-history"><X size={20} /></button>
        </div>

        {/* Filter and Search controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-3 text-muted-foreground dark:text-slate-400" />
            <input
              type="text"
              placeholder="Search sessions by goal or date..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c] dark:placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#87CEEB]"
              data-testid="input-history-search"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium text-foreground dark:bg-[#162235] dark:text-white dark:border-[#2d425c]"
            data-testid="select-history-sort"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="longest">Longest Session</option>
            <option value="shortest">Shortest Session</option>
          </select>
        </div>

        {/* Action Header */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#dcecf3] pb-3 dark:border-[#38587a]">
          <div className="flex items-center gap-3">
            {filteredSessions.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground dark:text-[#D1D5DB]"
                data-testid="checkbox-select-all-sessions"
              >
                {allSelected ? <CheckCircle2 size={16} className="text-[#2e7799] dark:text-[#87CEEB]" /> : <Square size={16} />}
                <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
            )}
            <span className="text-xs font-semibold text-muted-foreground dark:text-[#D1D5DB]">
              Showing {filteredSessions.length} of {sessions.length} sessions
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirmBatch(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/15 px-3.5 py-1.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/25 dark:border-destructive/60 dark:bg-destructive/25 dark:text-[#f87171]"
                data-testid="button-delete-selected-sessions"
              >
                <Trash2 size={13} /> Delete Selected ({selectedIds.length})
              </button>
            )}
            {sessions.length > 0 && selectedIds.length === 0 && (
              <button
                type="button"
                onClick={() => setShowConfirmClear(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3.5 py-1.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/20 dark:border-destructive/50 dark:bg-destructive/20 dark:text-[#f87171]"
                data-testid="button-clear-history"
              >
                <Trash2 size={13} /> Clear History
              </button>
            )}
          </div>
        </div>

        {/* Confirmation Banners */}
        {showConfirmBatch && (
          <div className="my-3 rounded-2xl border border-destructive/30 bg-[#fef2f2] p-4 rise-in dark:border-destructive/40 dark:bg-[#3b1719]" role="alertdialog">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive"><Trash2 size={17} /></div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-foreground dark:text-white">Delete {selectedIds.length} selected session logs?</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground dark:text-[#D1D5DB]">These {selectedIds.length} session entries will be permanently deleted from your history log.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={handleBatchDelete} className="rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5" data-testid="button-confirm-batch-delete">Yes, delete selected</button>
                  <button type="button" onClick={() => setShowConfirmBatch(false)} className="rounded-xl border border-input bg-card px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted dark:text-white dark:border-[#2d425c]" data-testid="button-cancel-batch-delete">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showConfirmClear && (
          <div className="my-3 rounded-2xl border border-destructive/30 bg-[#fef2f2] p-4 rise-in dark:border-destructive/40 dark:bg-[#3b1719]" role="alertdialog">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive"><Trash2 size={17} /></div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-foreground dark:text-white">Wipe all session logs?</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground dark:text-[#D1D5DB]">This will permanently remove all {sessions.length} recorded timer session logs.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => { onClearHistory(); setShowConfirmClear(false); setSelectedIds([]); }} className="rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5" data-testid="button-confirm-clear-history">Yes, clear all</button>
                  <button type="button" onClick={() => setShowConfirmClear(false)} className="rounded-xl border border-input bg-card px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted dark:text-white dark:border-[#2d425c]" data-testid="button-cancel-clear-history">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sessionToDelete && (
          <div className="my-3 rounded-2xl border border-destructive/30 bg-[#fef2f2] p-4 rise-in dark:border-destructive/40 dark:bg-[#3b1719]" role="alertdialog">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive"><Trash2 size={17} /></div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-foreground dark:text-white">Delete session log entry?</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground dark:text-[#D1D5DB]">
                  Remove "{sessionToDelete.goalName}" log entry from {formatSessionDate(sessionToDelete.timestamp)} ({formatDurationHM(sessionToDelete.durationSeconds)})?
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={handleSingleDelete} className="rounded-xl bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5" data-testid="button-confirm-single-delete">Delete</button>
                  <button type="button" onClick={() => setSessionToDelete(null)} className="rounded-xl border border-input bg-card px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted dark:text-white dark:border-[#2d425c]" data-testid="button-cancel-single-delete">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="app-scroll mt-4 max-h-[50vh] space-y-2.5 overflow-y-auto pr-1" data-testid="history-sessions-list">
          {filteredSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#b9ddeb] bg-[#eaf7fc]/50 px-6 py-12 text-center dark:border-[#38587a] dark:bg-[#162235]/50" data-testid="history-empty-state">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#c9ebf8] text-[#2e7799] dark:bg-[#283e52] dark:text-[#87CEEB]"><History size={22} /></div>
              <h3 className="mt-4 font-display text-xl font-bold text-foreground dark:text-white">
                {sessions.length === 0 ? 'No session logs yet' : 'No matching session logs'}
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted-foreground dark:text-[#D1D5DB]">
                {sessions.length === 0 ? 'Completed timer sessions from your Goal Timer Logger will appear here.' : 'Try adjusting your search query or sorting.'}
              </p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isSelected = selectedIds.includes(session.id);
              return (
                <div
                  key={session.id}
                  className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border p-3.5 transition-all ${
                    isSelected
                      ? 'border-[#5aaed6] bg-[#eaf7fc]/70 dark:border-[#87CEEB] dark:bg-[#1f2d3d]'
                      : 'border-[#dcecf3] bg-background/80 hover:border-[#5aaed6] hover:bg-background dark:border-[#38587a] dark:bg-[#162235] dark:hover:border-[#87CEEB]'
                  }`}
                  data-testid={`history-item-${session.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleSelect(session.id)}
                      className="text-muted-foreground hover:text-foreground dark:text-[#D1D5DB]"
                      data-testid={`checkbox-select-session-${session.id}`}
                      aria-label={`Select session for ${session.goalName}`}
                    >
                      {isSelected ? <CheckCircle2 size={18} className="text-[#2e7799] dark:text-[#87CEEB]" /> : <Square size={18} />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-display text-base font-bold text-foreground dark:text-white" data-testid={`history-goal-name-${session.id}`}>{session.goalName}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground dark:text-[#D1D5DB]" data-testid={`history-date-${session.id}`}>{formatSessionDate(session.timestamp)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {session.plannedMinutes && session.plannedMinutes > 0 ? (
                      <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground dark:bg-[#1f2d3d] dark:text-[#D1D5DB]" data-testid={`history-planned-${session.id}`}>
                        Target: {formatMinutes(session.plannedMinutes)}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf7fc] px-3 py-1.5 font-mono-d text-xs font-bold text-[#2e7799] dark:bg-[#1f2d3d] dark:text-[#87CEEB]" data-testid={`history-duration-${session.id}`}>
                      <Timer size={13} /> {formatDurationHM(session.durationSeconds)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSessionToDelete(session)}
                      className="grid size-8 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:text-[#D1D5DB] dark:hover:bg-destructive/20 dark:hover:text-[#f87171]"
                      data-testid={`button-delete-session-${session.id}`}
                      aria-label={`Delete session log for ${session.goalName}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })
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