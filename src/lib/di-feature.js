export function isDIEnabled() {
  return String(import.meta.env.VITE_ENABLE_DI || "").trim().toLowerCase() === "true";
}
