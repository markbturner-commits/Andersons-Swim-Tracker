import { describe, expect, it } from "vitest";
import { sha256 } from "./fileHash";

describe("sha256", () => {
  it("matches the well-known digest for an empty buffer", () => {
    expect(sha256(Buffer.alloc(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the well-known digest for 'abc'", () => {
    expect(sha256(Buffer.from("abc", "utf8"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces stable hex output", () => {
    const a = sha256(Buffer.from("the quick brown fox", "utf8"));
    const b = sha256(Buffer.from("the quick brown fox", "utf8"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for one-byte differences", () => {
    const a = sha256(Buffer.from("abc", "utf8"));
    const b = sha256(Buffer.from("abd", "utf8"));
    expect(a).not.toBe(b);
  });
});
