import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  kind: "day" | "exercise";
  id: string;
  name: string;
  userId: string;
  exerciseCount?: number;
  disabled: boolean;
  onConfirm: () => Promise<boolean>;
};

export function ArchiveDeleteDialog({
  kind,
  id,
  name,
  userId,
  exerciseCount = 0,
  disabled,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const countResult = useQuery({
    queryKey: ["user", userId, "archive-delete-count", kind, id],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const { count, error: queryError } = await supabase
        .from("workout_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq(kind === "day" ? "day_id" : "exercise_id", id);
      if (queryError || count === null) throw queryError ?? new Error("Count unavailable");
      return count;
    },
  });
  async function confirm() {
    if (disabled || !countResult.isSuccess || countResult.isFetching) return;
    setError("");
    if (await onConfirm()) setOpen(false);
    else
      setError(
        t("Не удалось удалить. Данные сохранены; проверьте соединение и повторите попытку."),
      );
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!disabled) {
          setOpen(next);
          setError("");
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label={
            kind === "day"
              ? t("Удалить день: {name}", { name })
              : t("Удалить упражнение: {name}", { name })
          }
          className="h-9 w-9 shrink-0 text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-xl p-5">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>
            {kind === "day" ? t("Удалить архивный день?") : t("Удалить архивное упражнение?")}
          </AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {kind === "day"
              ? t("День «{name}» будет удалён навсегда. Упражнения и вся история сохранятся.", {
                  name,
                })
              : t(
                  "Упражнение «{name}» и вся его история будут удалены без возможности восстановления.",
                  { name },
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 break-words text-sm">
          {kind === "day" && <p>{t("Связанных упражнений: {count}", { count: exerciseCount })}</p>}
          {countResult.isPending || countResult.isFetching ? (
            <p role="status">{t("Подсчёт записей…")}</p>
          ) : countResult.isError ? (
            <p role="alert">
              {t("Не удалось подсчитать записи.")}{" "}
              <Button type="button" variant="link" onClick={() => void countResult.refetch()}>
                {t("Повторить")}
              </Button>
            </p>
          ) : (
            <p>{t("Исторических записей: {count}", { count: countResult.data })}</p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={disabled}>{t("Отмена")}</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={disabled || !countResult.isSuccess || countResult.isFetching}
            onClick={() => void confirm()}
          >
            {kind === "day" ? t("Удалить день") : t("Удалить навсегда")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
