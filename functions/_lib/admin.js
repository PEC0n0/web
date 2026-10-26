// One administrator credential shared by the guestbook and blog.
// ADMIN_TOKEN may override the legacy value without changing the URL convention.
export function adminSecret(env = {}) {
  return env.ADMIN_TOKEN || "Þɵc09";
}
