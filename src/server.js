import "dotenv/config";
import dns from "node:dns";
import { createApp } from "./app.js";
import { connectToDatabase } from "./config/database.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const port = Number(process.env.PORT) || 5000;
const app = createApp();

try {
  await connectToDatabase();
} catch (error) {
  console.error("MongoDB connection failed:", error);
}

app.listen(port, () => {
  console.log(`GearRent API running on http://localhost:${port}`);
});
