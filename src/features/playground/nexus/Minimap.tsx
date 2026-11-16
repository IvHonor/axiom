// Nexus's minimap: the districts, the roads, what's solid, the buildings'
// doors, everyone near (a dot each, friends brighter), you (an arrow pointing
// your way) and where the camera looks. Inside a building it's that room's
// plan instead, with its way out. Click it to walk there.
import { useEffect, useRef } from "react";
import type { Interior } from "./interiors";
import { INTERIORS } from "./interiors";
import type { Solid } from "./walkmap";
import { DISTRICTS, HALF, SOLIDS, STAIRS, TERRACES, type Point } from "./world";
import { LIFTS, SPANS } from "./routes";
import { fromStair } from "./levels";

interface MinimapProps {
  size: number;
  me: () => { x: number; z: number; heading: number };
  view: () => { yaw: number };
  discovered: Set<string>;
  /** Everyone near you, where they're drawn. */
  people?: () => { x: number; z: number; friend: boolean }[];
  /** The building you're inside, if any. */
  place?: () => Interior | null;
  onWalk: (p: Point) => void;
}

/** How map spots become minimap pixels, for the city or a room. */
function frame(size: number, room: Interior | null) {
  const half = room ? Math.max(room.halfW, room.halfD) + 1 : HALF;
  const scale = size / (half * 2);
  return { scale, px: (v: number) => (v + half) * scale, back: (p: number) => p / scale - half };
}

