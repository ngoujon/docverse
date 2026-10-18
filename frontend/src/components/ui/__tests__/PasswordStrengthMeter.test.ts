import { describe, expect, it } from "vitest";
import { scorePassword } from "../PasswordStrengthMeter";

describe("scorePassword", () => {
  it("scores an empty password as 0", () => {
    expect(scorePassword("")).toBe(0);
  });

  it("scores a short, single-case, all-letter password very low", () => {
    expect(scorePassword("abc")).toBe(0);
  });

  it("rewards length, case mixing, digits, and symbols", () => {
    const weak = scorePassword("password");
    const medium = scorePassword("Password1");
    const strong = scorePassword("Password1!");
    const veryStrong = scorePassword("Tr0ub4dor&3xtra!");
    expect(medium).toBeGreaterThanOrEqual(weak);
    expect(strong).toBeGreaterThanOrEqual(medium);
    expect(veryStrong).toBeGreaterThanOrEqual(strong);
    expect(veryStrong).toBe(4);
  });

  it("penalizes common/breached password patterns even if long", () => {
    const common = scorePassword("password");
    const random = scorePassword("xQ7!kLmZ");
    expect(common).toBeLessThan(random);
  });

  it("never scores below 0 or above 4", () => {
    expect(scorePassword("11111111")).toBeGreaterThanOrEqual(0);
    expect(scorePassword("Tr0ub4dor&3xtra!Longer$Even#More1")).toBeLessThanOrEqual(4);
  });
});
