import { getLocation } from "./location";
import { getWeather } from "./weather";

export async function getContext() {
  const location = await getLocation();
  const weather = location.city ? await getWeather(location.city) : null;

  return {
    location,
    weather,
  };
}
