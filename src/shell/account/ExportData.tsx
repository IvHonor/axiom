import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { exportData } from "../../lib/backend";
import { ErrorNote, useAction } from "./fields";

/** Saves everything on this computer as a JSON file in Downloads. Works signed in or out. */
export function ExportData() {
  const [file, setFile] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  return (
    <>
      <p className="account-intro">Save a copy of everything on this computer as a JSON file.</p>
      <button className="btn btn-sm btn-ghost" onClick={() => void run(() => exportData().then(setFile))} disabled={busy}>
        {busy ? "Exporting…" : "Export my data"}
      </button>
      {file && (
        <p className="field-hint account-saved">
          Saved to <span className="account-path">{file}</span>{" "}
          <button className="link" onClick={() => void revealItemInDir(file)}>
            Show in folder
          </button>
        </p>
      )}
      <ErrorNote error={error} />
    </>
  );
}
