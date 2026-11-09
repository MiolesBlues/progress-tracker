import { Monitor, Moon, Settings, Sun } from "lucide-react";
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
import { useTheme, type ThemeMode } from "@/lib/theme";

export function SettingsDialog({ disabled = false }: { disabled?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  const { mode, setMode } = useTheme();
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
        className="scrollbar-hidden max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl border-border bg-background p-5 text-foreground"
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
        <fieldset className="space-y-2">
          <legend className="pb-1 text-sm font-medium">{t("Тема оформления")}</legend>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("Тема оформления")}>
            {(
              [
                ["system", Monitor, "Авто"],
                ["light", Sun, "Светлая"],
                ["dark", Moon, "Тёмная"],
              ] as const
            ).map(([value, Icon, label]) => (
              <Button
                key={value}
                type="button"
                variant={mode === value ? "secondary" : "outline"}
                aria-pressed={mode === value}
                onClick={() => setMode(value as ThemeMode)}
                className="h-12 min-w-0 flex-col gap-1 px-2 text-xs aria-pressed:border-primary aria-pressed:text-foreground"
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {t(label)}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-3 border-t pt-4" disabled={!archive.available}>
          <legend className="pb-2 text-sm font-semibold">{t("Управление данными")}</legend>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <Checkbox
              checked={archive.deletionEnabled}
              onCheckedChange={(checked) => archive.setDeletionEnabled(checked === true)}
              aria-label={t("Разрешить полное удаление")}
              aria-describedby="permanent-deletion-description"
            />
            <span className="space-y-1">
              <span className="block">{t("Разрешить полное удаление")}</span>
              <span
                id="permanent-deletion-description"
                className="block text-xs text-muted-foreground"
              >
                {t(
                  "Показывает окончательное удаление для архивных объектов; удалённые данные нельзя восстановить",
                )}
              </span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <Checkbox
              checked={archive.showArchive}
              onCheckedChange={(checked) => archive.setShowArchive(checked === true)}
              aria-label={t("Показывать архивные дни и упражнения")}
              aria-describedby="show-archive-description"
            />
            <span className="space-y-1">
              <span className="block">{t("Показывать архивные дни и упражнения")}</span>
              <span id="show-archive-description" className="block text-xs text-muted-foreground">
                {t("Показывает архивированные дни и упражнения в программе для восстановления")}
              </span>
            </span>
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
