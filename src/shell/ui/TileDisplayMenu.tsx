import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X, type LucideIcon } from "lucide-react";
import { useTileLayout } from "./ResizableTile";
import "./tileDisplay.css";

export interface TileViewOption {
  id: string;
  label: string;
  description: string;
  width: number;
  height: number;
}
interface Props {
  name: string;
  icon: LucideIcon;
  options: readonly TileViewOption[];
  selected: string;
  recommended: string;
  active: string;
  onSelect: (id: string) => void;
  onOpen: () => void;
  onReset: () => void;
  children: ReactNode;
}

/** Shared, keyboard-accessible display controls for resizable overview tiles. */
export function TileDisplayMenu({ name, icon: Icon, options, selected, recommended, active, onSelect, onOpen, onReset, children }: Props) {
  const { size, width, height } = useTileLayout();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => { setPosition(null); trigger.current?.focus(); };
  const label = (id: string) => options.find((option) => option.id === id)?.label ?? id;

  useLayoutEffect(() => {
    if (!position || !menu.current) return;
    const rect = menu.current.getBoundingClientRect();
    menu.current.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8))}px`;
    menu.current.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8))}px`;
    (menu.current.querySelector<HTMLElement>("[role=radio][aria-checked=true]:not(:disabled)") ?? menu.current.querySelector<HTMLElement>("[role=radio]"))?.focus();
  }, [position]);
  useEffect(() => {
    if (!position) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null);
    };
    const resize = () => setPosition(null);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resize); };
  }, [position]);

  return <span className="tile-display-title">
    <button ref={trigger} className="icon-btn" aria-label={`${name} display options`} aria-haspopup="dialog" aria-expanded={!!position}
      title="Change display · right-click for options"
      onClick={() => { const rect = trigger.current!.getBoundingClientRect(); setPosition(position ? null : { x: rect.left, y: rect.bottom + 5 }); }}
      onContextMenu={(event) => { event.preventDefault(); setPosition({ x: event.clientX, y: event.clientY }); }}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setPosition({ x: rect.left, y: rect.bottom });
        }
      }}><Icon size={16} /><ChevronDown size={10} /></button>
    <button className="tile-title" title={`Open ${name}`} onClick={onOpen}>{name}</button>
    {position && createPortal(<div ref={menu} className="tile-display-menu" role="dialog" aria-label={`${name} display options`}
      style={{ left: position.x, top: position.y }} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "Tab") {
          const nodes = Array.from(menu.current!.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled)"));
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) && (event.target as HTMLElement).getAttribute("role") === "radio") {
          event.preventDefault();
          const radios = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("[role=radio]:not(:disabled)"));
          const index = radios.indexOf(event.target as HTMLButtonElement);
          radios[event.key === "Home" ? 0 : event.key === "End" ? radios.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + radios.length) % radios.length]?.focus();
        }
      }}>
      <div className="tile-display-heading"><div><strong>{name} display</strong><small>{size.w} × {size.h} tile · saved for this size</small></div><button className="icon-btn" aria-label="Close display options" onClick={close}><X size={15} /></button></div>
      <div role="radiogroup" aria-label="Tile view">
        <button className="tile-view-option" role="radio" aria-label="Auto fit" aria-checked={selected === "auto"} onClick={() => onSelect("auto")}>
          <span className="tile-view-check">{selected === "auto" && <Check size={14} />}</span><span><strong>Auto fit <em>Recommended</em></strong><small>Adapts as you resize · {label(recommended)}</small></span>
        </button>
        {options.map((option) => {
          const available = width >= option.width && height >= option.height;
          const needs = width < option.width && height < option.height ? "Needs a wider and taller tile" : width < option.width ? "Needs a wider tile" : "Needs a taller tile";
          return <button key={option.id} className="tile-view-option" role="radio" aria-label={option.label} aria-checked={selected === option.id} disabled={!available}
            title={available ? option.description : needs} onClick={() => onSelect(option.id)}>
            <span className="tile-view-check">{selected === option.id && <Check size={14} />}</span><span><strong>{option.label}{recommended === option.id && <em>Best fit</em>}</strong><small>{available ? option.description : needs}</small></span>
          </button>;
        })}
      </div>
      {selected !== "auto" && selected !== active && <p className="tile-display-note">Showing {label(active)} until there is room for your saved view.</p>}
      <div className="tile-display-settings">{children}<button className="btn btn-ghost" onClick={onReset}>Reset this size to Auto</button></div>
    </div>, document.body)}
  </span>;
}
