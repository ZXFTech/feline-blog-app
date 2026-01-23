import { fetcher } from "../fetcher";

export interface Weather {
  temp: number;
  description: string;
}

export async function getWeather(city: string): Promise<Weather> {
  const key = process.env.WEATHER_API_KEY!;

  return fetcher<Weather>(
    `https://api.example.com/weather?city=${city}&key=${key}`,
    {
      revalidate: 300, // 5 分钟
    },
  );
}
