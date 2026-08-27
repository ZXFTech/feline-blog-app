function partsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localMidnightUtc(year: number, monthIndex: number, timeZone: string) {
  const desired = Date.UTC(year, monthIndex, 1, 0, 0, 0);
  let guess = desired;
  for (let index = 0; index < 2; index += 1) {
    const parts = partsAt(new Date(guess), timeZone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += desired - represented;
  }
  return new Date(guess);
}

export function monthUtcRange(
  year: number,
  monthIndex: number,
  timeZone: string,
) {
  return {
    startUtc: localMidnightUtc(year, monthIndex, timeZone).toISOString(),
    endUtc: localMidnightUtc(year, monthIndex + 1, timeZone).toISOString(),
  };
}

export function localDateKey(iso: string, timeZone: string) {
  const parts = partsAt(new Date(iso), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
