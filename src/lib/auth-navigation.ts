export type FlowContext = { kind: "none" } | { kind: "oauth"; query: string };
export type PublicRoutes = { centerOrigin: string; blogOrigin: string };
export type Navigation = { kind: "post"; action: string; fields: Record<string, string> } | { kind: "page"; path: string } | { kind: "entry"; app: "center" | "feline-blog" } | { kind: "continue"; action: "/auth/continue"; flowContext: FlowContext & { kind: "oauth" } };
const pagePaths = ["/", "/auth/sign-in", "/auth/sign-up", "/auth/verify-pending", "/auth/consent", "/auth/error"];
const record = (input: unknown): input is Record<string, unknown> => !!input && typeof input === "object" && !Array.isArray(input);
const exact = (input: Record<string, unknown>, keys: string[]) => Object.keys(input).sort().join() === [...keys].sort().join();
const oauthErrors = ["access_denied", "login_required", "consent_required", "interaction_required", "account_selection_required", "invalid_request", "invalid_scope", "unauthorized_client", "unsupported_response_type"];
const urlSafe = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
function validAuthorize(fields: Record<string, string>) {
  const scopes = fields.scope.split(" "), prompts = fields.prompt?.split(" ");
  return urlSafe(fields.state) && urlSafe(fields.nonce) && /^[A-Za-z0-9_-]{43}$/.test(fields.code_challenge) && scopes.includes("openid") && new Set(scopes).size === scopes.length && scopes.every(scope => ["openid", "email", "profile"].includes(scope)) &&
    (!prompts || prompts.every(prompt => ["login", "consent", "none"].includes(prompt)) && new Set(prompts).size === prompts.length && (!prompts.includes("none") || prompts.length === 1)) && (!Object.hasOwn(fields, "max_age") || fields.max_age === "0") && new TextEncoder().encode(new URLSearchParams(fields).toString()).byteLength <= 16384;
}
export function validatedNavigation(input: unknown, routes: PublicRoutes): Navigation {
  for (const origin of [routes.centerOrigin, routes.blogOrigin]) { const url = new URL(origin); if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) throw Error("NAVIGATION_UNAVAILABLE"); }
  if (!record(input)) throw Error("NAVIGATION_UNAVAILABLE");
  if (input.kind === "page" && exact(input, ["kind", "path"]) && typeof input.path === "string" && pagePaths.includes(input.path)) return input as Navigation;
  if (input.kind === "entry" && exact(input, ["kind", "app"]) && typeof input.app === "string" && ["center", "feline-blog"].includes(input.app)) return input as Navigation;
  if (input.kind === "continue" && exact(input, ["kind", "action", "flowContext"]) && input.action === "/auth/continue" && record(input.flowContext) && exact(input.flowContext, ["kind", "query"]) && input.flowContext.kind === "oauth" && typeof input.flowContext.query === "string" && input.flowContext.query.length > 0 && new TextEncoder().encode(input.flowContext.query).byteLength <= 8192) return input as Navigation;
  if (input.kind === "post" && exact(input, ["kind", "action", "fields"]) && record(input.fields) && Object.values(input.fields).every(value => typeof value === "string" && value.length > 0 && value.length <= 8192)) {
    const fields = input.fields as Record<string, string>;
    if (input.action === routes.centerOrigin + "/api/auth/oauth2/authorize") {
      const keys = ["client_id", "redirect_uri", "response_type", "response_mode", "scope", "state", "nonce", "code_challenge", "code_challenge_method", "prompt", "max_age"];
      const required = keys.filter(key => !["prompt", "max_age"].includes(key));
      if (Object.keys(fields).every(key => keys.includes(key)) && required.every(key => Object.hasOwn(fields, key)) && fields.client_id === "feline-blog" && fields.redirect_uri === routes.blogOrigin + "/api/auth/callback/user-center" && fields.response_type === "code" && fields.response_mode === "form_post" && fields.code_challenge_method === "S256" && validAuthorize(fields)) return input as Navigation;
    }
    if (input.action === routes.blogOrigin + "/api/auth/callback/user-center" && (exact(fields, ["code", "state", "iss"]) || exact(fields, ["error", "state", "iss"]) && oauthErrors.includes(fields.error)) && fields.iss === routes.centerOrigin + "/api/auth" && urlSafe(fields.state) && new TextEncoder().encode(new URLSearchParams(fields).toString()).byteLength <= 8192) return input as Navigation;
  }
  throw Error("NAVIGATION_UNAVAILABLE");
}
export async function navigateAuthentication(input: unknown, routes: PublicRoutes): Promise<void> {
  const navigation = validatedNavigation(input, routes);
  if (navigation.kind === "continue") {
    if (window.location.origin !== routes.centerOrigin) throw Error("NAVIGATION_UNAVAILABLE");
    const response = await fetch(navigation.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "same-origin", mode: "cors", redirect: "error", body: JSON.stringify({ flowContext: navigation.flowContext }) });
    if (!response.ok) throw Error("CONTINUATION_UNAVAILABLE");
    const body: unknown = await response.json();
    if (!record(body) || !exact(body, ["navigation"])) throw Error("CONTINUATION_UNAVAILABLE");
    const next = validatedNavigation(body.navigation, routes);
    if (next.kind === "continue") throw Error("CONTINUATION_UNAVAILABLE");
    return navigateAuthentication(next, routes);
  }
  if (navigation.kind === "post") {
    const form = document.createElement("form"); form.method = "post"; form.action = navigation.action;
    for (const [key, value] of Object.entries(navigation.fields)) { const input = document.createElement("input"); input.type = "hidden"; input.name = key; input.value = value; form.append(input); }
    document.body.append(form); form.submit(); return;
  }
  window.location.assign(navigation.kind === "page" ? routes.centerOrigin + navigation.path : navigation.app === "center" ? routes.centerOrigin + "/" : routes.blogOrigin + "/login");
}
