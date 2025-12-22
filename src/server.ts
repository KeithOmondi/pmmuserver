import app from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";

const PORT = Number(env.PORT);

// Connect database before starting server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
