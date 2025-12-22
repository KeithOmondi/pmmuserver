import { Types } from "mongoose";
import { Notification } from "../models/Notification";
import { getIO } from "./socket";

export const notifyUser = async (
  userId: Types.ObjectId,
  payload: { title: string; message: string }
) => {
  // Save to DB
  const notification = await Notification.create({
    user: userId,
    title: payload.title,
    message: payload.message,
  });

  // Emit real-time event
  const io = getIO();
  io.to(userId.toString()).emit("notification", notification);
};
