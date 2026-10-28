import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export function publicFeedAddress(address: string) {
  // shortcut: IPv6-only feeds need public-address validation and DNS pinning before enabling.
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
}
export function feedUrl(value: string) {
  const url = new URL(value.replace(/^webcal:/i, "https:"));
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || value.length > 4096 || url.hostname.includes(":")) throw new Error("Use an HTTPS iCalendar link with no username or password.");
  url.hash = ""; return url;
}

/** Pin the resolved public address for the request; recheck every redirect. No credentials leave Axiom. */
export async function readFeed(value: string): Promise<string> {
  let url = feedUrl(value);
  for (let redirects = 0; redirects < 4; redirects++) {
    const addresses = await lookup(url.hostname, { family: 4, all: true });
    if (!addresses.length || addresses.some(item => !publicFeedAddress(item.address))) throw new Error("Calendar links must point to a public internet server.");
    const response = await new Promise<{ location?: string; source?: string }>((resolve, reject) => {
      const req = request(url, { family: 4, headers: { accept: "text/calendar", "accept-encoding": "identity", "user-agent": "Axiom-Web/1" }, lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4), signal: AbortSignal.timeout(15000) }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) { res.resume(); resolve({ location: res.headers.location }); return; }
        if (res.statusCode !== 200 || res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") { res.resume(); reject(new Error("The calendar server did not return a readable calendar. Check its private iCal link.")); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 200_000) { res.destroy(); reject(new Error("This feed exceeds 200 KB. Use a shorter date range or import a smaller file.")); } else chunks.push(chunk); });
        res.on("end", () => resolve({ source: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", () => reject(new Error("The calendar server stopped replying. Try again.")));
      });
      req.on("error", () => reject(new Error("The calendar server could not be reached. Check the link and try again."))); req.end();
    });
    if (response.source !== undefined) {
      if (!response.source.includes("BEGIN:VCALENDAR")) throw new Error("That link does not return an iCalendar (.ics) feed.");
      return response.source;
    }
    if (!response.location) throw new Error("The calendar server returned an invalid redirect.");
    url = feedUrl(new URL(response.location, url).href);
  }
  throw new Error("The calendar link redirects too many times.");
}
