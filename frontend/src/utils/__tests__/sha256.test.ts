import { describe, expect, it } from "vitest";
import { sha256Hex } from "../sha256";

describe("sha256Hex", () => {
  it("matches the known SHA-256 vector for the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it('matches the known SHA-256 vector for "abc"', () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches the known SHA-256 vector for a 56-char string spanning two blocks", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
  });

  it("is deterministic and sensitive to input changes", () => {
    expect(sha256Hex("captcha-salt:0")).toBe(sha256Hex("captcha-salt:0"));
    expect(sha256Hex("captcha-salt:0")).not.toBe(sha256Hex("captcha-salt:1"));
  });

  it("always returns 64 lowercase hex characters", () => {
    const digest = sha256Hex("some arbitrary input with unicode: café");
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
