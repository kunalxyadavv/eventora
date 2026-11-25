import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg } from "./api";
import { useAuth } from "./auth.jsx";

const fmtDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const money = (n) => (n ? `₹${n}` : "Free");

// ---------- Browse & book ----------
export function Events() {
  const [events, setEvents] = useState([]);
  const [msg, setMsg] = useState("");
  const { user } = useAuth();
  const nav = useNavigate();
  const load = () => api.get("/api/events").then((r) => setEvents(r.data));
  useEffect(() => { load(); }, []);

  const book = async (id) => {
    if (!user) return nav("/login");
    try {
      await api.post("/api/bookings", { eventId: id, quantity: 1 });
      setMsg("Booked. Your ticket is under My tickets.");
      load();
    } catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <>
      <h1 className="mb-6 font-display text-3xl font-bold">Upcoming events</h1>
      {msg && <p role="status" className="mb-4 rounded-lg bg-white p-3">{msg}</p>}
      {!events.length && <p>No upcoming events yet. Check back soon.</p>}
      <ul className="grid gap-4">
        {events.map((e) => (
          <li key={e._id} className="flex overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="flex-1 p-5">
              <h2 className="font-display text-xl font-bold">{e.title}</h2>
              <p className="text-sm text-ink/70">{fmtDate(e.date)} · {e.venue}</p>
              <p className="mt-2 text-sm">{e.description}</p>
            </div>
            <div className="flex w-36 flex-col items-center justify-center gap-2 border-l-2 border-dashed border-ink/25 p-4 text-center">
              <span className="font-display text-2xl font-bold">{money(e.price)}</span>
              <span className="text-xs text-ink/70">{e.seats} seats left</span>
              <button className="btn" disabled={!e.seats} onClick={() => book(e._id)}>{e.seats ? "Book 1" : "Sold out"}</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Login / Sign up / OTP ----------
export function Auth() {
  const [mode, setMode] = useState("login"); // login | signup | verify
  const [f, setF] = useState({ name: "", email: "", password: "", otp: "" });
  const [error, setError] = useState("");
  const { login } = useAuth();
  const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "signup") { await api.post("/api/auth/signup", f); setMode("verify"); return; }
      const path = mode === "verify" ? "/api/auth/verify" : "/api/auth/login";
      const { data } = await api.post(path, f);
      login(data);
      nav("/");
    } catch (err) { setError(errMsg(err)); }
  };

  const title = { login: "Log in", signup: "Create account", verify: "Enter your code" }[mode];
  return (
    <form onSubmit={submit} className="mx-auto grid max-w-sm gap-3 rounded-xl bg-white p-6 shadow-sm">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {mode === "signup" && <input className="input" placeholder="Full name" value={f.name} onChange={set("name")} />}
      <input className="input" type="email" placeholder="Email" value={f.email} onChange={set("email")} disabled={mode === "verify"} />
      {mode !== "verify" && <input className="input" type="password" placeholder="Password (6+ characters)" value={f.password} onChange={set("password")} />}
      {mode === "verify" && <>
        <p className="text-sm text-ink/70">We emailed a 6-digit code to {f.email}.</p>
        <input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={f.otp} onChange={set("otp")} />
      </>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="btn">{mode === "login" ? "Log in" : mode === "signup" ? "Send code" : "Verify email"}</button>
      {mode !== "verify" && (
        <button type="button" className="text-sm underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Log in"}
        </button>
      )}
    </form>
  );
}

// ---------- My tickets ----------
const badge = { pending: "bg-amber-100 text-amber-900", paid: "bg-green-100 text-green-900", failed: "bg-red-100 text-red-900" };

export function MyBookings() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get("/api/bookings/mine").then((r) => setItems(r.data)); }, []);
  if (!items) return null;
  return (
    <>
      <h1 className="mb-6 font-display text-3xl font-bold">My tickets</h1>
      {!items.length && <p>You haven’t booked anything yet.</p>}
      <ul className="grid gap-3">
        {items.map((b) => (
          <li key={b._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-4 shadow-sm">
            <div>
              <h2 className="font-display text-lg font-bold">{b.event?.title ?? "Event removed"}</h2>
              <p className="text-sm text-ink/70">{b.quantity} ticket(s) · {money(b.total)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${badge[b.paymentStatus]}`}>{b.paymentStatus}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Admin dashboard ----------
const blank = { title: "", venue: "", date: "", price: 0, seats: 50, description: "" };

export function Admin() {
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [f, setF] = useState(blank);
  const [error, setError] = useState("");
  const load = () => {
    api.get("/api/events").then((r) => setEvents(r.data));
    api.get("/api/bookings").then((r) => setBookings(r.data));
  };
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    try { await api.post("/api/events", f); setF(blank); setError(""); load(); }
    catch (err) { setError(errMsg(err)); }
  };
  const remove = async (id) => { await api.delete(`/api/events/${id}`); load(); };
  const setPayment = async (id, paymentStatus) => { await api.patch(`/api/bookings/${id}/payment`, { paymentStatus }); load(); };

  return (
    <div className="grid gap-10">
      <section>
        <h1 className="mb-4 font-display text-3xl font-bold">Manage events</h1>
        <form onSubmit={create} className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2">
          <input className="input" placeholder="Title" value={f.title} onChange={set("title")} required />
          <input className="input" placeholder="Venue" value={f.venue} onChange={set("venue")} />
          <input className="input" type="datetime-local" value={f.date} onChange={set("date")} required />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" min="0" placeholder="Price" value={f.price} onChange={set("price")} />
            <input className="input" type="number" min="1" placeholder="Seats" value={f.seats} onChange={set("seats")} />
          </div>
          <textarea className="input sm:col-span-2" placeholder="Description" value={f.description} onChange={set("description")} />
          {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
          <button className="btn sm:col-span-2">Add event</button>
        </form>
        <ul className="mt-4 grid gap-2">
          {events.map((e) => (
            <li key={e._id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2">
              <span>{e.title} <span className="text-sm text-ink/60">· {e.seats} seats left</span></span>
              <button className="text-sm text-red-700 underline" onClick={() => remove(e._id)}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">Bookings</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10"><tr><th className="p-3">Guest</th><th className="p-3">Event</th><th className="p-3">Qty</th><th className="p-3">Total</th><th className="p-3">Payment</th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id} className="border-b border-ink/5">
                  <td className="p-3">{b.user?.name}<br /><span className="text-ink/60">{b.user?.email}</span></td>
                  <td className="p-3">{b.event?.title}</td>
                  <td className="p-3">{b.quantity}</td>
                  <td className="p-3">{money(b.total)}</td>
                  <td className="p-3">
                    <select className="input !w-auto" value={b.paymentStatus} onChange={(e) => setPayment(b._id, e.target.value)} aria-label="Payment status">
                      <option>pending</option><option>paid</option><option>failed</option>
                    </select>
                  </td>
                </tr>
              ))}
              {!bookings.length && <tr><td className="p-3" colSpan={5}>No bookings yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
