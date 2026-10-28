"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import s from "./terminal.module.css";

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className={s.dialog} aria-label={title} onCancel={onClose}>
    <div className={s.heading}><h2>{title}</h2><button className={s.iconButton} aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>{children}
  </dialog>;
}
