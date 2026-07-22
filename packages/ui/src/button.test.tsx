import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Book now</Button>);
    expect(screen.getByRole("button", { name: "Book now" })).toBeInTheDocument();
  });

  it("applies the primary variant by default", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-navy");
  });

  it("applies the danger variant when asked", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-danger");
  });

  it("is disabled and non-interactive when loading", () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Pay
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("exposes a busy state to assistive technology when loading", () => {
    render(<Button isLoading>Pay</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("forwards arbitrary native button props", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("merges a caller-supplied className over the variant class", () => {
    render(<Button className="bg-gold">Custom</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-gold");
    expect(button).not.toHaveClass("bg-navy");
  });
});
