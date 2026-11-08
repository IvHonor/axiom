import { ChevronLeft } from "lucide-react";
import { usePhone } from "../usePhone";

/**
 * Back to the list, for areas whose list and open item sit side by side on a
 * wide screen but take turns on a phone (Notes, Journal, Goals, Birthdays).
 * Renders nothing anywhere else.
 */
export function PhoneBack({ label, onBack }: { label: string; onBack: () => void }) {
  if (!usePhone()) return null;
  return (
    <button type="button" className="phone-back" onClick={onBack}>
      <ChevronLeft size={16} strokeWidth={1.75} /> {label}
    </button>
  );
}
