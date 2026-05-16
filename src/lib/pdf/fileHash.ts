import { createHash } from "node:crypto";

/** SHA-256 hex digest of a Buffer. Used to dedupe identical PDF uploads per uploader. */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
