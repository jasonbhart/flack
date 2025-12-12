/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import InlineCode from "./InlineCode.svelte";

describe("InlineCode", () => {
  it("should render code content", () => {
    render(InlineCode, { props: { code: "const x = 1" } });
    const code = screen.getByText("const x = 1");
    expect(code).toBeInTheDocument();
  });

  it("should render as a code element", () => {
    render(InlineCode, { props: { code: "test" } });
    const code = screen.getByText("test");
    expect(code.tagName.toLowerCase()).toBe("code");
  });

  it("should have monospace font class", () => {
    render(InlineCode, { props: { code: "test" } });
    const code = screen.getByText("test");
    expect(code).toHaveClass("font-mono");
  });

  it("should have background styling", () => {
    render(InlineCode, { props: { code: "test" } });
    const code = screen.getByText("test");
    expect(code.className).toContain("bg-ink-800/50");
  });

  it("should have padding and rounded corners", () => {
    render(InlineCode, { props: { code: "test" } });
    const code = screen.getByText("test");
    expect(code).toHaveClass("rounded");
    expect(code.className).toContain("px-1.5");
    expect(code.className).toContain("py-0.5");
  });

  it("should preserve special characters", () => {
    render(InlineCode, { props: { code: "<div>&nbsp;</div>" } });
    const code = screen.getByText("<div>&nbsp;</div>");
    expect(code).toBeInTheDocument();
  });

  it("should handle empty string", () => {
    const { container } = render(InlineCode, { props: { code: "" } });
    const code = container.querySelector("code");
    expect(code).toBeInTheDocument();
    expect(code?.textContent).toBe("");
  });
});
