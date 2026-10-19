import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState, type ReactNode } from "react";
import { LanguageContext, type Language } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { SortableList } from "./Sortable";

afterEach(cleanup);

function Languages({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ru");
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <button onClick={() => setLanguage(language === "ru" ? "en" : "ru")}>Switch language</button>
      {children}
    </LanguageContext.Provider>
  );
}

it.each(["sheet", "dialog"])(
  "updates the open %s close control without remounting or altering user text",
  (kind) => {
    render(
      <Languages>
        {kind === "sheet" ? (
          <Sheet defaultOpen>
            <SheetContent>
              <SheetTitle>Мой Push</SheetTitle>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog defaultOpen>
            <DialogContent>
              <DialogTitle>Мой Push</DialogTitle>
            </DialogContent>
          </Dialog>
        )}
      </Languages>,
    );
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Switch language", hidden: true }));
    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Мой Push" })).toBeVisible();
  },
);

it("keeps the Sonner region in the selected language during immediate switches", () => {
  render(
    <Languages>
      <Toaster />
    </Languages>,
  );
  expect(screen.getByRole("region", { name: /^Уведомления/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Switch language" }));
  expect(screen.getByRole("region", { name: /^Notifications/ })).toBeInTheDocument();
});

it("localizes keyboard instructions, draggable roles and cancel announcements in both languages", async () => {
  render(
    <Languages>
      <SortableList
        items={[{ id: "private-id", name: "Мой Push" }]}
        onReorder={() => {}}
        render={(item, handle) => (
          <>
            {handle}
            {item.name}
          </>
        )}
      />
    </Languages>,
  );
  const handle = screen.getByRole("button", { name: "Перетащить" });
  expect(handle).toHaveAttribute("aria-roledescription", "Перемещаемый элемент");
  expect(handle).toHaveAccessibleDescription(/Для перемещения нажмите пробел или Enter/);
  handle.focus();
  fireEvent.keyDown(handle, { code: "Space" });
  await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Элемент перемещён на позицию 1 из 1."),
  );
  fireEvent.keyDown(document, { code: "Escape" });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Перемещение отменено. Исходная позиция 1 из 1.",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch language" }));
  expect(handle).toHaveAttribute("aria-roledescription", "Draggable item");
  expect(handle).toHaveAccessibleDescription(/To pick up an item, press Space or Enter/);
  handle.focus();
  fireEvent.keyDown(handle, { code: "Enter" });
  await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Item moved to position 1 of 1."),
  );
  fireEvent.keyDown(document, { code: "Escape" });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Drag cancelled. Original position 1 of 1.",
    ),
  );
  expect(screen.getByText("Мой Push")).toBeVisible();
  expect(screen.getByRole("status")).not.toHaveTextContent("private-id");
});

it.each(["sheet", "dialog"])(
  "Escape cancels the keyboard drag before closing the surrounding %s",
  async (kind) => {
    const list = (
      <SortableList items={[{ id: "one" }]} onReorder={() => {}} render={(_, handle) => handle} />
    );
    render(
      kind === "sheet" ? (
        <Sheet defaultOpen>
          <SheetContent>
            <SheetTitle>Days</SheetTitle>
            {list}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Days</DialogTitle>
            {list}
          </DialogContent>
        </Dialog>
      ),
    );
    const handle = screen.getByRole("button", { name: "Перетащить" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    // KeyboardSensor attaches its document listener on the next timer turn.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(handle, { code: "Escape", key: "Escape" });
    await waitFor(() => expect(handle).not.toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("dialog", { name: "Days" })).toBeVisible();
    fireEvent.keyDown(handle, { code: "Escape", key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Days" })).not.toBeInTheDocument(),
    );
  },
);
