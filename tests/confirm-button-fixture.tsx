// The real ConfirmButton inside a dialog-like form, counting saves and deletes.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmButton } from "../src/shell/ui/ConfirmButton";

function Fixture() {
  const [saved, setSaved] = useState(0);
  const [deleted, setDeleted] = useState(0);
  return <form onSubmit={(e) => { e.preventDefault(); setSaved((n) => n + 1); }}>
    <input aria-label="Name" defaultValue="Econometrics" />
    <ConfirmButton confirmText="Click again" onConfirm={() => setDeleted((n) => n + 1)}>Delete</ConfirmButton>
    <button type="submit">Save</button>
    <output data-testid="saved">{saved}</output>
    <output data-testid="deleted">{deleted}</output>
  </form>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
