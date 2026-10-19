import { Toaster as Sonner } from "sonner";
import { useI18n } from "@/lib/i18n";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { t } = useI18n();
  return (
    <Sonner
      theme="dark"
      containerAriaLabel={t("Уведомления")}
      className="toaster group pointer-events-none"
      toastOptions={{
        closeButtonAriaLabel: t("Закрыть уведомление"),
        classNames: {
          toast:
            "group toast pointer-events-none group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
