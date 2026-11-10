import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import UsageButton from "../UsageButton";
import type { UsageSummary } from "../../../types";

const usage: UsageSummary = {
  calls: 3,
  prompt_tokens: 2000,
  completion_tokens: 400,
  pages: 0,
  cost_usd: 0.0016,
  own_key: false,
  details: [
    { kind: "chat", label: "Réponse", model: "mistral-large-latest", calls: 1, prompt_tokens: 1800, completion_tokens: 390, pages: 0, cost_usd: 0.0015 },
    { kind: "rerank", label: "Tri", model: "mistral-small-latest", calls: 1, prompt_tokens: 200, completion_tokens: 10, pages: 0, cost_usd: 0.0001 },
  ],
};

describe("UsageButton", () => {
  it("shows nothing but the chip until clicked, then the detail", () => {
    render(<UsageButton usage={usage} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button"));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("app.usage.platform");
    // one line per step
    expect(dialog.querySelectorAll("li")).toHaveLength(2);
  });

  it("tells the user when their own key pays", () => {
    render(<UsageButton usage={{ ...usage, own_key: true }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog").textContent).toContain("app.usage.ownKey");
  });

  it("closes on Escape", () => {
    render(<UsageButton usage={usage} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
