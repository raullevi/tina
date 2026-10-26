// On local dev with HTTPS proxy, BACKEND_BASE defaults to empty string so requests route to same-origin /api
export const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || "";
