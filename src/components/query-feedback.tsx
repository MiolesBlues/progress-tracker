import { Button } from "@/components/ui/button";

export function Loading({ children = "Загрузка…" }: { children?: string }) {
  return (
    <p role="status" className="py-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
export function LoadError({
  onRetry,
  children = "Не удалось загрузить данные. Проверьте соединение или войдите в аккаунт повторно.",
}: {
  onRetry: () => void;
  children?: string;
}) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-destructive p-4 text-sm">
      <p>{children}</p>
      <Button type="button" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}
