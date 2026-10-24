import { useState, type CSSProperties } from "react";
import { Ellipsis, LayoutDashboard, Maximize2, Palette, Trash2 } from "lucide-react";
import { RichTextEditor } from "../../lib/richtext/Editor";
import { Dropdown } from "../../shell/ui/Dropdown";
import { TileMoveHandle } from "../../shell/ui/TileMoveHandle";
import { COLORS, api, colorOf, errorMessage, type NoteCard } from "./api";
import { notesChanged, setNotesUi, useNotesUi } from "./notesUi";
import { useNoteDoc } from "./useNoteDoc";

/** A slight, steady tilt per note, like paper stuck on by hand. */
function tilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.45;
}

interface StickyProps {
  card: NoteCard;
  /** On the overview it's a tile (movable); on the board, a card. */
  place: "tile" | "board";
  /** Opens the note in Notes. */
  onOpen: () => void;
  autofocus?: boolean;
}

/** A sticky note: coloured paper you write straight onto. */
export function StickyNote({ card, place, onOpen, autofocus }: StickyProps) {
  const { doc, save } = useNoteDoc(card.id);
  const { handwriting } = useNotesUi();
  const [palette, setPalette] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const color = colorOf(card.color);

  const change = (c: Parameters<typeof api.change>[1]) =>
    api.change(card.id, c).then(
      () => {
        setError(null);
        notesChanged();
      },
      (err) => setError(errorMessage(err)),
    );

  const style = { "--paper": color.paper, "--band": color.band, "--tilt": `${tilt(card.id)}deg` } as CSSProperties;

  return (
    <div className={`sticky is-${place}${handwriting ? " is-handwritten" : ""}`} style={style} onContextMenu={(e) => place === "tile" && e.preventDefault()}>
      <span className="sticky-tape" aria-hidden="true" />
      <header className="sticky-band">
        {place === "tile" && <TileMoveHandle />}
        <button className="sticky-btn" title="Colour" aria-label="Colour" aria-expanded={palette} onClick={() => setPalette(!palette)}>
          <Palette size={14} strokeWidth={1.75} />
        </button>
        <span className="sticky-grow" />
        {place === "board" && (
          <button
            className={`sticky-btn${card.onOverview ? " is-on" : ""}`}
            title={card.onOverview ? "On your overview: click to take it off" : "Show on your overview"}
            aria-label="Show on your overview"
            aria-pressed={card.onOverview}
            onClick={() => change({ onOverview: !card.onOverview })}
          >
            <LayoutDashboard size={14} strokeWidth={1.75} />
          </button>
        )}
        <button className="sticky-btn" title="Open in Notes" aria-label="Open in Notes" onClick={onOpen}>
          <Maximize2 size={13} strokeWidth={1.75} />
        </button>
        <Dropdown label="Sticky note options" icon={<Ellipsis size={14} strokeWidth={1.75} />}>
          {(close) => (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  change({ onOverview: !card.onOverview });
                }}
              >
                <LayoutDashboard size={14} strokeWidth={1.5} /> {card.onOverview ? "Take off the overview" : "Show on the overview"}
              </button>
              <button
                className="menu-item is-danger"
                onClick={() => {
                  close();
                  api.trash(card.id).then(notesChanged, (err) => setError(errorMessage(err)));
                }}
              >
                <Trash2 size={14} strokeWidth={1.5} /> Move to the trash
              </button>
            </>
          )}
        </Dropdown>
      </header>
      {palette && (
        <div className="sticky-palette" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={c.id === color.id}
              aria-label={c.label}
              title={c.label}
              className={c.id === color.id ? "is-on" : ""}
              style={{ background: c.paper, borderColor: c.band }}
              onClick={() => {
                setPalette(false);
                change({ color: c.id });
              }}
            />
          ))}
        </div>
      )}
      {error && <p className="sticky-error">{error}</p>}
      <div className="sticky-body">{doc && <RichTextEditor doc={doc} placeholder="Jot something down…" onSave={save} toolbar={false} autofocus={autofocus} className="sticky-editor" />}</div>
    </div>
  );
}

/** Opens a note in the Notes tab. */
export const showNote = (id: string, onOpen: () => void) => {
  setNotesUi({ note: id, shelf: "all", folder: null, tag: null, search: "" });
  onOpen();
};
