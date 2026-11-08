import { currentAccount } from "@/lib/session";
import { readPublicFile } from "@/lib/terminal/feed";
import { sameOrigin } from "../origin";

// Reading on the web: finding books on Open Library and fetching covers, as
// the desktop does in src-tauri/src/features/reading/library.rs. Open Library
// sends no cross-origin headers and the page may only talk to this site.

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const API = "https://openlibrary.org";
const COVERS = "https://covers.openlibrary.org";
const AGENT = "Axiom-Web/1 (https://github.com/IvHonor/axiom)";
const FIELDS = "key,title,author_name,cover_i,number_of_pages_median,first_publish_year,edition_count";
const MAX_COVER = 8 * 1024 * 1024;

const cover = (id: unknown, size = "M") => (typeof id === "number" && id > 0 ? `${COVERS}/b/id/${id}-${size}.jpg` : null);

async function get<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API}${path}`, { headers: { "user-agent": AGENT, accept: "application/json" }, signal: AbortSignal.timeout(20_000), cache: "no-store" }).catch(() => {
    throw new Error("Couldn't reach Open Library. Check your internet connection and try again.");
  });
  if (response.status === 404) return null;
  if (response.status === 429 || response.status === 503) throw new Error("Open Library is busy right now. Try again in a moment.");
  if (!response.ok) throw new Error(`Open Library couldn't search just now (error ${response.status}). Try again later.`);
  return response.json() as Promise<T>;
}

/** The digits of an ISBN-10 or -13 typed with or without dashes and spaces. */
function asIsbn(query: string) {
  const digits = query.replace(/[- ]/g, "").toUpperCase();
  return (digits.length === 10 && /^\d{9}[\dX]$/.test(digits)) || (digits.length === 13 && /^\d{13}$/.test(digits)) ? digits : null;
}

type Doc = { key: string; title?: string; author_name?: string[]; cover_i?: number; number_of_pages_median?: number; first_publish_year?: number; edition_count?: number };
type EditionDoc = { key: string; title?: string; number_of_pages?: number; covers?: number[]; publishers?: string[]; publish_date?: string; physical_format?: string; isbn_13?: string[]; isbn_10?: string[]; languages?: { key: string }[] };

async function search(query: string) {
  query = query.trim().slice(0, 300);
  if (!query) return [];
  const isbn = asIsbn(query);
  const params = new URLSearchParams({ q: isbn ? `isbn:${isbn}` : query, fields: FIELDS, limit: "20" });
  const page = (await get<{ docs?: Doc[] }>(`/search.json?${params}`)) ?? { docs: [] };
  const found = (page.docs ?? [])
    .filter((d) => d.key?.startsWith("/works/") && d.title)
    .map((d) => ({ workKey: d.key, editionKey: null as string | null, title: d.title!, authors: (d.author_name ?? []).join(", "), year: d.first_publish_year ?? null, pages: d.number_of_pages_median ?? null, coverUrl: cover(d.cover_i), isbn: null as string | null, editions: d.edition_count ?? 1 }));
  if (isbn && found[0]) {
    const edition = await get<EditionDoc>(`/isbn/${isbn}.json`).catch(() => null);
    if (edition) {
      found[0].editionKey = edition.key;
      found[0].pages = edition.number_of_pages ?? found[0].pages;
      found[0].coverUrl = cover(edition.covers?.find((id) => id > 0)) ?? found[0].coverUrl;
    }
    found[0].isbn = isbn;
  }
  return found;
}

async function editions(workKey: string) {
  if (!/^\/works\/OL\w+$/.test(workKey)) throw new Error("That isn't an Open Library book.");
  const page = (await get<{ entries?: EditionDoc[] }>(`${workKey}/editions.json?limit=100`)) ?? { entries: [] };
  const list = (page.entries ?? []).map((e) => ({
    key: e.key, title: e.title ?? "", pages: e.number_of_pages && e.number_of_pages > 0 ? e.number_of_pages : null, coverUrl: cover(e.covers?.find((id) => id > 0)),
    publisher: e.publishers?.[0] ?? null, published: e.publish_date ?? null, format: e.physical_format ?? null, isbn: e.isbn_13?.[0] ?? e.isbn_10?.[0] ?? null,
    language: e.languages?.[0]?.key.replace(/^\/languages\//, "") ?? null,
  }));
  return list.sort((a, b) => Number(a.pages === null) - Number(b.pages === null));
}

function imageType(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("latin1") === "\x89PNG") return "image/png";
  if (bytes.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

async function coverImage(url: string) {
  const { bytes } = await readPublicFile(url.replace(/^http:/i, "https:"), MAX_COVER, "image/*");
  const type = imageType(bytes);
  if (!type) throw new Error("That address isn't an image.");
  return `data:${type};base64,${bytes.toString("base64")}`;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Reload Axiom and try again." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ message: "Expected JSON." }, 415);
  if (!(await currentAccount())) return json({ message: "Your sign-in has ended. Reload to sign in again." }, 401);
  try {
    const text = await request.text();
    if (text.length > 8192) return json({ message: "That's too long." }, 413);
    const body = JSON.parse(text) as { op?: string; query?: string; workKey?: string; url?: string };
    if (body.op === "search") return json({ data: await search(String(body.query ?? "")) });
    if (body.op === "editions") return json({ data: await editions(String(body.workKey ?? "")) });
    if (body.op === "cover") return json({ data: await coverImage(String(body.url ?? "")) });
    return json({ message: "Unknown request." }, 400);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : "Something went wrong." }, 400);
  }
}
