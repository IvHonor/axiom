// The Playground's sky: a slowly drifting neural network. Nodes link when
// near, data packets run along the links in the colours of the Lemmas on the
// board, and now and then a node fires. Below it, a holographic floor (CSS).
// Still with reduced motion; paused when hidden or scrolled away.
import { useEffect, useRef } from "react";

interface Node { x: number; y: number; vx: number; vy: number; r: number; color: number; fired: number }
interface Packet { from: number; to: number; t: number; speed: number; color: number }

/** Any CSS colour (a variable too) as the rgb() the canvas understands. */
function resolve(colors: string[], host: HTMLElement): string[] {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const out = colors.map((c) => {
    probe.style.color = "";
    probe.style.color = c;
    return getComputedStyle(probe).color || "rgb(46, 196, 255)";
  });
  probe.remove();
  return out;
}

const withAlpha = (rgb: string, a: number) => rgb.replace(/^rgba?\(([^)]+?)(?:,\s*[\d.]+)?\)$/, (_, inner) => `rgba(${inner.split(",").slice(0, 3).join(",")}, ${a})`);

export function Backdrop({ colors, reducedMotion = false }: { colors: string[]; reducedMotion?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const palette = useRef<string[]>([]);
  const key = colors.join("|");

  useEffect(() => {
    const el = canvas.current;
    if (el) palette.current = resolve(["var(--accent)", ...colors], el.parentElement ?? el);
  }, [key]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let nodes: Node[] = [];
    let packets: Packet[] = [];
    let w = 0, h = 0, frame = 0, last = performance.now(), visible = true, spawn = 0;
    const link = () => Math.min(180, Math.max(110, Math.hypot(w, h) / 9));

    const seed = () => {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = rect.width;
      h = rect.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(70, Math.max(22, (w * h) / 16000)));
      nodes = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.78,
        vx: (Math.random() - 0.5) * 0.012,
        vy: (Math.random() - 0.5) * 0.012,
        r: 1 + Math.random() * 1.8,
        color: i % Math.max(1, palette.current.length),
        fired: 0,
      }));
      packets = [];
    };

    const draw = (dt: number) => {
      const colors = palette.current.length ? palette.current : ["rgb(46,196,255)"];
      ctx.clearRect(0, 0, w, h);
      const reach = link();
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h * 0.78;
        if (n.y > h * 0.8) n.y = -20;
        n.fired = Math.max(0, n.fired - dt / 900);
      }
      // Links, fading with distance.
      const near: [number, number][] = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > reach) continue;
          near.push([i, j]);
          ctx.strokeStyle = withAlpha(colors[a.color % colors.length], (1 - d / reach) * 0.16);
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      // New packets, now and then.
      spawn -= dt;
      if (spawn <= 0 && near.length && packets.length < 26) {
        const [i, j] = near[Math.floor(Math.random() * near.length)];
        const [from, to] = Math.random() < 0.5 ? [i, j] : [j, i];
        packets.push({ from, to, t: 0, speed: 0.0006 + Math.random() * 0.0009, color: nodes[from].color });
        spawn = 140 + Math.random() * 260;
      }
      packets = packets.filter((p) => {
        p.t += p.speed * dt;
        const a = nodes[p.from], b = nodes[p.to];
        if (p.t >= 1) {
          b.fired = 1;
          return false;
        }
        const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
        const c = colors[p.color % colors.length];
        const tail = 0.08;
        ctx.strokeStyle = withAlpha(c, 0.75);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(a.x + (b.x - a.x) * Math.max(0, p.t - tail), a.y + (b.y - a.y) * Math.max(0, p.t - tail));
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = withAlpha(c, 0.95);
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      for (const n of nodes) {
        const c = colors[n.color % colors.length];
        if (n.fired > 0) {
          ctx.strokeStyle = withAlpha(c, n.fired * 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + (1 - n.fired) * 14, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = withAlpha(c, 0.35 + n.fired * 0.6);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + n.fired * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      draw(dt);
      frame = visible && !document.hidden && !still.matches && !reducedMotion ? requestAnimationFrame(tick) : 0;
    };
    const start = () => {
      if (frame || !visible || document.hidden) return;
      if (still.matches || reducedMotion) return draw(0);
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    seed();
    draw(0);
    start();
    const resized = new ResizeObserver(() => {
      seed();
      draw(0);
    });
    resized.observe(el);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    seen.observe(el);
    const shown = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", shown);
    still.addEventListener("change", shown);
    return () => {
      stop();
      resized.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", shown);
      still.removeEventListener("change", shown);
    };
  }, [reducedMotion]);

  return (
    <div className="pg-backdrop" aria-hidden="true">
      <canvas ref={canvas} className="pg-network" />
      <div className="pg-floor" />
      <div className="pg-scan" />
    </div>
  );
}
