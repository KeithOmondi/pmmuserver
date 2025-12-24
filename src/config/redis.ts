import { createClient, RedisClientOptions } from "redis";
import { env } from "./env";

// 1. Define the base options
const clientOptions: RedisClientOptions = {
  url: env.REDIS_URL,
};

// 2. Conditionally add TLS for Production (Render/Cloud)
if (env.NODE_ENV === "production") {
  clientOptions.socket = {
    tls: true, // TypeScript now sees this literal 'true'
    rejectUnauthorized: false,
  };
}

export const redisClient = createClient(clientOptions);

redisClient.on("error", (err) => console.log("Redis Client Error", err));

export const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log(`🚀 Redis Connected (${env.NODE_ENV})`);
    }
  } catch (error) {
    console.error("❌ Redis Connection Failed:", error);
  }
};