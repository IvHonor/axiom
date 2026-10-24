import { useCallback, useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { COMPACT_AFTER, loadDoc, snapshot } from "../../lib/richtext/doc";
import { useDataChanged } from "../../lib/sync";
import { api, errorMessage, type NoteDetail } from "./api";
import { notesChanged, useNotesUi } from "./notesUi";

/** A note and its text as a Yjs document. Edits saved elsewhere (another
 * window onto the same note, or another computer) merge in as they land. */
export function useNoteDoc(id: string) {
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<Y.Doc | null>(null);

  useEffect(() => {
    let live = true;
    api.get(id).then(
      (d) => {
        if (!live) return;
        const loaded = loadDoc(d.edits);
        docRef.current = loaded;
        setDoc(loaded);
        setDetail(d);
        // Many small saves read slowly: squash the ones read here into one.
        if (d.edits.length > COMPACT_AFTER) {
          api.compact(id, snapshot(loaded), d.edits.flatMap((e) => e.ids)).catch(() => {});
        }
      },
      (err) => live && setError(errorMessage(err)),
    );
    return () => {
      live = false;
      docRef.current = null;
    };
  }, [id]);

  const refresh = useCallback(() => {
    api.get(id).then(
      (d) => {
        if (!docRef.current) return;
        loadDoc(d.edits, docRef.current);
        setDetail(d);
      },
      () => {},
    );
  }, [id]);
  const { revision } = useNotesUi();
  useEffect(refresh, [refresh, revision]);
  useDataChanged(refresh);

  const save = useCallback(
    async (update: string | null, text: string, words: number) => {
      await api.save(id, update, text, words);
      notesChanged();
    },
    [id],
  );

  return { detail, doc, error, save };
}
