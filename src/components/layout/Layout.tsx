import { Outlet } from "react-router-dom";
import { AdminEditor } from "../admin/AdminEditor";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Layout() {
  return (
    <div className="app-shell">
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <AdminEditor />
    </div>
  );
}
