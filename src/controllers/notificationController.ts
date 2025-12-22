import { Response } from "express";
import { Notification } from "../models/Notification";

// Get notifications for current user
export const getMyNotifications = async (req: any, res: Response) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ success: true, notifications });
};

// Get all notifications (Admin only)
export const getAllNotifications = async (req: any, res: Response) => {
  const notifications = await Notification.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("submittedBy", "name email"); // include submittedBy name

  res.json({ success: true, notifications });
};

// Mark notification as read
export const markAsRead = async (req: any, res: Response) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true }
  );

  res.json({ success: true });
};
