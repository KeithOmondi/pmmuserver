import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

let io: Server;

/* =====================================================
   INITIALIZE SOCKET.IO (JWT AUTHENTICATED)
===================================================== */
export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
  });

  /* -----------------------------------------------------
     AUTH MIDDLEWARE (JWT)
  ----------------------------------------------------- */
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        id: string;
        role?: string;
      };

      socket.data.userId = decoded.id;
      socket.data.role = decoded.role;

      // 🔐 User private room
      socket.join(decoded.id);

      // 🔐 Optional role-based rooms
      if (decoded.role === "admin" || decoded.role === "superadmin") {
        socket.join("admins");
      }

      next();
    } catch (err) {
      return next(new Error("Unauthorized"));
    }
  });

  /* -----------------------------------------------------
     CONNECTION HANDLER
  ----------------------------------------------------- */
  io.on("connection", (socket) => {
    console.log(
      `🟢 Socket connected: ${socket.id} (user ${socket.data.userId})`
    );

    socket.on("disconnect", () => {
      console.log(
        `🔴 Socket disconnected: ${socket.id} (user ${socket.data.userId})`
      );
    });
  });

  return io;
};

/* =====================================================
   SAFE IO GETTER
===================================================== */
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

/* =====================================================
   EMIT HELPERS (🔥 THIS IS THE KEY UPDATE 🔥)
===================================================== */

/**
 * Notify a specific user that an indicator changed
 * → used after approve / reject / update
 */
export const emitIndicatorUpdateToUser = (
  userId: string,
  payload: {
    indicatorId: string;
    status: string;
  }
) => {
  if (!io) return;

  io.to(userId).emit("indicator:updated", payload);
};

/**
 * Notify admins that something changed
 * → dashboard auto-refresh
 */
export const emitIndicatorUpdateToAdmins = (payload: {
  indicatorId: string;
  status: string;
}) => {
  if (!io) return;

  io.to("admins").emit("admin:indicator:updated", payload);
};
