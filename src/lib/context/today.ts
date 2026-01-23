import dayjs from "dayjs";
import { fetcher } from "../fetcher";
import logger from "../logger/Logger";

export interface TodayData {
  date: string; // 当前日期
  weekDay: number; // 1:星期一
  yearTips: string; // 天干地支纪年法描述 例如：戊戌
  type: number; // 类型 0 工作日 1 假日 2 普通节假日 3 三倍工资节假日 如果ignoreHoliday参数为true，这个字段不返回
  typeDes: string; // 类型描述 比如 国庆,休息日,工作日 如果ignoreHoliday参数为true，这个字段不返回
  chineseZodiac: string; // 属相 例如：狗
  solarTerms: string; // 节气描述
  avoid: string; // 例如：小雪
  lunarCalendar: string; // 农历日期
  suit: string; // 宜事项
  dayOfYear: number; // 这一年的第几天
  weekOfYear: number; // 这一年的第几周
  constellation: string; // 星座
  indexWorkDayOfMonth: number; // 整型	如果当前是工作日 则返回是当前月的第几个工作日，否则返回0 如果ignoreHoliday参数为true，这个字段不返回
}

export interface TodayResponse {
  code: number; // 1: 返回成功
  msg: string;
  data: TodayData;
}

const api = "https://www.mxnzp.com/api/holiday/single/";

export async function getToday(
  date?: number,
): Promise<TodayData | { message: string }> {
  const dateStr = dayjs(date || Date.now()).format("YYYYMMDD");

  const appId = process.env.APP_ID;
  const appSecret = process.env.APP_SECRET;

  const res = await fetcher<TodayResponse>(
    `${api}${dateStr}?app_id=${appId}&app_secret=${appSecret}`,
    {
      revalidate: 300, // 5 分钟
    },
  );

  if (res.code !== 1) {
    logger.error("请求万年历失败,", res.msg);
    return { message: res.msg };
  }
  return res.data;
}
