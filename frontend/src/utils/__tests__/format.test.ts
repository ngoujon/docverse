import { describe, expect, it } from "vitest";
import { formatBytes } from "../format";

describe("formatBytes", () => {
  it("returns 0 KB for zero or negative values", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(-5)).toBe("0 KB");
  });

  it("keeps small values under 1 KB in bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats bytes in the KB range with one decimal under 10", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("rounds to a whole number at 10 KB or above", () => {
    expect(formatBytes(1024 * 20)).toBe("20 KB");
  });

  it("formats bytes in the MB range with one decimal under 10", () => {
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MB");
  });

  it("rounds to a whole number at 10 or above", () => {
    expect(formatBytes(1024 * 1024 * 12)).toBe("12 MB");
  });

  it("formats bytes in the GB range with one decimal under 10", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe("2.0 GB");
  });

  it("rounds to a whole number at 10 GB or above", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 15)).toBe("15 GB");
  });
});
