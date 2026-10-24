import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

interface PanelProps {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onContextMenu?: MouseEventHandler<HTMLElement>;
  children: ReactNode;
}

/** The bracket-cornered HUD frame every view is built from. */
export function Panel({ title, meta, actions, className, style, onContextMenu, children }: PanelProps) {
  return (
    <section className={className ? `panel ${className}` : "panel"} style={style} onContextMenu={onContextMenu}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {meta && <div className="panel-meta">{meta}</div>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
