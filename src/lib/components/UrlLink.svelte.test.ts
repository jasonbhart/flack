/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import UrlLink from "./UrlLink.svelte";

describe("UrlLink", () => {
  it("should render a link with the correct href", () => {
    render(UrlLink, { props: { url: "https://example.com" } });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("should display the URL as text when no displayText is provided", () => {
    render(UrlLink, { props: { url: "https://example.com/path" } });
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("https://example.com/path");
  });

  it("should display custom displayText when provided", () => {
    render(UrlLink, {
      props: { url: "https://example.com", displayText: "Click here" },
    });
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("Click here");
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("should have target=_blank for new tab", () => {
    render(UrlLink, { props: { url: "https://example.com" } });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("should have rel=noopener noreferrer for security", () => {
    render(UrlLink, { props: { url: "https://example.com" } });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should have proper styling classes", () => {
    render(UrlLink, { props: { url: "https://example.com" } });
    const link = screen.getByRole("link");
    expect(link).toHaveClass("text-volt");
    expect(link).toHaveClass("underline");
  });
});
