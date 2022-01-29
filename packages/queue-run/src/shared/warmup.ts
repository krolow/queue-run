import { loadModule } from "./loadModule.js";
import { LocalStorage, withLocalStorage } from "./localStorage.js";
import { logError } from "./logging.js";
import { OnError } from "./onError.js";

type WarmupFunction = () => Promise<void>;

// Run the warmup function exported from index.ts.
export default async function warmup(localStorage: LocalStorage) {
  const loaded = await loadModule<
    { warmup?: WarmupFunction },
    { onError?: OnError }
  >("index", {
    onError: logError,
  });
  const warmup = loaded?.module?.warmup;
  if (warmup) {
    try {
      await withLocalStorage(localStorage, () => warmup());
    } catch (error) {
      const { onError } = loaded.middleware;
      if (error instanceof Error && onError) {
        try {
          await onError(error);
        } catch (error) {
          console.error("Error in onError middleware:", error);
        }
      } else console.error("Error in warmup:", error);
      throw error;
    }
  }
}
