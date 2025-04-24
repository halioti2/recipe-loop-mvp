export default function RootLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4 shadow">
        <nav className="flex gap-4">
          <a href="/"  className="text-blue-600">Home</a>
          <a href="/list" className="text-blue-600">Grocery List</a>
        </nav>
      </header>

      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}