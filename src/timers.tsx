import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { findTimes, formatClock } from "../shared/timers";

interface Timer {
  id: string;
  label: string;
  endsAt: number;
  total: number;
  done: boolean;
}

interface TimersApi {
  timers: Timer[];
  start: (label: string, seconds: number) => void;
  stop: (id: string) => void;
}

const Ctx = createContext<TimersApi | null>(null);

/** A short beep pattern, without needing a sound file. */
function beep() {
  try {
    const ac = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.3);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + t);
      o.stop(ac.currentTime + t + 0.3);
    });
    setTimeout(() => void ac.close(), 1500);
  } catch {
    /* no audio */
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

/** Kitchen timers that keep running while you move between recipes and steps. */
export function TimersProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [, tick] = useState(0);
  const timersRef = useRef(timers);
  timersRef.current = timers;

  useEffect(() => {
    if (!timers.some((t) => !t.done)) return;
    const h = setInterval(() => {
      const now = Date.now();
      if (timersRef.current.some((t) => !t.done && t.endsAt <= now)) {
        beep();
        setTimers((ts) => ts.map((t) => (!t.done && t.endsAt <= now ? { ...t, done: true } : t)));
      }
      tick((n) => n + 1);
    }, 500);
    return () => clearInterval(h);
  }, [timers]);

  const api: TimersApi = {
    timers,
    start: (label, seconds) =>
      setTimers((ts) => [...ts, { id: crypto.randomUUID(), label, endsAt: Date.now() + seconds * 1000, total: seconds, done: false }]),
    stop: (id) => setTimers((ts) => ts.filter((t) => t.id !== id))
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <TimerBar />
    </Ctx.Provider>
  );
}

export const useTimers = () => useContext(Ctx)!;

function TimerBar() {
  const { timers, stop } = useTimers();
  if (!timers.length) return null;
  return (
    <div className="timer-bar" role="status">
      {timers.map((t) => (
        <button key={t.id} className={`timer${t.done ? " done" : ""}`} onClick={() => stop(t.id)} title="Tap to stop">
          <strong>{t.done ? "Done!" : formatClock((t.endsAt - Date.now()) / 1000)}</strong>
          <span>{t.label}</span>
          <span aria-hidden>✕</span>
        </button>
      ))}
    </div>
  );
}

/** "⏱ 25 minutes" buttons for the times mentioned in a step. */
export function StepTimers({ text }: { text: string }) {
  const { start } = useTimers();
  const found = findTimes(text);
  if (!found.length) return null;
  return (
    <span className="step-timers">
      {found.map((t) => (
        <button key={t.seconds} type="button" className="chip timer-chip" onClick={() => start(t.label, t.seconds)}>
          ⏱ {t.label}
        </button>
      ))}
    </span>
  );
}
