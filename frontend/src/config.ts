export const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_URL ||
  (typeof window !== "undefined" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
    ? `http://${window.location.hostname}:8000`
    : "http://localhost:8000");
