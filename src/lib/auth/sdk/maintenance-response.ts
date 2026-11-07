// A dependency-free service error document. A rewritten App Router page resets the HTTP status.
// Keep this response independent of React, authentication, storage, scripts and external assets.
const document = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>业务维护中 · neon cat</title><style>
:root{font-family:ui-sans-serif,system-ui,sans-serif;color-scheme:light dark}body{margin:0;min-height:100svh;display:grid;place-items:center;background:Canvas;color:CanvasText}main{box-sizing:border-box;width:min(42rem,100%);padding:var(--spacing-panel-inset-default,2rem)}section{padding:var(--spacing-panel-inset-default,2rem);border:1px solid GrayText;border-radius:1rem}p{line-height:1.7}nav{display:flex;flex-wrap:wrap;gap:1rem;margin-top:1.5rem}a{color:LinkText;text-underline-offset:.25em}a:focus-visible{outline:2px solid currentColor;outline-offset:5px}small{letter-spacing:.08em}
</style></head><body><main><section aria-labelledby="maintenance-title"><small>NEON CAT · 账号与安全</small><h1 id="maintenance-title">业务维护中</h1><p role="status">暂时无法访问业务内容。你仍可登录、检查账号或完成允许的资料确认。</p><nav aria-label="账号操作"><a href="/login">前往登录</a><a href="/profile">检查账号状态</a><a href="/album">浏览组件展示</a></nav></section></main></body></html>`;
export function maintenanceResponse() {
  return new Response(document, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
