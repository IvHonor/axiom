let last = 0, sequence = 0;

/** Desktop board history sorts by ID; keep browser records in UUIDv7 order too. */
export function boardId(): string {
  let time = Math.max(Date.now(), last);
  if (time === last) { sequence++; if (sequence > 0xfff) { time++; sequence = 0; } }
  else sequence = crypto.getRandomValues(new Uint16Array(1))[0] & 0xfff;
  last = time;
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  bytes[0] = (bytes[0] & 0x3f) | 0x80;
  const tail = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const head = time.toString(16).padStart(12, "0");
  return `${head.slice(0, 8)}-${head.slice(8)}-7${sequence.toString(16).padStart(3, "0")}-${tail.slice(0, 4)}-${tail.slice(4)}`;
}
