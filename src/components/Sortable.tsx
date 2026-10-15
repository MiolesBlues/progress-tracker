import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

/** Vertical drag-and-drop list (touch-friendly). Calls onReorder with the new id order. */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  render,
  handleLabel,
  draggingClassName,
  disabled = false,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  render: (item: T, handle: ReactNode) => ReactNode;
  handleLabel?: (item: T) => string;
  draggingClassName?: string;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function end(e: DragEndEvent) {
    if (disabled || !e.over || e.active.id === e.over.id) return;
    const ids = items.map((i) => i.id);
    onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {items.map((it) => (
            <Item
              key={it.id}
              id={it.id}
              disabled={disabled}
              handleLabel={handleLabel?.(it) ?? "Перетащить"}
              {...(draggingClassName ? { draggingClassName } : {})}
            >
              {(h) => render(it, h)}
            </Item>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Item({
  id,
  children,
  handleLabel,
  draggingClassName,
  disabled,
}: {
  id: string;
  children: (handle: ReactNode) => ReactNode;
  handleLabel: string;
  draggingClassName?: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={handleLabel}
      disabled={disabled}
      className="touch-none cursor-grab p-1.5 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <GripVertical className="h-5 w-5" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? `relative z-10 ${draggingClassName ?? "opacity-80"}` : undefined}
    >
      {children(handle)}
    </li>
  );
}
