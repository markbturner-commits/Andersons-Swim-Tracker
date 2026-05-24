import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256-browser";

// Mirrors the well-known digests asserted in src/lib/pdf/fileHash.test.ts
// to lock the browser-side hash to the exact same output the server uses
// for duplicate detection.
describe("sha256Hex (browser)", () => {
  it("matches the SHA-256 of an empty buffer", async () => {
    const digest = await sha256Hex(new ArrayBuffer(0));
    expect(digest).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the SHA-256 of 'abc'", async () => {
    const bytes = new TextEncoder().encode("abc");
    const digest = await sha256Hex(bytes.buffer);
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("accepts a Blob as input", async () => {
    const blob = new Blob(["abc"], { type: "text/plain" });
    const digest = await sha256Hex(blob);
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
