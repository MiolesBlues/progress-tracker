import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function Loading({ children }: { children?: string }) {
  const { t } = useI18n();
  return (
    <p role="status" className="py-4 text-sm text-muted-foreground">
      {children ?? t("Загрузка…")}
    </p>
  );
}
export function LoadError({ onRetry, children }: { onRetry: () => void; children?: string }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-destructive p-4 text-sm">
      <p>
        {children ??
          t("Не удалось загрузить данные. Проверьте соединение или войдите в аккаунт повторно.")}
      </p>
      <Button type="button" onClick={onRetry}>
        {t("Повторить")}
      </Button>
    </div>
  );
}
