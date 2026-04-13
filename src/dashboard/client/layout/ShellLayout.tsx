import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-eyebrow">Investment OS Console</div>
          <h1 className="topbar-title">控制台</h1>
        </div>
        <nav className="topbar-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            总览
          </NavLink>
          <NavLink to="/logs" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            日志
          </NavLink>
          <NavLink to="/gateway" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            飞书网关
          </NavLink>
          <NavLink to="/sqlite" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            SQLite
          </NavLink>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
