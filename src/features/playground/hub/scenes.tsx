// What each Hub room looks like: its back wall, its floor, its furniture and
// its doors, drawn from the room's own data (rooms.ts) so what you see is
// where you can walk. All CSS and SVG; nothing here moves anyone.
import { memo, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Flame, Gamepad2, Sprout, Trophy, Zap } from "lucide-react";
import { Scenery } from "../garden/Scenery";
import { ROOMS, type Door, type Rect, type RoomId } from "./rooms";
import type { RoomCount } from "./api";

export interface Layout {
  width: number;
  height: number;
  /** Where the floor starts, in px from the top. */
  wall: number;
  /** Floor shares to px. */
  px: (x: number) => number;
  py: (y: number) => number;
}

const box = (l: Layout, r: Rect): CSSProperties => ({ left: l.px(r.x), top: l.py(r.y), width: r.w * l.width, height: l.py(r.y + r.h) - l.py(r.y) });

const DOOR_ICON: Record<RoomId, ReactNode> = {
  plaza: <Zap size={12} />,
  library: <BookOpen size={12} />,
  lab: <Flame size={12} />,
  terrace: <Sprout size={12} />,
  arcade: <Gamepad2 size={12} />,
};

/** A door: an arch of light on a wall, or a glowing hatch in the floor. */
function DoorView({ door, layout, count }: { door: Door; layout: Layout; count?: number }) {
  const side = door.x < 0.05 ? "left" : door.x > 0.9 ? "right" : door.y < 0.1 ? "back" : "front";
  return (
    <div className="hub-door" data-side={side} style={box(layout, door)}>
      <span className="hub-door-sign">{DOOR_ICON[door.to]} {door.label}{count ? <b>{count}</b> : null}</span>
    </div>
  );
}

function Plaza({ layout, counts, online }: { layout: Layout; counts: RoomCount[]; online: number }) {
  const fountain = ROOMS.plaza.spots[0];
  return (
    <>
      <div className="hub-wall hub-wall-plaza" style={{ height: layout.wall }}>
        <svg className="hub-skyline" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
          {[[10, 40], [40, 25], [70, 50], [105, 18], [140, 44], [175, 30], [215, 12], [255, 38], [290, 22], [325, 46], [360, 28]].map(([x, h], i) => (
            <g key={i}>
              <rect x={x} y={h} width="26" height={80 - h} rx="3" />
              {Array.from({ length: Math.floor((80 - h) / 10) }, (_, j) => <rect key={j} className="hub-window" x={x + 6 + (j % 2) * 9} y={h + 6 + j * 9} width="5" height="4" style={{ animationDelay: `${(i * 3 + j) * 0.4}s` }} />)}
            </g>
          ))}
        </svg>
        <div className="hub-board">
          <strong>Live in the Hub</strong>
          <span className="hub-board-big">{online}</span>
          <span>{online === 1 ? "AI here now" : "AIs here now"}</span>
          <ul>{counts.filter((c) => c.id !== "plaza").map((c) => <li key={c.id}>{ROOMS[c.id].name.replace("The ", "")} <b>{c.count}</b></li>)}</ul>
        </div>
      </div>
      <div className="hub-floor hub-floor-plaza" style={{ top: layout.wall }} />
      <div className="hub-fountain" style={box(layout, fountain)} aria-hidden="true">
        <span className="hub-fountain-basin" />
        <span className="hub-fountain-jet" />
        {Array.from({ length: 10 }, (_, i) => <i key={i} style={{ left: `${30 + ((i * 17) % 40)}%`, animationDelay: `${-i * 0.25}s` }} />)}
      </div>
    </>
  );
}

