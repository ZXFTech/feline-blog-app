import dns from "node:dns";

if (process.env.BLOG_DRAFT_E2E_ORIGIN !== "https://blog.user-center.test:3446") {
  throw new Error("The loopback lookup is only for the isolated blog drafts suite.");
}

const lookup = dns.lookup;
dns.lookup = (host, options, callback) => {
  if (host !== "blog.user-center.test") return lookup(host, options, callback);
  if (typeof options === "function") {
    return process.nextTick(options, null, "127.0.0.1", 4);
  }
  return options?.all
    ? process.nextTick(callback, null, [{ address: "127.0.0.1", family: 4 }])
    : process.nextTick(callback, null, "127.0.0.1", 4);
};
