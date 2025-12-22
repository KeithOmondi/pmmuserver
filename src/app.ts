import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import indicatorRoutes from "./routes/indicatorRoutes";
import userRoutes from "./routes/userRoutes";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// --------------------------
// CORS Setup
// --------------------------
app.use(
  cors({
    origin: env.FRONTEND_URL, // dynamically set from env
    credentials: true, // allow cookies, authorization headers, etc.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], // optional: restrict HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // optional: restrict headers
  })
);

app.use(express.json());

// --------------------------
// Routes
// --------------------------
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/category", categoryRoutes);
app.use("/api/v1/indicators", indicatorRoutes);
app.use("/api/v1/users", userRoutes);

// --------------------------
// Root route
// --------------------------
app.get("/", (_req, res) => {
  res.json({ message: "API is running 🚀" });
});

// --------------------------
// Error handler middleware
// --------------------------
app.use(errorHandler);

export default app;
