/* 农历工具 v2 —— 纯查表（1900–2100），不依赖 Intl，也没有时区坑
 * 表来源：主流万年历 lunarInfo，与紫金山天文台公布的中国农历一致；
 * Intl 的 chinese 日历在 2027/2030 等年份会差一天，所以不用它。
 */
(function (global) {
  'use strict';

  const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,  // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,  // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,  // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,  // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,  // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,  // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,  // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,  // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,  // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,  // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,  // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,  // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,  // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,  // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,  // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,  // 2050-2059
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,  // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,  // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,  // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252,  // 2090-2099
  0x0d520,  // 2100-2100
  ];

  const BASE_UTC = Date.UTC(1900, 0, 31); // 1900-01-31 为农历正月初一
  const MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  function leapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }

  function leapDays(y) {
    if (!leapMonth(y)) return 0;
    return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29;
  }

  function monthDays(y, m) {
    return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
  }

  function yearDays(y) {
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
    return sum + leapDays(y);
  }

  const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function dayCn(n) {
    if (n <= 0) return '';
    if (n <= 10) return '初' + DIGITS[n];
    if (n < 20) return '十' + DIGITS[n - 10];
    if (n === 20) return '二十';
    if (n < 30) return '廿' + DIGITS[n - 20];
    if (n === 30) return '三十';
    return String(n);
  }

  function ganZhi(year) {
    return GAN[(year - 4) % 10] + ZHI[(year - 4) % 12];
  }

  /** 公历 Date -> 农历 { year, month, day, isLeap, monthName, dayName, label, yearName } */
  function of(date) {
    const gy = date.getFullYear();
    if (gy < 1900 || gy > 2100) return null;

    let offset = Math.round(
      (Date.UTC(gy, date.getMonth(), date.getDate()) - BASE_UTC) / 86400000
    );

    let i;
    let temp = 0;
    for (i = 1900; i < 2101 && offset > 0; i++) {
      temp = yearDays(i);
      offset -= temp;
    }
    if (offset < 0) {
      offset += temp;
      i--;
    }
    const lunarYear = i;
    const leap = leapMonth(i);
    let isLeap = false;

    for (i = 1; i < 13 && offset > 0; i++) {
      if (leap > 0 && i === leap + 1 && !isLeap) {
        --i;
        isLeap = true;
        temp = leapDays(lunarYear);
      } else {
        temp = monthDays(lunarYear, i);
      }
      if (isLeap && i === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && i === leap + 1) {
      if (isLeap) isLeap = false;
      else { isLeap = true; --i; }
    }
    if (offset < 0) {
      offset += temp;
      --i;
    }

    const month = i;
    const day = offset + 1;
    const monthName = (isLeap ? '闰' : '') + MONTHS[month - 1];
    return {
      year: lunarYear,
      yearName: ganZhi(lunarYear),
      month,
      day,
      isLeap,
      monthName,
      dayName: dayCn(day),
      label: `农历${monthName}${dayCn(day)}`,
    };
  }

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nextDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

  /** 农历月最后一天（次日是初一） */
  function isMonthEnd(d) {
    const n = of(nextDay(d));
    return !!n && n.day === 1;
  }

  /** 三十在小月（只有廿九）时，用当月最后一天兜底 */
  function matchDay(l, d, wantDay) {
    if (l.day === wantDay) return { matched: true, monthEnd: false };
    if (wantDay === 30 && l.day === 29 && isMonthEnd(d)) return { matched: true, monthEnd: true };
    return { matched: false, monthEnd: false };
  }

  /**
   * 下一个农历生日。
   * 闰月出生：优先找当年的闰月，没有就退回到平月。
   */
  function nextBirthday(birth, from) {
    const b = of(birth);
    if (!b) return null;
    const today = startOfDay(from || new Date());
    const MAX = 400;
    const passes = b.isLeap ? [true, false] : [false];

    for (const wantLeap of passes) {
      for (let i = 0; i <= MAX; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        const l = of(d);
        if (!l || l.month !== b.month || l.isLeap !== wantLeap) continue;
        const m = matchDay(l, d, b.day);
        if (m.matched) {
          return { date: d, days: i, lunar: l, leapFallback: b.isLeap && !wantLeap, monthEnd: m.monthEnd };
        }
      }
    }
    return null;
  }

  /** 上一个农历生日（进度条用），最多回看 400 天 */
  function prevBirthday(birth, from) {
    const b = of(birth);
    if (!b) return null;
    const today = startOfDay(from || new Date());
    for (let i = 1; i <= 400; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const l = of(d);
      if (!l || l.month !== b.month) continue;
      const m = matchDay(l, d, b.day);
      if (m.matched) return { date: d, days: i, lunar: l, monthEnd: m.monthEnd };
    }
    return null;
  }

  function isToday(birth, from) {
    const b = of(birth);
    const t = of(from || new Date());
    return !!b && !!t && b.month === t.month && b.day === t.day;
  }

  /** 1900–2100 之外没有数据；这里恒为 true，保留接口给 UI 判断 */
  function supported() {
    const y = new Date().getFullYear();
    return y >= 1900 && y <= 2100;
  }

  const api = { of, supported, nextBirthday, prevBirthday, isToday, dayCn, ganZhi, leapMonth, monthDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Lunar = api;
})(typeof self !== 'undefined' ? self : this);
