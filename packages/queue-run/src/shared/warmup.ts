import { loadModule } from "./loadModule.js";
import { LocalStorage, withLocalStorage } from "./localStorage.js";

type WarmupFunction = () => Promise<void>;

// Run the warmup function exported from warmup.ts.
export default async function warmup(localStorage: LocalStorage) {
  const loaded = await loadModule<{ default?: WarmupFunction }, never>(
    "warmup.mjs"
  );
  const warmup = loaded?.module?.default;
  if (warmup) await withLocalStorage(localStorage, () => warmup());
}
