import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle, X } from "lucide-react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "default" | "danger" | "light";
  children: ReactNode;
};

export function EditIconButton({ children, className, label, tone = "default", ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`editor-icon-button editor-icon-button--${tone}${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

type AdminDialogProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  isActive?: boolean;
  closeDisabled?: boolean;
};

export function AdminDialog({ children, className, onClose, title, isActive = true, closeDisabled = false }: AdminDialogProps) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = closeDisabled ? () => undefined : onClose;
  useEffect(() => {
    if (!isActive) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      ) ?? []).filter((element) => element.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isActive]);

  return (
    <div className="admin-dialog-backdrop" role="presentation" hidden={!isActive} style={!isActive ? { display: "none" } : undefined} onMouseDown={closeDisabled ? undefined : onClose}>
      <section
        ref={panel}
        tabIndex={-1}
        className={`admin-dialog${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="admin-dialog__header">
          <h2>{title}</h2>
          <EditIconButton label="Cerrar" className="admin-dialog__close" onClick={onClose} disabled={closeDisabled}>
            <X aria-hidden="true" />
          </EditIconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  confirmLabel = "Eliminar",
  description,
  isPending = false,
  onCancel,
  onConfirm,
  title,
}: ConfirmDialogProps) {
  return (
    <AdminDialog title={title} onClose={isPending ? () => undefined : onCancel} className="admin-dialog--confirm">
      <div className="admin-dialog__body">
        <p>{description}</p>
        <div className="admin-dialog__actions">
          <button type="button" className="admin-secondary-button" disabled={isPending} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="admin-danger-button" disabled={isPending} onClick={onConfirm}>
            {isPending ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : null}
            {isPending ? "Eliminando..." : confirmLabel}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p className="admin-form__message admin-form__message--error" role="alert">{error}</p>;
  if (success) return <p className="admin-form__message admin-form__message--success" role="status">{success}</p>;
  return null;
}
