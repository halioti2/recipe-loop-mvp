import { useLocation } from "react-router-dom";

export default function RootLayout({ children }) {
  const location = useLocation();

  const linkBase = "px-2 py-1 rounded";
  const active = "bg-blue-600 text-white font-semibold";
  const inactive = "text-blue-800 hover:bg-blue-100";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-white p-4 shadow">
        <nav className="flex gap-4">
          <a
            href="/"
            className={`${linkBase} ${location.pathname === "/" ? active : inactive}`}
          >
            Home
          </a>
          <a
            href="/list"
            className={`${linkBase} ${location.pathname === "/list" ? active : inactive}`}
          >
            Grocery List
          </a>
        </nav>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
