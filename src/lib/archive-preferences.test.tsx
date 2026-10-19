import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useArchivePreferences } from "./archive-preferences";

function Probe({ userId }: { userId: string | null }) {
  const preference = useArchivePreferences(userId);
  return (
    <div>
      <span data-testid="delete">{String(preference.deletionEnabled)}</span>
      <span data-testid="archive">{String(preference.showArchive)}</span>
      <button onClick={() => preference.setDeletionEnabled(true)}>Enable deletion</button>
      <button onClick={() => preference.setShowArchive(true)}>Show archive</button>
    </div>
  );
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("defaults to hidden deletion and archive, persists separately for each account", () => {
  const view = render(<Probe userId="A" />);
  expect(screen.getByTestId("delete")).toHaveTextContent("false");
  expect(screen.getByTestId("archive")).toHaveTextContent("false");
  fireEvent.click(screen.getByRole("button", { name: "Enable deletion" }));
  fireEvent.click(screen.getByRole("button", { name: "Show archive" }));
  expect(screen.getByTestId("delete")).toHaveTextContent("true");
  expect(screen.getByTestId("archive")).toHaveTextContent("true");
  expect(localStorage.getItem("app:archive-settings:v1:A")).toBe("3");
  view.rerender(<Probe userId="B" />);
  expect(screen.getByTestId("delete")).toHaveTextContent("false");
  expect(screen.getByTestId("archive")).toHaveTextContent("false");
  view.rerender(<Probe userId="A" />);
  expect(screen.getByTestId("delete")).toHaveTextContent("true");
  expect(screen.getByTestId("archive")).toHaveTextContent("true");
  cleanup();
  render(<Probe userId="A" />);
  expect(screen.getByTestId("archive")).toHaveTextContent("true");
});

it("does not persist user settings under a guest key", () => {
  render(<Probe userId={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Enable deletion" }));
  expect(screen.getByTestId("delete")).toHaveTextContent("false");
  expect(localStorage.length).toBe(0);
});
