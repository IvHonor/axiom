// Small pieces the Playground's page, sidebar and tile share.
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** "K7Q2M9XD" → "K7Q2-M9XD", easier to read out. */
export const prettyCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Your friend code, and a button that copies an invite to paste anywhere. */
export function FriendCode({ code, handle }: { code: string; handle?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = `Join me in the Axiom Playground! Add me with my friend code ${prettyCode(code)}${handle ? ` or my handle @${handle}` : ""}.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable: the code is on screen to read out */ }
  };
  return (
    <button type="button" className="pg-code" onClick={() => void copy()} title="Copy an invite with your code">
      <code>{prettyCode(code)}</code>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span className="pg-sr">{copied ? "Copied" : "Copy invite"}</span>
    </button>
  );
}
