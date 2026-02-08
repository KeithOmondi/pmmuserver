// src/controllers/adminController.ts
import { Request, Response } from "express";
import { redisClient } from "../config/redis";

export const getLiveActivityFeed = async (req: Request, res: Response) => {
  try {
    // 1. Safety check: Ensure client is connected
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    // 2. Fetch logs
    const rawLogs = await redisClient.lRange("system:live_logs", 0, 99);

    // 3. Robust Parsing 
    // (Adding a filter to prevent JSON.parse errors if a string is malformed)
    const logs = rawLogs.map((log) => {
      try {
        return JSON.parse(log);
      } catch (e) {
        return { message: log, error: "Malformed JSON", timestamp: new Date() };
      }
    });

    res.status(200).json({
      success: true,
      count: logs.length,
      logs, // This is what the Redux slice expects
    });
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch activity feed", 
      error: err.message 
    });
  }
};

/**
 * Clear logs if the SuperAdmin wants to reset the feed
 */
export const clearActivityFeed = async (req: Request, res: Response) => {
  try {
    await redisClient.del("system:live_logs");
    res.status(200).json({ success: true, message: "Feed cleared" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Action failed" });
  }
};



export const getOnlineUsers = async (req: Request, res: Response) => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    // Find all active sessions
    const keys = await redisClient.keys("session:*");

    if (keys.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        users: [],
      });
    }

    const sessions = await Promise.all(
      keys.map(async (key) => {
        const data = await redisClient.hGetAll(key);
        if (!data?.userId) return null;

        return {
          userId: data.userId,
          email: data.email,
          role: data.role,
          loginAt: data.loginAt,
          ip: data.ip,
          userAgent: data.userAgent,
          sessionKey: key,
        };
      })
    );

    const onlineUsers = sessions.filter(Boolean);

    res.status(200).json({
      success: true,
      count: onlineUsers.length,
      users: onlineUsers,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch online users",
      error: err.message,
    });
  }
};
