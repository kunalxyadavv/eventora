import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
import { Events, Auth, MyBookings, Admin } from "./pages.jsx";

function Nav() {
  const { user, logout } = useAuth();
  const link = ({ isActive }) => (isActive ? "font-semibold underline decoration-stub decoration-2 underline-offset-4" : "hover:underline");
  return (
    <header className="bg-ink text-white">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <NavLink to="/" className="mr-auto font-display text-2xl font-extrabold">Eventora</NavLink>
        <NavLink to="/" end className={link}>Events</NavLink>
        {user && <NavLink to="/bookings" className={link}>My tickets</NavLink>}
        {user?.role === "admin" && <NavLink to="/admin" className={link}>Admin</NavLink>}
        {user ? <button onClick={logout} className="hover:underline">Log out</button> : <NavLink to="/login" className={link}>Log in</NavLink>}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <Routes>
            <Route path="/" element={<Events />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/bookings" element={<Guard><MyBookings /></Guard>} />
            <Route path="/admin" element={<Guard admin><Admin /></Guard>} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
  );
}

function Guard({ admin, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (admin && user.role !== "admin") return <Navigate to="/" />;
  return children;
}
