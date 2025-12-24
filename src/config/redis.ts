import { createClient, RedisClientOptions } from "redis";
import { env } from "./env";

// 1. Setup options with the URL from Render
const clientOptions: RedisClientOptions = {
  url: env.REDIS_URL,
};

// 2. Logic: Only use TLS if the URL protocol explicitly asks for it (rediss://)
// This prevents the TypeError you encountered
if (env.REDIS_URL.startsWith("rediss://")) {
  clientOptions.socket = {
    tls: true,
    rejectUnauthorized: false,
  };
}

export const redisClient = createClient(clientOptions);

// 3. Connection and Event Listeners
redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err.message);
});

export const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log("🚀 Redis Connected: Internal Render Network");
    }
  } catch (error) {
    console.error("❌ Redis Connection Failed:", error);
    // Note: We don't exit the process here so the Rest of the API can still function
  }
};