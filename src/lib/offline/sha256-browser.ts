// Browser SHA-256 over arbitrary bytes — matches `src/lib/pdf/fileHash.ts`'s
// Node-side digest so client-computed hashes can be reused by the server's
// duplicate-detection path verbatim.

export async function sha256Hex(input: ArrayBuffer | Blob): Promise<string> {
  const buf =
    input instanceof Blob ? await input.arrayBuffer() : input;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += (b < 16 ? "0" : "") + b.toString(16);
  }
  return out;
}
