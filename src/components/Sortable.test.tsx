import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SortableList } from "@/components/Sortable";

const items = [{ id: "day-a" }, { id: "day-b" }, { id: "day-c" }];

function mockSortableRects() {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function getRect(this: HTMLElement) {
      const item = this.closest("li");
      const index = item ? Array.from(item.parentElement?.children ?? []).indexOf(item) : -1;
      const top = index < 0 ? 0 : index * 64;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 320,
        bottom: top + 56,
        width: 320,
        height: index < 0 ? 500 : 56,
        toJSON: () => ({}),
      } as DOMRect;
    });
}

function mount(onReorder: (ids: string[]) => void) {
  render(
    <SortableList
      items={items}
      onReorder={onReorder}
      render={(item, handle) => (
        <div>
          {handle}
          <span>{item.id}</span>
        </div>
      )}
    />,
  );
}

it("supports mouse dragging from the handle and returns stable ids in the new order", async () => {
  const onReorder = vi.fn();
  mount(onReorder);
  const rectSpy = mockSortableRects();
  const handle = screen.getAllByRole("button", { name: "Перетащить" })[0]!;
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.pointerMove(document, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    clientX: 20,
    clientY: 30,
  });
  fireEvent.pointerMove(document, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    clientX: 20,
    clientY: 150,
  });
  fireEvent.pointerUp(document, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 20,
    clientY: 150,
  });

  try {
    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["day-b", "day-c", "day-a"]));
  } finally {
    rectSpy.mockRestore();
  }
});

it("requires an intentional touch hold before entering the dragging state", async () => {
  const onReorder = vi.fn();
  mount(onReorder);
  const rectSpy = mockSortableRects();
  const handle = screen.getAllByRole("button", { name: "Перетащить" })[0]!;
  const start = { identifier: 1, target: handle, clientX: 20, clientY: 20 };
  fireEvent.touchStart(handle, { touches: [start], changedTouches: [start] });
  try {
    expect(handle).not.toHaveAttribute("aria-pressed", "true");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 175)));
    expect(handle).toHaveAttribute("aria-pressed", "true");
    expect(onReorder).not.toHaveBeenCalled();
  } finally {
    rectSpy.mockRestore();
  }
});

it("B13 disables pointer, touch and keyboard activation while saving", async () => {
  const onReorder = vi.fn();
  const view = render(
    <SortableList
      items={items}
      disabled
      onReorder={onReorder}
      render={(item, handle) => (
        <div>
          {handle}
          {item.id}
        </div>
      )}
    />,
  );
  const handle = screen.getAllByRole("button", { name: "Перетащить" })[0]!;
  expect(handle).toBeDisabled();
  fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 });
  fireEvent.keyDown(handle, { key: "Space", code: "Space" });
  fireEvent.touchStart(handle, {
    touches: [{ identifier: 1, target: handle, clientX: 20, clientY: 20 }],
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 175)));
  expect(handle).not.toHaveAttribute("aria-pressed", "true");
  expect(onReorder).not.toHaveBeenCalled();
  view.rerender(
    <SortableList
      items={items}
      onReorder={onReorder}
      render={(item, dragHandle) => (
        <div>
          {dragHandle}
          {item.id}
        </div>
      )}
    />,
  );
  expect(screen.getAllByRole("button", { name: "Перетащить" })[0]).toBeEnabled();
});
