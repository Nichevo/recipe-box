import { useEffect, useRef, useState } from "react";
import { aiNutrition, withoutNutrition } from "../api";

/** Settings: work out nutrition for every recipe that doesn't have it yet, one at a time. */
export function NutritionAll() {
  const [todo, setTodo] = useState<{ id: string; title: string }[] | null>(null);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  useEffect(() => {
    withoutNutrition().then(setTodo).catch(() => setTodo([]));
  }, []);
  if (!todo) return null;
  const run = async () => {
    setRunning(true);
    stop.current = false;
    for (const r of todo) {
      if (stop.current) break;
      try {
        await aiNutrition(r.id);
        setDone((d) => d + 1);
      } catch {
        setFailed((f) => f + 1);
      }
    }
    setRunning(false);
    withoutNutrition().then(setTodo).catch(() => {});
  };
  return (
    <p className="small">
      {todo.length ? (
        <>
          {todo.length} recipe{todo.length === 1 ? "" : "s"} without nutrition.{" "}
          {running ? (
            <>
              Working… {done} done{failed ? `, ${failed} failed` : ""}.{" "}
              <button className="link" onClick={() => (stop.current = true)}>Stop</button>
            </>
          ) : (
            <button className="link" onClick={() => void run()}>
              Work them all out
            </button>
          )}{" "}
          <span className="muted">(about a cent or two each with Claude; uses whatever AI is on)</span>
        </>
      ) : (
        <span className="muted">Every recipe with ingredients has nutrition.{done ? ` Worked out ${done}.` : ""}</span>
      )}
    </p>
  );
}
