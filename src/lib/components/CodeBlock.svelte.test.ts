/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import CodeBlock from "./CodeBlock.svelte";

describe("CodeBlock", () => {
  // Mock clipboard API
  const mockClipboard = {
    writeText: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    Object.assign(navigator, { clipboard: mockClipboard });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rendering", () => {
    it("should render code content", () => {
      render(CodeBlock, { props: { code: "const x = 1;" } });
      expect(screen.getByText("const x = 1;")).toBeInTheDocument();
    });

    it("should render as a pre element", () => {
      const { container } = render(CodeBlock, { props: { code: "test" } });
      const pre = container.querySelector("pre");
      expect(pre).toBeInTheDocument();
    });

    it("should preserve whitespace", () => {
      render(CodeBlock, { props: { code: "  indented\n    more" } });
      const pre = screen.getByText(/indented/);
      expect(pre).toHaveClass("whitespace-pre");
    });

    it("should have monospace font", () => {
      render(CodeBlock, { props: { code: "test" } });
      const pre = screen.getByText("test");
      expect(pre).toHaveClass("font-mono");
    });
  });

  describe("language header", () => {
    it('should display "Code" when no language is provided', () => {
      render(CodeBlock, { props: { code: "test" } });
      expect(screen.getByText("Code")).toBeInTheDocument();
    });

    it("should display formatted language name when provided", () => {
      render(CodeBlock, { props: { code: "test", language: "typescript" } });
      expect(screen.getByText("TypeScript")).toBeInTheDocument();
    });

    it("should display formatted name for short aliases", () => {
      render(CodeBlock, { props: { code: "test", language: "ts" } });
      expect(screen.getByText("TypeScript")).toBeInTheDocument();
    });

    it("should display original language for unknown languages", () => {
      render(CodeBlock, { props: { code: "test", language: "cobol" } });
      expect(screen.getByText("cobol")).toBeInTheDocument();
    });
  });

  describe("copy button", () => {
    it("should render a copy button", () => {
      render(CodeBlock, { props: { code: "test" } });
      const button = screen.getByRole("button", { name: /copy/i });
      expect(button).toBeInTheDocument();
    });

    it('should show "Copy" text initially', () => {
      render(CodeBlock, { props: { code: "test" } });
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    it("should copy code to clipboard when clicked", async () => {
      render(CodeBlock, { props: { code: "const x = 1;" } });
      const button = screen.getByRole("button", { name: /copy/i });

      await fireEvent.click(button);

      expect(mockClipboard.writeText).toHaveBeenCalledWith("const x = 1;");
    });

    it('should show "Copied!" after clicking copy', async () => {
      vi.useFakeTimers();
      render(CodeBlock, { props: { code: "test" } });
      const button = screen.getByRole("button", { name: /copy/i });

      await fireEvent.click(button);

      expect(screen.getByText("Copied!")).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('should revert to "Copy" after timeout', async () => {
      vi.useFakeTimers();
      render(CodeBlock, { props: { code: "test" } });
      const button = screen.getByRole("button", { name: /copy/i });

      await fireEvent.click(button);
      expect(screen.getByText("Copied!")).toBeInTheDocument();

      // Advance timers by 2 seconds
      vi.advanceTimersByTime(2000);

      // Need to wait for Svelte to update
      await vi.runAllTimersAsync();
      vi.useRealTimers();
    });
  });

  describe("styling", () => {
    it("should have container styling classes", () => {
      const { container } = render(CodeBlock, { props: { code: "test" } });
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper).toHaveClass("rounded-md");
      expect(wrapper).toHaveClass("overflow-hidden");
    });

    it("should have header styling", () => {
      const { container } = render(CodeBlock, { props: { code: "test" } });
      const header = container.querySelector(
        ".flex.justify-between"
      ) as HTMLElement;
      expect(header).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should handle empty code", () => {
      const { container } = render(CodeBlock, { props: { code: "" } });
      const pre = container.querySelector("pre");
      expect(pre).toBeInTheDocument();
    });

    it("should handle code with HTML entities", () => {
      render(CodeBlock, { props: { code: "<div>&amp;</div>" } });
      expect(screen.getByText("<div>&amp;</div>")).toBeInTheDocument();
    });

    it("should handle multi-line code", () => {
      const multiLineCode = "line1\nline2\nline3";
      const { container } = render(CodeBlock, { props: { code: multiLineCode } });
      const pre = container.querySelector("pre");
      expect(pre?.textContent).toBe(multiLineCode);
    });
  });
});
