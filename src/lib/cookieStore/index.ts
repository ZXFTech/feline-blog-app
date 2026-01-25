import { RequestCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { cookies } from "next/headers";

async function getCookieData(key: string): Promise<RequestCookie | undefined> {
  const cookieStore = await cookies();
  const cookieData = cookieStore.get(key);
  return new Promise((resolve) =>
    setTimeout(() => {
      resolve(cookieData);
    }, 1000),
  );
}

export { getCookieData };
