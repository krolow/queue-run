import "./errorHandling.js";
import {
  NewExecutionContext,
  withExecutionContext,
} from "./executionContext.js";
import { loadModule } from "./loadModule.js";
import "./logger.js";

type WarmupFunction = () => Promise<void>;
const defaultTimeout = 90; // seconds

// Run the warmup function exported from index.ts.
export default async function warmup(newExecutionContext: NewExecutionContext) {
  await withExecutionContext(
    newExecutionContext({ timeout: defaultTimeout }),
    async () => {
      const loaded = await loadModule<{ warmup?: WarmupFunction }, never>(
        "index"
      );
      const warmup = loaded?.module?.warmup;
      if (warmup) await warmup();
    }
  );
}
