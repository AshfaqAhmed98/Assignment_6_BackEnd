import "dotenv/config";
import dns from "node:dns";
import { createApp } from "./create-app.js";
import { createAuth } from "./auth.js";
import { connectToDatabase } from "./config/database.js";
import { scheduleBookingCompletionUpdates } from "./services/booking-completion-job.js";
import { createBookingCompletionMailer } from "./services/booking-completion-email.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const port = Number(process.env.PORT) || 5000;
let auth;
let databaseReady = false;

try {
  await connectToDatabase();
  auth = createAuth();
  databaseReady = true;
} catch (error) {
  console.error("MongoDB or Better Auth initialization failed:", error);
}

if (databaseReady) {
  const mailer = createBookingCompletionMailer();
  if (process.env.VERCEL !== "1") {
    scheduleBookingCompletionUpdates({ mailer });
  }
}

const app = createApp(auth);

app.listen(port, () => {
  console.log(`GearRent API running on http://localhost:${port}`);
});
