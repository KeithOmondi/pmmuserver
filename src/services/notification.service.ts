import { Types } from "mongoose";
import { Notification } from "../models/Notification";
import { getIO } from "../sockets/socket";

export const notifyUser = async ({
  userId,
  submittedBy,
  title,
  message,
  type = "system",
  metadata,
}: {
  userId: Types.ObjectId;
  submittedBy?: Types.ObjectId;
  title: string;
  message: string;
  type?: "system" | "assignment" | "approval" | "rejection";
  metadata?: Record<string, any>;
}) => {
  const notification = await Notification.create({
    user: userId,
    submittedBy,
    title,
    message,
    type,
    metadata,
  });

  // Emit to recipient
  getIO().to(userId.toString()).emit("notification:new", notification);

  // Optionally emit to admins
  getIO().to("admin").emit("notification:new", notification);

  return notification;
};
