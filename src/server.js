import "dotenv/config";
import dns from "node:dns";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { connectToDatabase } from "./config/database.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const port = Number(process.env.PORT) || 5000;
let auth;

try {
  await connectToDatabase();
  auth = createAuth();
} catch (error) {
  console.error("MongoDB or Better Auth initialization failed:", error);
}

const app = createApp(auth);

app.listen(port, () => {
  console.log(`GearRent API running on http://localhost:${port}`);
});
