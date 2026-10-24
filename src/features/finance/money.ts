// Money on screen. Amounts are whole minor units (pence, cents); these
// turn them into text in the user's own number style, and back.

/** Decimal places by ISO 4217, as in money.rs. */
export function exponent(currency: string): number {
  if (["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"].includes(currency)) return 0;
  if (["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"].includes(currency)) return 3;
  return 2;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let found = formatters.get(key);
  if (!found) {
    const digits = exponent(currency);
    try {
      found = new Intl.NumberFormat(undefined, compact
        ? { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }
        : { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch {
      found = new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    formatters.set(key, found);
  }
  return found;
}

/** "£1,234.56", in the user's locale. `sign` adds + to money in. */
export function money(minor: number, currency: string, options: { sign?: boolean; compact?: boolean } = {}): string {
  const value = minor / 10 ** exponent(currency);
  const text = formatter(currency, !!options.compact).format(value);
  return options.sign && minor > 0 ? `+${text}` : text;
}

/** A number as typed ("12.50", "12,50", "1,234.5") in minor units, or null. */
export function parseMoney(text: string, currency: string): number | null {
  const cleaned = text.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const digits = cleaned.replace(/-/g, "");
  const lastDot = digits.lastIndexOf(".");
  const lastComma = digits.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);
  let whole = digits;
  let fraction = "";
  // The last separator is a decimal point unless three digits follow it ("1,000").
  if (sep >= 0 && digits.length - sep - 1 !== 3) {
    whole = digits.slice(0, sep);
    fraction = digits.slice(sep + 1);
  }
  const e = exponent(currency);
  const value = Number(whole.replace(/[.,]/g, "") || "0") * 10 ** e + Number((fraction + "000").slice(0, e) || "0");
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

/** Minor units as an editable number ("12.50"). */
export function toInput(minor: number, currency: string): string {
  const e = exponent(currency);
  return (Math.abs(minor) / 10 ** e).toFixed(e);
}

/** The currency usually used where the user is, from their locale. */
export function localCurrency(): string {
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  const euro = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
  const known: Record<string, string> = { GB: "GBP", US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD", IN: "INR", JP: "JPY", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", TR: "TRY", AE: "AED", SA: "SAR", ZA: "ZAR", NG: "NGN", PK: "PKR", BR: "BRL", MX: "MXN", SG: "SGD", HK: "HKD", CN: "CNY", KR: "KRW" };
  return euro.includes(region) ? "EUR" : known[region] ?? "GBP";
}

/** Dates like 3/4 mean March 4th here (the US). */
export const monthFirst = () => navigator.language === "en-US";

/** Every currency the browser knows, with names, common ones first. */
export function currencies(): { code: string; name: string }[] {
  const common = ["GBP", "EUR", "USD", "CAD", "AUD", "JPY", "CHF", "INR", "CNY", "AED", "SEK", "NOK", "DKK", "PLN", "NZD", "SGD", "HKD", "ZAR", "TRY", "BRL", "MXN"];
  let all: string[] = common;
  try {
    all = (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("currency");
  } catch {
    // Older engines: the common ones will do.
  }
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(undefined, { type: "currency" });
  } catch {
    names = null;
  }
  const ordered = [...common, ...all.filter((c) => !common.includes(c))];
  return ordered.map((code) => ({ code, name: names?.of(code) ?? code }));
}

/** "2026-10" for a day. */
export const monthOf = (day: string) => day.slice(0, 7);

/** "October 2026" (or just "October"). */
export function monthName(month: string, withYear = true): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1, 12).toLocaleDateString(undefined, withYear ? { month: "long", year: "numeric" } : { month: "short" });
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
