import { RouterProvider } from "react-router-dom";
import { AdminSessionProvider } from "./adminSession";
import { ContactDialogProvider } from "../components/contact/ContactDialogProvider";
import { EditableContentProvider } from "./editableContent";
import { router } from "./router";
import { SitePreferencesProvider } from "./sitePreferences";

export function App() {
  return (
    <SitePreferencesProvider>
      <AdminSessionProvider>
        <EditableContentProvider>
          <ContactDialogProvider>
            <RouterProvider router={router} />
          </ContactDialogProvider>
        </EditableContentProvider>
      </AdminSessionProvider>
    </SitePreferencesProvider>
  );
}
