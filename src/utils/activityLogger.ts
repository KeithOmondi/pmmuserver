import { Types } from "mongoose";
import { ActivityLog } from "../models/ActivityLog";
import { redisClient } from "../config/redis";
import { getIO } from "../sockets/socket";

interface LogActivityInput {
  user: Types.ObjectId | string;
  userName?: string;
  action: string;
  level?: "info" | "warn" | "error" | "success";
  entity?: string;
  entityId?: Types.ObjectId | string;
  meta?: Record<string, any>;
}

export const logActivity = async ({
  user,
  userName,
  action,
  level = "info",
  entity,
  entityId,
  meta,
}: LogActivityInput) => {
  const timestamp = new Date();

  // 1. Format the Date (e.g., Dec 24, 2025)
  const dateStr = timestamp.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // 2. Format the User Display
  // Handles the "SYSTEM" string or MongoDB ObjectIds gracefully
  const isSystem = user === "SYSTEM";
  const userDisplay = userName
    ? `[${userName}]`
    : isSystem
    ? "[SYSTEM]"
    : `[ID: ${user.toString().slice(-4)}]`;

  // 3. Prepare Log Object
  const logData = {
    user: user.toString(),
    userName,
    action,
    level,
    timestamp: timestamp.toISOString(),
    // New Format: DATE | USER ACTION: ENTITY
    message: `${dateStr} | ${userDisplay} ${action.replace(/_/g, " ")}: ${
      entity || "System Event"
    }`,
  };

  try {
    // 4. Push to Redis (Live Feed)
    if (redisClient.isOpen) {
      await redisClient.lPush("system:live_logs", JSON.stringify(logData));
      await redisClient.lTrim("system:live_logs", 0, 499);
    }

    // 5. Emit via Socket.io (Real-time UI)
    const io = getIO();
    if (io) {
      io.emit("new_log", logData);
    }

    // 6. Save to MongoDB (Permanent Audit)
    // If it's a SYSTEM log, we generate a generic ID or use a dedicated System User ID
    const mongoUserId = isSystem ? new Types.ObjectId() : user;

    await ActivityLog.create({
      user: mongoUserId,
      action,
      entity,
      entityId,
      metadata: { ...meta, userName },
    });

    console.log(`🛠️ Logged: ${action} for ${userName || "Unknown"}`);
  } catch (error) {
    console.error("❌ Logger Error:", error);
  }
};
