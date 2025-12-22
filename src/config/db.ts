import mongoose from "mongoose";
import { env } from "./env";

const MONGO_URI = env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("❌ MONGO_URI is missing in environment variables.");
}

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: env.DATABASE_NAME || "PMMU", // Use DB name from env or fallback
    });
    console.log("🟢 MongoDB connected");
  } catch (error) {
    console.error("🔴 MongoDB connection error:", error);
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

// Disconnect helper
export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log("🟡 MongoDB disconnected");
  } catch (err) {
    console.error("🔴 Error disconnecting MongoDB:", err);
  }
};

// Graceful shutdown (e.g., docker stop, nodemon restart)
process.on("SIGINT", async () => {
  await disconnectDB();
  process.exit(0);
});
