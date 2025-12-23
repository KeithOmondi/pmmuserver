import { Response } from "express";
import { Types } from "mongoose";
import { Notification } from "../models/Notification";
import { User } from "../models/User";
import { getIO } from "../sockets/socket";

/* =========================================================
   USER: Get my notifications
========================================================= */
export const getMyNotifications = async (req: any, res: Response) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("submittedBy", "name email"); // populate submitter info

  res.status(200).json({
    success: true,
    notifications,
  });
};

/* =========================================================
   ADMIN / SUPER ADMIN: Get all notifications
========================================================= */
export const getAllNotifications = async (req: any, res: Response) => {
  const notifications = await Notification.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("submittedBy", "name email") // populate submitter info
    .populate("user", "name email role"); // optional: the recipient info

  res.status(200).json({
    success: true,
    notifications,
  });
};

/* =========================================================
   USER: Mark notification as read
========================================================= */
export const markAsRead = async (req: any, res: Response) => {
  const { id } = req.params;

  await Notification.findOneAndUpdate(
    { _id: id, user: req.user._id },
    { read: true }
  );

  res.status(200).json({ success: true });
};

/* =========================================================
   SUPER ADMIN: Broadcast to ALL users
========================================================= */
export const broadcastNotification = async (req: any, res: Response) => {
  const { title, message, type = "system" } = req.body;

  if (!title || !message) {
    return res.status(400).json({
      success: false,
      message: "Title and message are required",
    });
  }

  const users = await User.find({}, "_id");

  if (!users.length) {
    return res.status(404).json({
      success: false,
      message: "No users found",
    });
  }

  const notifications = users.map((u) => ({
    user: u._id,
    title,
    message,
    type,
    read: false,
    metadata: {
      scope: "broadcast",
      sentBy: req.user._id,
    },
  }));

  const created = await Notification.insertMany(notifications);

  const io = getIO();
  created.forEach((n) => {
    io.to(n.user.toString()).emit("newNotification", n);
  });

  res.status(201).json({
    success: true,
    count: created.length,
  });
};

/* =========================================================
   SUPER ADMIN: Send to ONE user
========================================================= */
export const notifySingleUser = async (req: any, res: Response) => {
  const { userId, title, message, type = "system" } = req.body;

  if (!userId || !title || !message) {
    return res.status(400).json({
      success: false,
      message: "userId, title and message are required",
    });
  }

  const notification = await Notification.create({
    user: new Types.ObjectId(userId),
    title,
    message,
    type,
    read: false,
    metadata: {
      scope: "user",
      sentBy: req.user._id,
    },
    submittedBy: req.user._id, // <-- mark who submitted
  });

  getIO()
    .to(userId.toString())
    .emit("newNotification", notification);

  res.status(201).json({
    success: true,
    notification,
  });
};

/* =========================================================
   SUPER ADMIN: Send to GROUP
========================================================= */
export const notifyUserGroup = async (req: any, res: Response) => {
  const { userIds, title, message, type = "system" } = req.body;

  if (!Array.isArray(userIds) || !userIds.length) {
    return res.status(400).json({
      success: false,
      message: "userIds array is required",
    });
  }

  const notifications = userIds.map((id: string) => ({
    user: new Types.ObjectId(id),
    title,
    message,
    type,
    read: false,
    metadata: {
      scope: "group",
      sentBy: req.user._id,
    },
    submittedBy: req.user._id,
  }));

  const created = await Notification.insertMany(notifications);

  const io = getIO();
  created.forEach((n) => {
    io.to(n.user.toString()).emit("newNotification", n);
  });

  res.status(201).json({
    success: true,
    count: created.length,
  });
};

/* =========================================================
   SUPER ADMIN: Send by ROLE / DEPARTMENT
========================================================= */
export const notifyByCriteria = async (req: any, res: Response) => {
  const { role, department, title, message, type = "system" } = req.body;

  if (!role && !department) {
    return res.status(400).json({
      success: false,
      message: "role or department must be provided",
    });
  }

  const users = await User.find(
    {
      ...(role && { role }),
      ...(department && { department }),
    },
    "_id"
  );

  if (!users.length) {
    return res.status(404).json({
      success: false,
      message: "No matching users found",
    });
  }

  const notifications = users.map((u) => ({
    user: u._id,
    title,
    message,
    type,
    read: false,
    metadata: {
      scope: "criteria",
      role,
      department,
      sentBy: req.user._id,
    },
    submittedBy: req.user._id,
  }));

  const created = await Notification.insertMany(notifications);

  const io = getIO();
  created.forEach((n) => {
    io.to(n.user.toString()).emit("newNotification", n);
  });

  res.status(201).json({
    success: true,
    count: created.length,
  });
};
