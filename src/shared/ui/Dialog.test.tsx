import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Dialog } from "./dialog";

afterEach(cleanup);

it.each(["dialog", "alertdialog"] as const)("keeps %s headings out of the window's banner landmarks", (role) => {
  render(<>
    <header>Window controls</header>
    <Dialog size="m" title="Review changes" titleId="review-title" icon={null} tone="local" role={role}>
      <button type="button">Cancel</button>
    </Dialog>
  </>);

  const dialog = screen.getByRole(role, { name: "Review changes" });
  expect(within(dialog).getByRole("heading", { name: "Review changes" })).toBeInTheDocument();
  expect(screen.getAllByRole("banner")).toHaveLength(1);
});
