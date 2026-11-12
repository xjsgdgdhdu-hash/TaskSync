import { useCallback, useEffect, useRef, useState } from "react";

const PATHS = {
  home: "M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 7v5l3 2",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  edit: "M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  search: "M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z",
  arrowL: "M19 12H5M11 6l-6 6 6 6",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  logout: "M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9",
  trend: "M4 17l5-5 4 4 7-8M15 8h5v5",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  calendar: "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4",
};

export function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ""} />
    </svg>
  );
}

export function useCountUp(value, duration = 900) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const target = Number(value) || 0;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(target); from.current = target; return;
    }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const v = Math.round(a + (target - a) * (1 - Math.pow(1 - p, 3)));
      setN(v); from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return n;
}

export function CountUp({ value, suffix = "" }) {
  const n = useCountUp(value);
  return <>{n}{suffix}</>;
}

/* Soft light that follows the cursor over cards */
export function useSpotlight() {
  useEffect(() => {
    const sel = ".dash-stat-card,.dash-panel,.projects-overview-card,.project-card,.kanban-stat,.kanban-progress,.kanban-task-card";
    const onMove = (e) => {
      const el = e.target.closest?.(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="confirm-icon"><Icon name="trash" size={22} /></div>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="confirm-danger" onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState(null);
  const ask = useCallback((opts) => new Promise((res) => setState({ ...opts, res })), []);
  const close = (v) => { state?.res(v); setState(null); };
  const dialog = (
    <ConfirmDialog open={!!state} {...(state || {})}
      onConfirm={() => close(true)} onCancel={() => close(false)} />
  );
  return { ask, dialog };
}
