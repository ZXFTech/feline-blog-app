import { fetcher } from "../fetcher";

export interface Location {
  ip: string;
  country: string;
  region: string;
  city: string;
}

export async function getLocation(): Promise<Location> {
  return fetcher<Location>("https://ipapi.co/json/", {
    revalidate: 60 * 60 * 12, // 1 小时
  });
}
