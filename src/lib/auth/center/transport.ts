import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import type { CustomFetch } from "openid-client";

// Node transport avoids Next's rendering fetch instrumentation. No cache,
// redirect, TLS override or retry is introduced around the protocol library.
export const nativeFetch: CustomFetch = (input, options) => new Promise((resolve, reject) => {
  const url = new URL(input);
  const headers = new Headers(options.headers);
  headers.set("accept-encoding", "identity");
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const request = send(url, { method: options.method, headers: Object.fromEntries(headers), signal }, incoming => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1048576) { incoming.destroy(new Error("CENTER_RESPONSE_TOO_LARGE")); return; }
      chunks.push(chunk);
    });
    incoming.on("error", reject);
    incoming.on("end", () => {
      const responseHeaders = new Headers();
      for (let n = 0; n < incoming.rawHeaders.length; n += 2) responseHeaders.append(incoming.rawHeaders[n], incoming.rawHeaders[n + 1]);
      const status = incoming.statusCode ?? 502;
      resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
    });
  });
  request.on("error", reject);
  request.end(options.body?.toString());
});
