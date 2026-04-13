import { Route, Routes } from "react-router-dom";
import { ShellLayout } from "./layout/ShellLayout";
import { GatewayPage } from "./pages/GatewayPage";
import { HomePage } from "./pages/HomePage";
import { LogsPage } from "./pages/LogsPage";
import { SqlitePage } from "./pages/SqlitePage";

export function App() {
  return (
    <ShellLayout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/gateway" element={<GatewayPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/sqlite" element={<SqlitePage />} />
      </Routes>
    </ShellLayout>
  );
}
