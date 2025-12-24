import http from "http";
import app from "./app";
import { connectDB } from "./config/db";
import { connectRedis } from "./config/redis"; // Import your helper
import { env } from "./config/env";
import { initSocket } from "./sockets/socket";

const PORT = Number(env.PORT);

const server = http.createServer(app);

initSocket(server);

// Ensure all infrastructure is ready before listening
const startServer = async () => {
  try {
    await connectDB();
    await connectRedis(); // Connect Redis here
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1); // Exit if critical infra fails
  }
};

startServer();