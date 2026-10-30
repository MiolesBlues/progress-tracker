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
import { useI18n } from "@/lib/i18n";

/** Vertical drag-and-drop list (touch-friendly). Calls onReorder with the new id order. */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  render,
  handleLabel,
  handleClassName,
  draggingClassName,
  listClassName,
  disabled = false,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  render: (item: T, handle: ReactNode) => ReactNode;
  handleLabel?: (item: T) => string;
  handleClassName?: string;
  draggingClassName?: string;
  listClassName?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const position = (id: string | number) => items.findIndex((item) => item.id === String(id)) + 1;
  const values = (id: string | number) => ({ position: position(id), count: items.length });
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={end}
      accessibility={{
        screenReaderInstructions: {
          draggable: t(
            "Для перемещения нажмите пробел или Enter. Используйте стрелки для выбора позиции. Снова нажмите пробел или Enter, чтобы завершить, или Escape, чтобы отменить.",
          ),
        },
        announcements: {
          onDragStart: ({ active }) =>
            t("Выбран элемент на позиции {position} из {count}.", values(active.id)),
          onDragOver: ({ over }) =>
            over
              ? t("Элемент перемещён на позицию {position} из {count}.", values(over.id))
              : t("Элемент находится вне области перемещения."),
          onDragEnd: ({ over }) =>
            over
              ? t("Перемещение завершено. Позиция {position} из {count}.", values(over.id))
              : t("Перемещение завершено. Позиция не изменилась."),
          onDragCancel: ({ active }) =>
            t("Перемещение отменено. Исходная позиция {position} из {count}.", values(active.id)),
        },
      }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className={listClassName ?? "space-y-2"}>
          {items.map((it) => (
            <Item
              key={it.id}
              id={it.id}
              disabled={disabled}
              handleLabel={handleLabel?.(it) ?? t("Перетащить")}
              {...(handleClassName ? { handleClassName } : {})}
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
  handleClassName,
  draggingClassName,
  disabled,
}: {
  id: string;
  children: (handle: ReactNode) => ReactNode;
  handleLabel: string;
  handleClassName?: string;
  draggingClassName?: string;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    attributes: { roleDescription: t("Перемещаемый элемент") },
  });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={handleLabel}
      data-sortable-dragging={isDragging ? "true" : undefined}
      disabled={disabled}
      className={`touch-none cursor-grab text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 ${handleClassName ?? "p-1.5"}`}
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
