// What was dropped on Lemma on the desktop: text (a task), a link (for
// Learning, Reading or a task) or a file (a journal note).

export type Dropped =
  | { kind: "text"; text: string }
  | { kind: "link"; url: string; title: string }
  /** `text`: what's in it, when it's text and not too big; otherwise just its name is kept. */
  | { kind: "file"; name: string; text: string | null };

/** The most of a text file kept in a journal note. */
const MAX_FILE = 200_000;
const TEXT_FILE = /\.(txt|md|markdown|csv|json|log)$/i;
const URL = /^https?:\/\/\S+$/i;

/** A link's own words, from a browser's drag (an <a>'s text, or Firefox's second line). */
function linkText(data: DataTransfer, url: string): string | null {
  const html = data.getData("text/html");
  if (html) {
    const a = new DOMParser().parseFromString(html, "text/html").querySelector("a");
    const words = a?.textContent?.trim();
    if (words && words !== url) return words;
  }
  const moz = data.getData("text/x-moz-url").split(/\r?\n/)[1]?.trim();
  return moz && moz !== url ? moz : null;
}

/** A tidy name for a link without one: its site and path. */
function named(url: string): string {
  try {
    const u = new window.URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`.slice(0, 120);
  } catch {
    return url.slice(0, 120);
  }
}

/**
 * What was dropped. The words are read straight away (they go once the drop
 * is over); a file's contents after.
 */
export function readDrop(data: DataTransfer): Promise<Dropped | null> {
  const file = data.files[0];
  const uri = data
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith("#"));
  const plain = data.getData("text/plain").trim();
  const url = uri ?? (URL.test(plain) ? plain : null);
  if (file) {
    const textual = file.type.startsWith("text/") || TEXT_FILE.test(file.name);
    if (!textual || file.size > MAX_FILE) return Promise.resolve({ kind: "file", name: file.name, text: null });
    return file.text().then(
      (text) => ({ kind: "file" as const, name: file.name, text }),
      () => ({ kind: "file" as const, name: file.name, text: null }),
    );
  }
  if (url) return Promise.resolve({ kind: "link", url, title: linkText(data, url) ?? (plain && plain !== url ? plain : named(url)) });
  return Promise.resolve(plain ? { kind: "text", text: plain } : null);
}

/** A link to a book (Open Library, Goodreads, Google Books, Amazon), for Reading. */
export const bookLink = (url: string) => /openlibrary\.org\/(works|books)\/|goodreads\.com\/book\/|books\.google\.|amazon\.[a-z.]+\/(.*\/)?(dp|gp\/product)\//i.test(url);

/** What sort of source a link is, for Learning. */
export function sourceKind(url: string): "video" | "course" | "book" | "other" {
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return "video";
  if (/coursera\.org|udemy\.com|edx\.org|khanacademy\.org|skillshare\.com|pluralsight\.com|codecademy\.com/i.test(url)) return "course";
  if (bookLink(url)) return "book";
  return "other";
}

/** A task from dropped text: its first line, and the rest as notes. */
export function taskOf(text: string): { title: string; notes: string } {
  const [first, ...rest] = text.trim().split(/\r?\n/);
  const title = first.trim().slice(0, 120) || "Dropped text";
  const more = first.trim().length > 120 ? [first.trim(), ...rest] : rest;
  return { title, notes: more.join("\n").trim() };
}
