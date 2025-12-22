import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

let io: Server;

// Initialize Socket.IO with authentication
export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
  });

  // Authenticate sockets using JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string };
      socket.data.userId = decoded.id;
      socket.join(decoded.id); // auto join secure room
      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`🟢 Socket connected: ${socket.id} (user ${socket.data.userId})`);

    socket.on("disconnect", () => {
      console.log(`🔴 Socket disconnected: ${socket.id} (user ${socket.data.userId})`);
    });
  });

  return io;
};

// Getter for controllers/services
export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