export function Minimap({ size, me, view, discovered, people, place, onWalk }: MinimapProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = size * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const solids = (list: Solid[], px: (v: number) => number, scale: number) => {
      for (const s of list) {
        if (s.kind === "circle") {
          g.beginPath();
          g.arc(px(s.x), px(s.z), Math.max(1, s.r * scale), 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(px(s.x - s.w / 2), px(s.z - s.d / 2), Math.max(1, s.w * scale), Math.max(1, s.d * scale));
      }
    };
    const ring = (x: number, z: number, color: string, r: number) => {
      g.beginPath();
      g.arc(x, z, r, 0, Math.PI * 2);
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.shadowColor = color;
      g.shadowBlur = 6;
      g.stroke();
      g.shadowBlur = 0;
    };
    const draw = () => {
      const room = place?.() ?? null;
      const { scale, px } = frame(size, room);
      g.clearRect(0, 0, size, size);
      g.fillStyle = "rgba(5, 9, 22, 0.88)";
      g.fillRect(0, 0, size, size);
      if (room) {
        // The room: its floor, what's in it, and the way out.
        g.fillStyle = `${room.color}1f`;
        g.strokeStyle = room.color;
        g.lineWidth = 1.2;
        g.beginPath();
        if (room.round) g.arc(px(0), px(0), room.round * scale, 0, Math.PI * 2);
        else g.rect(px(-room.halfW), px(-room.halfD), room.halfW * 2 * scale, room.halfD * 2 * scale);
        g.fill();
        g.stroke();
        g.fillStyle = "rgba(160, 180, 220, 0.6)";
        solids(room.solids, px, scale);
        ring(px(room.door.x), px(room.door.z), room.color, 4);
      } else {
        // The routes between the islands, each in its own colour, and the lift's way up (dashed).
        g.lineCap = "round";
        for (const r of SPANS) {
          g.beginPath();
          r.points.forEach((p, i) => (i ? g.lineTo(px(p.x), px(p.z)) : g.moveTo(px(p.x), px(p.z))));
          g.strokeStyle = `${r.color}cc`;
          g.lineWidth = Math.max(2, r.width * scale);
          g.stroke();
        }
        for (const l of LIFTS) {
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(px(l.a.x), px(l.a.z));
          g.lineTo(px(l.b.x), px(l.b.z));
          g.strokeStyle = `${l.color}dd`;
          g.lineWidth = 1.5;
          g.stroke();
          g.setLineDash([]);
        }
        for (const d of DISTRICTS) {
          const seen = discovered.has(d.id);
          g.beginPath();
          g.arc(px(d.center.x), px(d.center.z), d.radius * scale, 0, Math.PI * 2);
          g.fillStyle = seen ? `${d.color}22` : "rgba(255,255,255,0.03)";
          g.fill();
          g.strokeStyle = seen ? d.color : "rgba(255,255,255,0.18)";
          g.lineWidth = 1.2;
          g.stroke();
        }
        // Raised ground, a shade lighter, and the stairs up to it.
        g.fillStyle = "rgba(143, 196, 255, 0.16)";
        for (const t of TERRACES) {
          g.beginPath();
          if (t.kind === "circle") g.arc(px(t.x), px(t.z), t.r * scale, 0, Math.PI * 2);
          else g.rect(px(t.x - t.w / 2), px(t.z - t.d / 2), t.w * scale, t.d * scale);
          g.fill();
        }
        for (const s of STAIRS) {
          const corners = [fromStair(s, 0, -s.width / 2), fromStair(s, 0, s.width / 2), fromStair(s, s.length, s.width / 2), fromStair(s, s.length, -s.width / 2)];
          g.beginPath();
          corners.forEach((c, i) => (i ? g.lineTo(px(c.x), px(c.z)) : g.moveTo(px(c.x), px(c.z))));
          g.closePath();
          g.fill();
        }
        g.fillStyle = "rgba(160, 180, 220, 0.55)";
        // The balustrade posts are too small to show; everything else is drawn.
        solids(SOLIDS.filter((s) => !(s.kind === "circle" && s.r < 0.5)), px, scale);
        // The buildings' doors, once their district's been found.
        for (const r of INTERIORS) if (discovered.has(r.district)) ring(px(r.outside.door.x), px(r.outside.door.z), r.color, 2.5);
      }
      // Everyone near: friends in gold, everyone else a soft dot.
      for (const p of people?.() ?? []) {
        g.beginPath();
        g.arc(px(p.x), px(p.z), p.friend ? 3 : 2.2, 0, Math.PI * 2);
        g.fillStyle = p.friend ? "#ffd166" : "rgba(220, 235, 255, 0.85)";
        g.shadowColor = p.friend ? "#ffd166" : "transparent";
        g.shadowBlur = p.friend ? 6 : 0;
        g.fill();
      }
      g.shadowBlur = 0;
      // Where the camera looks: a soft wedge.
      const m = me(), yaw = view().yaw;
      const cx = px(m.x), cz = px(m.z);
      // The camera sits behind you at (sin yaw, cos yaw) and looks the other way.
      const ahead = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
      g.beginPath();
      g.moveTo(cx, cz);
      g.arc(cx, cz, 26, ahead - 0.55, ahead + 0.55);
      g.closePath();
      g.fillStyle = "rgba(143, 196, 255, 0.16)";
      g.fill();
      // You: an arrow.
      g.save();
      g.translate(cx, cz);
      g.rotate(-m.heading + Math.PI);
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(4.5, 5);
      g.lineTo(0, 2.5);
      g.lineTo(-4.5, 5);
      g.closePath();
      g.fillStyle = "#ffffff";
      g.shadowColor = "#8fc4ff";
      g.shadowBlur = 8;
      g.fill();
      g.restore();
    };
    draw();
    const every = window.setInterval(draw, 100);
    return () => window.clearInterval(every);
  }, [size, me, view, discovered, people, place]);

  return (
    <canvas
      ref={canvas}
      className="nx-minimap"
      style={{ width: size, height: size }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const { back } = frame(size, place?.() ?? null);
        onWalk({ x: back(((e.clientX - r.left) / r.width) * size), z: back(((e.clientY - r.top) / r.height) * size) });
      }}
      aria-label="Map. Click somewhere to walk there."
      role="img"
    />
  );
}
