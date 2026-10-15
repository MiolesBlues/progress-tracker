import { Settings } from "lucide-react";
import { useI18n, type Language } from "@/lib/i18n";
import { useArchivePreferences, useWorkoutPreferences } from "@/lib/archive-preferences";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SettingsDialog({ disabled = false }: { disabled?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  const { userId } = useSession();
  const archive = useArchivePreferences(userId);
  const workout = useWorkoutPreferences(userId);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label={t("Настройки")}
          className="h-11 w-11 shrink-0 text-muted-foreground"
        >
          <Settings aria-hidden="true" className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={t("Закрыть")}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl border-border bg-background p-5 text-foreground"
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{t("Настройки")}</DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-2">
          <label id="interface-language-label" className="block text-sm font-medium">
            {t("Язык интерфейса")}
          </label>
          <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
            <SelectTrigger
              aria-labelledby="interface-language-label"
              className="h-12 min-w-0 bg-card"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="z-[60] w-[var(--radix-select-trigger-width)]"
            >
              <SelectItem value="ru">{t("Русский")}</SelectItem>
              <SelectItem value="en">{t("English")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <fieldset className="space-y-3 border-t pt-4" disabled={!archive.available}>
          <legend className="pb-2 text-sm font-semibold">{t("Управление данными")}</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              checked={archive.deletionEnabled}
              onCheckedChange={(checked) => archive.setDeletionEnabled(checked === true)}
              aria-label={t("Разрешить полное удаление")}
            />
            <span>{t("Разрешить полное удаление")}</span>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              checked={archive.showArchive}
              onCheckedChange={(checked) => archive.setShowArchive(checked === true)}
              aria-label={t("Показывать архивные дни и упражнения")}
            />
            <span>{t("Показывать архивные дни и упражнения")}</span>
          </label>
        </fieldset>
        <fieldset className="space-y-3 border-t pt-4" disabled={!workout.available}>
          <legend className="pb-2 text-sm font-semibold">{t("Тренировка")}</legend>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <Checkbox
              checked={workout.autoAdvance}
              onCheckedChange={(checked) => workout.setAutoAdvance(checked === true)}
              aria-label={t("Автоматически переходить к следующему упражнению")}
            />
            <span className="space-y-1">
              <span className="block">{t("Автоматически переходить к следующему упражнению")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("После сохранения выбирать следующее упражнение")}
              </span>
            </span>
          </label>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