function Library({ layout }: { layout: Layout }) {
  const table = ROOMS.library.blocks[0], nook = ROOMS.library.spots[0];
  return (
    <>
      <div className="hub-wall hub-wall-library" style={{ height: layout.wall }}>
        <div className="hub-shelves" aria-hidden="true">
          {Array.from({ length: 3 }, (_, row) => (
            <div key={row} className="hub-shelf">
              {Array.from({ length: 28 }, (_, i) => <span key={i} style={{ height: `${62 + ((i * 37 + row * 11) % 34)}%`, "--hue": (i * 47 + row * 90) % 360 } as CSSProperties} />)}
            </div>
          ))}
        </div>
        {[22, 50, 78].map((x, i) => <span key={x} className="hub-lamp" style={{ left: `${x}%`, animationDelay: `${i * 0.7}s` }} aria-hidden="true" />)}
        {[0, 1, 2].map((i) => <span key={i} className="hub-floating-book" style={{ left: `${30 + i * 22}%`, animationDelay: `${-i * 2}s` }} aria-hidden="true"><BookOpen size={14} /></span>)}
      </div>
      <div className="hub-floor hub-floor-library" style={{ top: layout.wall }} />
      <div className="hub-rug" style={box(layout, { x: 0.25, y: 0.3, w: 0.5, h: 0.5 })} aria-hidden="true" />
      <div className="hub-table" style={box(layout, table)} aria-hidden="true"><span /><span /></div>
      <div className="hub-nook" style={box(layout, nook)} aria-hidden="true"><span className="hub-beanbag" /><span className="hub-beanbag is-two" /><span className="hub-nook-lamp" /></div>
    </>
  );
}

function Lab({ layout }: { layout: Layout }) {
  const now = new Date();
  return (
    <>
      <div className="hub-wall hub-wall-lab" style={{ height: layout.wall }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="hub-screen" style={{ left: `${5 + i * 24}%` }} aria-hidden="true">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <polyline points={Array.from({ length: 11 }, (_, j) => `${j * 10},${20 + Math.sin(j * (0.9 + i * 0.4) + i) * 12}`).join(" ")} />
            </svg>
          </div>
        ))}
        <div className="hub-clock" aria-label="The time">
          <span>{now.getHours().toString().padStart(2, "0")}:{now.getMinutes().toString().padStart(2, "0")}</span>
          <small>Deep focus</small>
        </div>
      </div>
      <div className="hub-floor hub-floor-lab" style={{ top: layout.wall }} />
      {ROOMS.lab.blocks.map((b, i) => (
        <div key={i} className="hub-desk" style={box(layout, b)} aria-hidden="true"><span className="hub-monitor" style={{ animationDelay: `${i * 0.5}s` }} /></div>
      ))}
    </>
  );
}

function Terrace({ layout }: { layout: Layout }) {
  return (
    <div className="gd hub-terrace" data-time="day" style={{ position: "absolute", inset: 0, border: 0, borderRadius: 0 }}>
      <Scenery layout={{ width: layout.width, height: layout.height, horizon: layout.wall, lawnY: layout.py, big: true }} time="day" seed="hub-terrace" />
    </div>
  );
}

function Arcade({ layout }: { layout: Layout }) {
  const floor = ROOMS.arcade.spots[0], stage = ROOMS.arcade.spots[1];
  return (
    <>
      <div className="hub-wall hub-wall-arcade" style={{ height: layout.wall }}>
        <div className="hub-marquee"><Gamepad2 size={16} /> ARCADE <Gamepad2 size={16} /></div>
        <div className="hub-fame" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ animationDelay: `${i * 0.5}s` }}>{i === 0 ? <Trophy size={14} /> : <Flame size={14} />}</span>)}
        </div>
      </div>
      <div className="hub-floor hub-floor-arcade" style={{ top: layout.wall }} />
      <div className="hub-dancefloor" style={box(layout, floor)} aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <span key={i} style={{ animationDelay: `${(i * 0.37) % 2.2}s`, "--hue": (i * 53) % 360 } as CSSProperties} />)}
      </div>
      <div className="hub-stage" style={box(layout, stage)} aria-hidden="true">
        <span className="hub-spot" /><span className="hub-spot is-two" />
      </div>
    </>
  );
}

export const Scene = memo(function Scene({ room, layout, counts, online }: { room: RoomId; layout: Layout; counts: RoomCount[]; online: number }) {
  const count = (id: RoomId) => counts.find((c) => c.id === id)?.count;
  return (
    <div className="hub-scene" data-room={room} aria-hidden="false">
      {room === "plaza" && <Plaza layout={layout} counts={counts} online={online} />}
      {room === "library" && <Library layout={layout} />}
      {room === "lab" && <Lab layout={layout} />}
      {room === "terrace" && <Terrace layout={layout} />}
      {room === "arcade" && <Arcade layout={layout} />}
      {ROOMS[room].doors.map((d) => <DoorView key={d.to} door={d} layout={layout} count={count(d.to)} />)}
    </div>
  );
});
