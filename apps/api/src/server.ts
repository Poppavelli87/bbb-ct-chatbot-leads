import path from "node:path";

import { config } from "dotenv";

import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { DrizzleStore } from "./store.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config();

const port = Number(process.env.PORT ?? 4000);
const store = new DrizzleStore();
const app = createApp({ store, serveStatic: true });

app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});

const dayMs = 24 * 60 * 60 * 1000;
const abandonmentSweep = setInterval(async () => {
  try {
    const updatedCount = await store.markAbandonedOlderThanDays(7);
    logger.info({ updatedCount }, "Abandonment sweep complete");
  } catch (error) {
    logger.error({ error }, "Abandonment sweep failed");
  }
}, dayMs);

abandonmentSweep.unref();
