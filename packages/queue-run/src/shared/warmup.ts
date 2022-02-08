import { loadModule } from "./loadModule.js";
import { LocalStorage, withLocalStorage } from "./localStorage.js";
import "./logging.js";

type WarmupFunction = () => Promise<void>;

// Run the warmup function exported from index.ts.
export default async function warmup(localStorage: LocalStorage) {
  const loaded = await loadModule<{ warmup?: WarmupFunction }, never>("index");
  const warmup = loaded?.module?.warmup;
  if (warmup) await withLocalStorage(localStorage, () => warmup());
}
