import { useState, type FormEvent } from "react";
import { EyeOff, LogOut, PencilLine, X } from "lucide-react";
import { useAdminSession } from "../../app/adminSession";
import { useEditableContent } from "../../app/editableContent";
import { EditIconButton } from "./AdminUi";

export function AdminEditor() {
  const admin = useAdminSession();
  const content = useEditableContent();

  return (
    <>
      {admin.isLoginOpen ? <AdminLoginModal /> : null}
      {admin.isAdmin && admin.isEditMode ? <EditingStatus /> : null}
      {content.error ? <div className="admin-toast" role="status">{content.error}</div> : null}
    </>
  );
}

function AdminLoginModal() {
  const { closeLogin, error, isSupabaseReady, signIn } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    await signIn(email, password);
    setIsSubmitting(false);
  }

  return (
    <div className="admin-login" role="dialog" aria-modal="true" aria-label="Inicio de sesión de edición">
      <div className="admin-login__panel">
        <button type="button" className="admin-login__close" aria-label="Cerrar inicio de sesión" onClick={closeLogin}>
          <X aria-hidden="true" />
        </button>
        <h2>Iniciar sesión</h2>
        {!isSupabaseReady ? (
          <p className="admin-form__message admin-form__message--error">
            Supabase no está configurado en el entorno local.
          </p>
        ) : null}
        <form className="admin-form" onSubmit={handleSubmit}>
          <label>
            Email admin
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="admin-form__message admin-form__message--error" role="alert">{error}</p> : null}
          <button type="submit" className="admin-primary-button" disabled={isSubmitting || !isSupabaseReady}>
            {isSubmitting ? "Entrando..." : "Entrar en modo edición"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditingStatus() {
  const { setEditMode, signOut } = useAdminSession();

  return (
    <div className="editing-status" role="status">
      <PencilLine aria-hidden="true" />
      <span>Modo edición</span>
      <EditIconButton label="Ocultar controles de edición" tone="light" onClick={() => setEditMode(false)}>
        <EyeOff aria-hidden="true" />
      </EditIconButton>
      <EditIconButton label="Cerrar sesión" tone="light" onClick={() => void signOut()}>
        <LogOut aria-hidden="true" />
      </EditIconButton>
    </div>
  );
}
