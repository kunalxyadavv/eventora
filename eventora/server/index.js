import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { randomInt } from "crypto";

const { MONGO_URI, JWT_SECRET, CLIENT_URL = "http://localhost:5173", PORT = 5000,
  ADMIN_EMAIL, SMTP_HOST, SMTP_PORT = 587, SMTP_USER, SMTP_PASS } = process.env;
const { Schema, model } = mongoose;
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m, required: true });

// ---- Models ----
const User = model("User", new Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  password: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
  verified: { type: Boolean, default: false },
  otp: String,
  otpExpires: Date,
}));
const Event = model("Event", new Schema({
  title: { type: String, required: true },
  description: String,
  venue: String,
  date: { type: Date, required: true },
  price: { type: Number, default: 0, min: 0 },
  seats: { type: Number, required: true, min: 0 },
}, { timestamps: true }));
const Booking = model("Booking", new Schema({
  user: ref("User"), event: ref("Event"),
  quantity: { type: Number, min: 1 }, total: Number,
  paymentStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
}, { timestamps: true }));

// ---- Helpers ----
const mailer = SMTP_HOST
  ? nodemailer.createTransport({ host: SMTP_HOST, port: +SMTP_PORT, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;
const sendOtp = async (email, otp) => {
  if (!mailer) return console.log(`[DEV] OTP for ${email}: ${otp}`);
  await mailer.sendMail({ from: SMTP_USER, to: email, subject: "Your Eventora verification code",
    text: `Your code is ${otp}. It expires in 10 minutes.` });
};
const signToken = (u) => jwt.sign({ id: u._id, role: u.role }, JWT_SECRET, { expiresIn: "7d" });
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });
const h = (fn) => (req, res, next) => fn(req, res, next).catch((e) => res.status(400).json({ error: e.message }));
const auth = (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Please log in" }); }
};
const admin = (req, res, next) => (req.user.role === "admin" ? next() : res.status(403).json({ error: "Admins only" }));

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// ---- Auth: signup -> email OTP -> verified login ----
app.post("/api/auth/signup", h(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: "Name, email and a 6+ character password are required" });
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing?.verified) return res.status(409).json({ error: "Email already registered" });
  const otp = String(randomInt(100000, 1000000));
  await User.findOneAndUpdate({ email: email.toLowerCase() }, {
    name, password: await bcrypt.hash(password, 10),
    otp: await bcrypt.hash(otp, 8), otpExpires: new Date(Date.now() + 10 * 60 * 1000),
  }, { upsert: true, new: true });
  await sendOtp(email, otp);
  res.status(201).json({ message: "Verification code sent" });
}));

app.post("/api/auth/verify", h(async (req, res) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase() });
  if (!user?.otp || user.otpExpires < new Date() || !(await bcrypt.compare(String(req.body.otp), user.otp)))
    return res.status(400).json({ error: "Invalid or expired code" });
  user.verified = true; user.otp = undefined; user.otpExpires = undefined;
  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL.toLowerCase()) user.role = "admin";
  await user.save();
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.post("/api/auth/login", h(async (req, res) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || "", user.password || "")))
    return res.status(401).json({ error: "Wrong email or password" });
  if (!user.verified) return res.status(403).json({ error: "Email not verified. Sign up again to get a new code." });
  res.json({ token: signToken(user), user: publicUser(user) });
}));

// ---- Events ----
app.get("/api/events", h(async (req, res) => {
  res.json(await Event.find({ date: { $gt: new Date() } }).sort("date"));
}));
app.post("/api/events", auth, admin, h(async (req, res) => res.status(201).json(await Event.create(req.body))));
app.delete("/api/events/:id", auth, admin, h(async (req, res) => {
  await Event.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// ---- Bookings ----
app.post("/api/bookings", auth, h(async (req, res) => {
  const qty = Math.max(1, Math.min(10, +req.body.quantity || 1));
  // Atomic seat decrement prevents overbooking
  const event = await Event.findOneAndUpdate(
    { _id: req.body.eventId, seats: { $gte: qty }, date: { $gt: new Date() } },
    { $inc: { seats: -qty } }, { new: true });
  if (!event) return res.status(400).json({ error: "Not enough seats, or the event has passed" });
  res.status(201).json(await Booking.create({ user: req.user.id, event: event._id, quantity: qty, total: event.price * qty }));
}));
app.get("/api/bookings/mine", auth, h(async (req, res) => {
  res.json(await Booking.find({ user: req.user.id }).populate("event").sort("-createdAt"));
}));
app.get("/api/bookings", auth, admin, h(async (req, res) => {
  res.json(await Booking.find().populate("user", "name email").populate("event", "title").sort("-createdAt"));
}));
app.patch("/api/bookings/:id/payment", auth, admin, h(async (req, res) => {
  res.json(await Booking.findByIdAndUpdate(req.params.id, { paymentStatus: req.body.paymentStatus }, { new: true, runValidators: true }));
}));

mongoose.connect(MONGO_URI).then(() => {
  app.listen(PORT, () => console.log(`Eventora API on :${PORT}`));
}).catch((e) => { console.error("MongoDB connection failed:", e.message); process.exit(1); });
