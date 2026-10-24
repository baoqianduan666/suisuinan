/* 岁岁念 v2.3
 * 数据全部存在 chrome.storage.local，不联网。
 */
'use strict';

/* ---------------- 基础工具 ---------------- */
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, '0');

const store = {
  get: (keys) => new Promise((res) => chrome.storage.local.get(keys, (r) => res(r || {}))),
  set: (obj) => new Promise((res) => chrome.storage.local.set(obj, () => res(true))),
};

const DEFAULTS = {
  settings: { start: '09:00', end: '18:00', hourly: 35, milkPrice: 220, lunarReminder: true },
  stats: {
    coins: 0,
    happiness: 0,
    pets: 0,
    streak: { count: 0, last: '', days: [] },
    daily: { date: '', pets: 0 },
    unlocked: [],
    flags: { night: false, early: false },
  },
};

const state = {
  members: [],
  currentId: null,
  settings: { ...DEFAULTS.settings },
  stats: JSON.parse(JSON.stringify(DEFAULTS.stats)),
};

/* ---------------- 日期 ---------------- */
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

function addMonths(date, n) {
  const y = date.getFullYear();
  const m = date.getMonth() + n;
  const target = new Date(y, m, 1);
  const dim = daysInMonth(target.getFullYear(), target.getMonth());
  target.setDate(Math.min(date.getDate(), dim));
  return target;
}

function addYears(date, n) {
  const target = new Date(date.getFullYear() + n, date.getMonth(), 1);
  const dim = daysInMonth(target.getFullYear(), target.getMonth());
  target.setDate(Math.min(date.getDate(), dim));
  return target;
}

const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/* 稳健的年龄：先估月份，再用锚点日期回退，天然处理月底/闰年 */
function ageParts(birth) {
  const b = startOfDay(birth);
  const now = startOfDay(new Date());
  if (now < b) return { future: true, years: 0, months: 0, days: 0, totalMonths: 0, dayCount: 0, anchor: b };
  let totalMonths = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (addMonths(b, totalMonths) > now) totalMonths--;
  if (totalMonths < 0) totalMonths = 0;
  const anchor = addMonths(b, totalMonths);
  const days = Math.max(0, daysBetween(anchor, now));
  return {
    future: false,
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days,
    totalMonths,
    dayCount: Math.max(0, daysBetween(b, now)),
    anchor,
  };
}

const ZODIAC = [
  [1, 20, '水瓶座'], [2, 19, '双鱼座'], [3, 21, '白羊座'], [4, 20, '金牛座'],
  [5, 21, '双子座'], [6, 22, '巨蟹座'], [7, 23, '狮子座'], [8, 23, '处女座'],
  [9, 23, '天秤座'], [10, 24, '天蝎座'], [11, 23, '射手座'], [12, 22, '摩羯座'],
];

function zodiacOf(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  let sign = '摩羯座';
  for (const [mm, dd, name] of ZODIAC) {
    if (m > mm || (m === mm && d >= dd)) sign = name;
  }
  return sign;
}

/* 农历年界（春节）用于生肖，覆盖 2015-2030 */
const CNY = {
  2015: '02-19', 2016: '02-08', 2017: '01-28', 2018: '02-16', 2019: '02-05',
  2020: '01-25', 2021: '02-12', 2022: '02-01', 2023: '01-22', 2024: '02-10',
  2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13',
  2030: '02-03',
};
const ANIMALS = ['龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪', '鼠', '牛', '虎', '兔'];

function zodiacCnOf(date) {
  const y = date.getFullYear();
  const cny = CNY[y];
  let lunarYear = y;
  if (cny) {
    const [m, d] = cny.split('-').map(Number);
    if (date.getMonth() + 1 < m || (date.getMonth() + 1 === m && date.getDate() < d)) lunarYear = y - 1;
  }
  const idx = ((lunarYear - 2024) % 12 + 12) % 12;
  return ANIMALS[idx];
}

/* ---------------- 文案 ---------------- */
const SPEECHES = {
  child: [
    '妈妈/爸爸加油，我在家乖乖喝奶～',
    '听说你今天很忙，记得喝水呀',
    '我刚刚梦到你了，醒来你就不见了',
    '别摸鱼啦，我在长个子呢',
    '再赚一点点，就够我一罐奶粉啦',
    '你上班的时候我都很乖的（真的）',
    '下班早点回来，我给你笑一个',
    '我把今天的开心都存起来了，等你回来分你',
    '我今天又重了一点点，你摸摸看',
    '工作再难，也没有我半夜哭难',
    '你敲键盘的声音，像在给我唱歌',
    '记得吃饭，不然没力气抱我',
  ],
  partner: [
    '今天也辛苦了，早点回来',
    '别熬太晚，我等你一起吃饭',
    '你不用什么都自己扛，还有我呢',
    '刚看了下时间，快下班了吧',
    '钱慢慢赚，人别累坏了',
    '我把饭热好了，回来就能吃',
    '你今天也很棒，虽然没人告诉你',
    '周末想跟你去走走，别安排加班了',
  ],
  parent: [
    '工作别太拼，身体要紧',
    '饭吃了没？别老对付一口',
    '天冷了，出门多穿件衣服',
    '我们挺好的，不用总惦记家里',
    '你忙你的，我们都懂',
    '有空就回来看看，没空也没事',
    '别总熬夜，眼睛要紧',
    '攒点钱给自己花，别都往家里寄',
  ],
  other: [
    '最近还好吗？',
    '好久没见了，有空聚聚',
    '记得按时吃饭',
    '生日快到了，别忘了',
  ],
};

function speechPool(member) {
  const r = relationOf(member);
  if (r === '宝宝') return SPEECHES.child;
  if (r === '爱人') return SPEECHES.partner;
  if (['妈妈', '爸爸', '爷爷', '奶奶', '外公', '外婆'].includes(r)) return SPEECHES.parent;
  return SPEECHES.other;
}

const MOTTOS = [
  '「今天的班，是给 {name} 换的口粮。」',
  '「再撑一会儿，{name} 的奶粉罐就见底了。」',
  '「你赚钱的样子，比任何育儿书都可靠。」',
  '「{name} 在长大，你也在。」',
  '「上班是手段，抱娃是目的。」',
  '「今天的每一分钟，都会变成 {name} 的一厘米。」',
  '「别小看这一天，它正在变成 {name} 的童年。」',
  '「你不是在打工，你是在给 {name} 攒底气。」',
];

/* ---------------- 关系 ---------------- */
const RELATIONS = [
  { key: '宝宝', emoji: '👶' },
  { key: '爱人', emoji: '💗' },
  { key: '妈妈', emoji: '👩' },
  { key: '爸爸', emoji: '👨' },
  { key: '奶奶', emoji: '👵' },
  { key: '爷爷', emoji: '👴' },
  { key: '外婆', emoji: '🧓' },
  { key: '外公', emoji: '🧑‍🦳' },
  { key: '亲友', emoji: '🧑' },
];
const REL_EMOJI = {};
RELATIONS.forEach((r) => { REL_EMOJI[r.key] = r.emoji; });

const relationOf = (m) => (m && m.relation) || '宝宝';
const isChild = (m) => relationOf(m) === '宝宝';
const relEmoji = (m) => REL_EMOJI[relationOf(m)] || '👤';
const isElder = (m) => ['妈妈', '爸爸', '爷爷', '奶奶', '外公', '外婆'].includes(relationOf(m));

/* ---------------- 计算 ---------------- */
function currentMember() {
  return state.members.find((b) => b.id === state.currentId) || state.members[0] || null;
}

function milestoneOf(member) {
  const birth = parseYmd(member.birthday);
  const age = ageParts(birth);
  const today = startOfDay(new Date());
  if (age.future) return { label: '等待出生', days: 0, progress: 0, sub: '出生日期在未来' };

  const list = [];
  const nextBirthday = addYears(birth, age.years + 1);
  list.push({ label: `${age.years + 1} 岁生日`, target: nextBirthday, from: addYears(birth, age.years) });

  if (isChild(member)) {
    const nextMonth = addMonths(birth, age.totalMonths + 1);
    list.push({ label: `${age.totalMonths + 1} 个月`, target: nextMonth, from: age.anchor });
    if (age.dayCount < 100) list.push({ label: '100 天', target: addDays(birth, 100), from: birth });
    if (age.dayCount < 1000) list.push({ label: '1000 天', target: addDays(birth, 1000), from: birth });
  } else {
    const decade = Math.floor(age.years / 10) * 10 + 10;
    const decadeDate = addYears(birth, decade);
    if (daysBetween(today, decadeDate) >= 0) {
      list.push({ label: `${decade} 岁`, target: decadeDate, from: addYears(birth, decade - 10) });
    }
  }

  // 农历生日也算一个里程碑（1900–2100 查表）
  if (typeof Lunar !== 'undefined' && Lunar.supported()) {
    const nb = Lunar.nextBirthday(birth, today);
    if (nb && nb.days >= 0) {
      const pb = Lunar.prevBirthday(birth, today);
      list.push({ label: '农历生日', target: nb.date, from: pb ? pb.date : birth });
    }
  }

  const valid = list
    .map((m) => ({ ...m, days: daysBetween(today, m.target) }))
    .filter((m) => m.days >= 0)
    .sort((a, b) => a.days - b.days);

  if (!valid.length) return { label: '—', days: 0, progress: 1, sub: '—' };
  const m = valid[0];
  const total = Math.max(1, daysBetween(m.from, m.target));
  const done = Math.max(0, daysBetween(m.from, today));
  return {
    label: m.label,
    days: m.days,
    progress: Math.min(1, done / total),
    sub: `${ymd(m.from).replace(/-/g, '/')} → ${ymd(m.target).replace(/-/g, '/')}`,
  };
}

const LEVELS = [
  [0, '青铜养娃人'], [150, '白银养娃人'], [400, '黄金养娃人'],
  [900, '铂金养娃人'], [1800, '钻石养娃人'], [3500, '王者养娃人'],
];

function levelInfo() {
  const coins = state.stats.coins;
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (coins >= LEVELS[k][0]) i = k;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return {
    level: i + 1,
    title: cur[1],
    progress: next ? (coins - cur[0]) / (next[0] - cur[0]) : 1,
    need: next ? next[0] - coins : 0,
  };
}

const ACHIEVEMENTS = [
  { id: 'first', icon: '🍼', name: '初次记录', desc: '添加第一个成员', test: () => state.members.length > 0 },
  { id: 'pet10', icon: '🤚', name: '摸摸头', desc: '累计抚摸 10 次', test: () => state.stats.pets >= 10 },
  { id: 'pet100', icon: '💗', name: '毛茸茸', desc: '累计抚摸 100 次', test: () => state.stats.pets >= 100 },
  { id: 'coin500', icon: '🪙', name: '小有积蓄', desc: '金币达到 500', test: () => state.stats.coins >= 500 },
  { id: 'streak3', icon: '📅', name: '三日不辍', desc: '连续 3 天打开', test: () => state.stats.streak.count >= 3 },
  { id: 'streak7', icon: '🏅', name: '一周坚持', desc: '连续 7 天打开', test: () => state.stats.streak.count >= 7 },
  {
    id: 'days100', icon: '🌱', name: '百天', desc: '有宝宝满 100 天',
    test: () => state.members.some((b) => isChild(b) && ageParts(parseYmd(b.birthday)).dayCount >= 100),
  },
  {
    id: 'year1', icon: '🎂', name: '周岁', desc: '有宝宝满 1 岁',
    test: () => state.members.some((b) => isChild(b) && ageParts(parseYmd(b.birthday)).years >= 1),
  },
  { id: 'family3', icon: '🏠', name: '一家人', desc: '记录到 3 位家人', test: () => state.members.length >= 3 },
  { id: 'family5', icon: '🌳', name: '一大家子', desc: '记录到 5 位家人', test: () => state.members.length >= 5 },
  { id: 'elder', icon: '🧓', name: '上有老', desc: '添加了长辈', test: () => state.members.some((b) => isElder(b)) },
  { id: 'night', icon: '🌙', name: '深夜守护', desc: '22 点后还在陪家人', test: () => state.stats.flags.night },
  { id: 'early', icon: '🌅', name: '早安', desc: '8 点前打开过', test: () => state.stats.flags.early },
];

/* ---------------- 渲染 ---------------- */
function ageText(age, member) {
  if (age.future) return { html: '<i>还没出生</i>', plain: '还没出生' };
  const child = !member || isChild(member);
  const html = [];
  const plain = [];
  if (age.years > 0) { html.push(`<b>${age.years}</b><i>岁</i>`); plain.push(`${age.years}岁`); }
  if (age.months > 0) { html.push(`<b>${age.months}</b><i>个月</i>`); plain.push(`${age.months}个月`); }
  if (child || age.years === 0) { html.push(`<b>${age.days}</b><i>天</i>`); plain.push(`${age.days}天`); }
  if (!plain.length) { html.push('<b>0</b><i>天</i>'); plain.push('0天'); }
  return { html: html.join(''), plain: plain.join('') };
}

function renderChips() {
  const box = $('chips');
  box.innerHTML = '';
  for (const b of state.members) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (b.id === state.currentId ? ' active' : '');
    if (b.avatar) {
      const img = document.createElement('img');
      img.src = b.avatar;
      chip.appendChild(img);
    } else {
      const em = document.createElement('span');
      em.textContent = relEmoji(b);
      em.style.fontSize = '11px';
      chip.appendChild(em);
    }
    const nm = document.createElement('span');
    nm.textContent = b.name;
    chip.appendChild(nm);
    chip.addEventListener('click', () => selectBaby(b.id));
    box.appendChild(chip);
  }
  const add = document.createElement('button');
  add.className = 'chip add';
  add.textContent = '＋ 添加';
  add.addEventListener('click', () => openBabySheet(null));
  box.appendChild(add);
}

function renderHero() {
  const member = currentMember();
  const av = $('avatarBtn');
  if (!member) {
    $('babyName').textContent = '还没有添加成员';
    $('ageLine').innerHTML = '<i>点右上角 ＋ 添加</i>';
    $('metaLine').textContent = '数据只存在这台电脑上';
    av.classList.remove('has-img');
    $('avatarEmoji').textContent = '👶';
    av.disabled = true;
    return;
  }
  av.disabled = false;

  const nameEl = $('babyName');
  nameEl.textContent = '';
  nameEl.appendChild(document.createTextNode(member.name));
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = relationOf(member);
  nameEl.appendChild(badge);

  const img = $('avatarImg');
  if (member.avatar) {
    img.src = member.avatar;
    av.classList.add('has-img');
  } else {
    av.classList.remove('has-img');
    $('avatarEmoji').textContent = relEmoji(member);
  }

  const birth = parseYmd(member.birthday);
  const age = ageParts(birth);
  const t = ageText(age, member);
  $('ageLine').innerHTML = t.html;

  if (age.future) {
    $('metaLine').textContent = `距离出生还有 ${Math.abs(daysBetween(startOfDay(new Date()), birth))} 天`;
  } else if (isChild(member)) {
    $('metaLine').textContent = `第 ${age.dayCount + 1} 天 · ${zodiacOf(birth)} · 已陪伴 ${age.dayCount} 个日夜`;
  } else {
    const days = daysBetween(startOfDay(new Date()), addYears(birth, age.years + 1));
    $('metaLine').textContent = `还有 ${days} 天生日 · ${zodiacOf(birth)} · 属${zodiacCnOf(birth)}`;
  }
}

function renderGrowth() {
  const member = currentMember();
  if (!member) {
    ['msDays', 'stDays', 'stWeeks', 'stHours', 'fBirth', 'fZodiac', 'fZodiacCn', 'fNextBirthday', 'fLunar', 'fNextLunar'].forEach((id) => {
      $(id).textContent = '—';
    });
    $('msName').textContent = '—';
    $('msSub').textContent = '先添加一位家人吧';
    $('msBar').style.width = '0%';
    $('birthdayCard').style.display = 'none';
    return;
  }
  const birth = parseYmd(member.birthday);
  const age = ageParts(birth);
  const ms = milestoneOf(member);

  $('msName').textContent = ms.label;
  $('msDays').innerHTML = `${ms.days}<i>天</i>`;
  $('msBar').style.width = `${(ms.progress * 100).toFixed(1)}%`;
  $('msSub').textContent = ms.sub;

  $('stDays').textContent = age.dayCount.toLocaleString();
  $('stWeeks').textContent = Math.floor(age.dayCount / 7).toLocaleString();
  $('stHours').textContent = (age.dayCount * 24).toLocaleString();

  $('fBirth').textContent = `${birth.getFullYear()}年${birth.getMonth() + 1}月${birth.getDate()}日`;
  $('fZodiac').textContent = zodiacOf(birth);
  $('fZodiacCn').textContent = zodiacCnOf(birth);

  const nb = addYears(birth, age.years + 1);
  const nbDays = daysBetween(startOfDay(new Date()), nb);
  $('fNextBirthday').textContent = `${nb.getMonth() + 1}月${nb.getDate()}日（${nbDays} 天后）`;

  // ---- 农历 ----
  const lunarOk = typeof Lunar !== 'undefined' && Lunar.supported();
  let lunarBirth = null;
  let lunarNext = null;
  if (lunarOk) {
    lunarBirth = Lunar.of(birth);
  }
  if (lunarBirth) {
    lunarNext = Lunar.nextBirthday(birth, new Date());
    $('fLunar').textContent = `${lunarBirth.monthName}${lunarBirth.dayName}`;
    $('fNextLunar').textContent = lunarNext
      ? lunarNext.days === 0
        ? '就是今天 🎂'
        : `${lunarNext.lunar.monthName}${lunarNext.lunar.dayName}（${lunarNext.days} 天后）`
      : '—';
  } else {
    $('fLunar').textContent = lunarOk ? '超出 1900–2100' : '浏览器不支持';
    $('fNextLunar').textContent = '—';
  }

  const now = new Date();
  const isSolarToday = birth.getMonth() === now.getMonth() && birth.getDate() === now.getDate();
  const isLunarToday = !!(lunarOk && lunarBirth && Lunar.isToday(birth, now));
  const isBirthday = isSolarToday || isLunarToday;
  $('birthdayCard').style.display = isBirthday ? 'block' : 'none';
  if (isBirthday) {
    if (age.dayCount === 0) {
      $('birthdayMsg').textContent = `🎉 今天出生，欢迎 ${member.name} 来到这个世界。`;
    } else {
      const both = isSolarToday && isLunarToday;
      const which = both ? '（公历农历同一天，难得）' : isLunarToday ? '（农历）' : '';
      $('birthdayMsg').textContent = `今天是 ${member.name} 的 ${age.years} 岁生日${which}。别忘了${age.years >= 60 ? '回家看看' : '蛋糕和照片'}。`;
    }
    setTimeout(() => burst(0.5, 0.3, 90), 400);
  } else if (lunarOk && lunarNext && lunarNext.days <= 7) {
    $('birthdayCard').style.display = 'block';
    $('birthdayMsg').textContent =
      `还有 ${lunarNext.days} 天就是 ${member.name} 的农历生日（${lunarNext.lunar.monthName}${lunarNext.lunar.dayName}），记得提前订蛋糕。`;
  }
}

/* 工位 */
function minutesOf(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isWorkday(d) {
  const w = d.getDay();
  return w >= 1 && w <= 5;
}

function updateWork() {
  const now = new Date();
  const s = state.settings;
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const startMin = minutesOf(s.start);
  let endMin = minutesOf(s.end);
  if (endMin <= startMin) endMin += 24 * 60;
  const span = endMin - startMin;
  const dailyPay = (s.hourly || 0) * (span / 60);

  let label = '距离下班';
  let pill = '工作中';
  let cdClass = '';
  let remainText = '--:--:--';
  let earned = 0;
  let progress = 0;
  let hint = '';

  const workday = isWorkday(now);

  if (!workday) {
    label = '今天';
    pill = '休息日';
    cdClass = 'off';
    remainText = '好好陪宝宝';
    hint = '休息日不计奶粉钱 —— 今天的任务是抱娃。';
    const next = new Date(now);
    do { next.setDate(next.getDate() + 1); } while (!isWorkday(next));
    progress = 0;
  } else if (nowMin < startMin) {
    label = '距离上班';
    pill = '通勤中';
    remainText = fmtClock(startMin - nowMin);
    hint = '还没开始，先把早饭吃了。';
  } else if (nowMin < endMin) {
    const left = endMin - nowMin;
    remainText = fmtClock(left);
    earned = dailyPay * ((nowMin - startMin) / span);
    progress = (nowMin - startMin) / span;
    const perMilk = (s.hourly || 1) > 0 ? (s.milkPrice / s.hourly) * 60 : 0;
    if (perMilk > 0 && left > 0) {
      hint = left > perMilk
        ? `再坚持 ${Math.ceil(perMilk)} 分钟，就能再买 1 罐奶粉。`
        : `再坚持 ${Math.ceil(left)} 分钟就下班啦，宝宝在等你。`;
    }
  } else {
    label = '今日';
    pill = '已下班';
    cdClass = 'off';
    remainText = '自由时间';
    earned = dailyPay;
    progress = 1;
    hint = '今天赚到的奶粉钱已经入账，去抱抱宝宝吧。';
  }

  $('workLabel').textContent = label;
  $('workPill').textContent = pill;
  const cd = $('countdown');
  cd.textContent = remainText;
  cd.className = 'countdown' + (cdClass ? ' ' + cdClass : '');
  $('earnToday').textContent = '¥' + Math.round(earned).toLocaleString();
  const cans = earned / (s.milkPrice || 220);
  $('milkCans').textContent = cans >= 10 ? Math.round(cans).toString() : cans.toFixed(2);
  $('diapers').textContent = Math.round(earned / 1.5).toLocaleString();
  $('workBar').style.width = `${Math.min(100, progress * 100).toFixed(1)}%`;
  $('workHint').textContent = hint || '在设置里填上上下班时间和时薪，就能把工位变成奶粉钱计算器。';
}

function fmtClock(minutes) {
  const total = Math.max(0, Math.round(minutes * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

function renderMotto() {
  const member = currentMember();
  const name = member ? member.name : '家人';
  const idx = (new Date().getDate() + new Date().getMonth()) % MOTTOS.length;
  $('motto').textContent = MOTTOS[idx].replace(/\{name\}/g, name);
}

/* 首屏台词：每天固定一句，不用点也有话 */
function renderSpeech() {
  const member = currentMember();
  if (!member) {
    $('speech').textContent = '记录下家人的生日，剩下的交给时间。';
    return;
  }
  const pool = speechPool(member);
  const d = new Date();
  const idx = (d.getDate() * 7 + d.getMonth() * 3) % pool.length;
  $('speech').textContent = pool[idx];
}

/* 成就 */
function renderBag() {
  const lv = levelInfo();
  $('lvl').textContent = lv.level;
  $('lvlTitle').textContent = lv.title;
  $('lvlBar').style.width = `${Math.min(100, lv.progress * 100).toFixed(1)}%`;
  $('lvlSub').textContent = (lv.need > 0 ? `再赚 ${lv.need} 金币升级` : '已满级，你是传奇') + ` · 共 ${state.stats.coins} 🪙`;

  const st = state.stats.streak;
  $('streakDays').textContent = `${st.count} 天`;
  const grid = $('streakGrid');
  grid.innerHTML = '';
  const today = startOfDay(new Date());
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = ymd(d);
    const sq = document.createElement('div');
    sq.className = 'sq' + (st.days.includes(key) ? ' on' : '') + (i === 0 ? ' today' : '');
    sq.textContent = d.getDate();
    sq.title = key;
    grid.appendChild(sq);
  }

  const gridA = $('achvGrid');
  gridA.innerHTML = '';
  let unlocked = 0;
  for (const a of ACHIEVEMENTS) {
    const on = state.stats.unlocked.includes(a.id);
    if (on) unlocked++;
    const el = document.createElement('div');
    el.className = 'achv' + (on ? ' on' : '');
    el.title = a.desc;
    el.innerHTML = `<div class="ico">${a.icon}</div><div class="nm">${a.name}</div>`;
    gridA.appendChild(el);
  }
  $('achvCount').textContent = `${unlocked}/${ACHIEVEMENTS.length}`;
}

function checkAchievements() {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (!state.stats.unlocked.includes(a.id) && a.test()) {
      state.stats.unlocked.push(a.id);
      toast(`🏆 解锁成就：${a.name}`);
      changed = true;
    }
  }
  if (changed) {
    saveStats();
    renderBag();
  }
}

/* 渲染总入口 */
function renderAll() {
  renderChips();
  renderHero();
  renderGrowth();
  updateWork();
  renderBag();
  renderMotto();
  renderSpeech();
}

/* ---------------- 交互 ---------------- */
function selectBaby(id) {
  state.currentId = id;
  store.set({ currentId: id });
  renderChips();
  renderHero();
  renderGrowth();
  renderMotto();
  renderSpeech();
}

let comboCount = 0;
let comboTimer = null;

function petMember() {
  const member = currentMember();
  if (!member) {
    openBabySheet(null);
    return;
  }
  const btn = $('avatarBtn');
  btn.classList.remove('bounce');
  void btn.offsetWidth;
  btn.classList.add('bounce');

  spawnHearts(btn);
  comboCount++;
  const combo = $('combo');
  combo.textContent = `+${comboCount} ❤`;
  combo.classList.remove('show');
  void combo.offsetWidth;
  combo.classList.add('show');
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { comboCount = 0; }, 1000);

  state.stats.pets += 1;
  state.stats.daily.pets += 1;
  state.stats.happiness = Math.min(100, state.stats.happiness + 1);
  if (state.stats.daily.pets <= 40) state.stats.coins += 1;

  const speech = $('speech');
  const pool = speechPool(member);
  speech.style.opacity = '0';
  setTimeout(() => {
    speech.textContent = pool[Math.floor(Math.random() * pool.length)];
    speech.style.opacity = '1';
  }, 180);

  giggle();
  renderBag();
  checkAchievements();
  saveStats();
}

function spawnHearts(anchor) {
  const layer = $('heartsLayer');
  const rect = anchor.getBoundingClientRect();
  const host = $('hero').getBoundingClientRect();
  const cx = rect.left - host.left + rect.width / 2;
  const cy = rect.top - host.top + rect.height / 2;
  const emojis = ['❤️', '💗', '💕', '✨', '💖'];
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    s.className = 'heart';
    s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    s.style.left = `${cx - 8}px`;
    s.style.top = `${cy - 8}px`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
    s.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`);
    s.style.animationDelay = `${i * 40}ms`;
    layer.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}

/* 音效：轻柔两声“咯咯” */
let audioCtx = null;
function giggle() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [[0, 720, 0.07], [0.09, 900, 0.07]].forEach(([dt, freq, dur]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t0 + dt);
      o.frequency.exponentialRampToValueAtTime(freq * 1.25, t0 + dt + dur);
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + dur + 0.02);
    });
  } catch (e) { /* 静默失败 */ }
}

/* 粒子 */
const canvas = $('fx');
const ctx2d = canvas.getContext('2d');
let particles = [];
let rafId = null;

function resizeCanvas() {
  canvas.width = 400 * 2;
  canvas.height = 600 * 2;
  canvas.style.width = '400px';
  canvas.style.height = '600px';
  ctx2d.setTransform(2, 0, 0, 2, 0, 0);
}

function burst(x, y, count) {
  const colors = ['#ff7a8a', '#ffb26b', '#2fc7a5', '#ffd166', '#ff9ec7'];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 6;
    particles.push({
      x: x * 400, y: y * 600,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
      life: 1, color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 4,
    });
  }
  if (!rafId) rafId = requestAnimationFrame(stepFx);
}

function stepFx() {
  ctx2d.clearRect(0, 0, 400, 600);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.18;
    p.vx *= 0.99;
    p.life -= 0.012;
    ctx2d.globalAlpha = Math.max(0, p.life);
    ctx2d.fillStyle = p.color;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx2d.fill();
  }
  ctx2d.globalAlpha = 1;
  if (particles.length) {
    rafId = requestAnimationFrame(stepFx);
  } else {
    rafId = null;
    ctx2d.clearRect(0, 0, 400, 600);
  }
}

/* toast */
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------------- 存储 ---------------- */
function saveStats() {
  store.set({ stats: state.stats });
}

function saveAll() {
  store.set({
    members: state.members,
    currentId: state.currentId,
    settings: state.settings,
    stats: state.stats,
  });
}

function todayKey() {
  return ymd(new Date());
}

function rollDaily() {
  const key = todayKey();
  if (state.stats.daily.date !== key) {
    state.stats.daily = { date: key, pets: 0 };
    saveStats();
  }
}

function rollStreak() {
  const st = state.stats.streak;
  const key = todayKey();
  if (st.last === key) return;
  const yesterday = ymd(addDays(new Date(), -1));
  st.count = st.last === yesterday ? (st.count || 0) + 1 : 1;
  st.last = key;
  if (!st.days.includes(key)) st.days.push(key);
  st.days = st.days.slice(-30);
  saveStats();
  renderBag();
}

/* ---------------- 设置弹层 ---------------- */
function openSheet(id) {
  $(id).classList.add('show');
}
function closeSheet(id) {
  $(id).classList.remove('show');
}

function fillSettings() {
  $('stStart').value = state.settings.start;
  $('stEnd').value = state.settings.end;
  $('stHourly').value = state.settings.hourly;
  $('stMilk').value = state.settings.milkPrice;
  $('stLunar').checked = state.settings.lunarReminder !== false;
}

function saveSettings() {
  const start = $('stStart').value || '09:00';
  const end = $('stEnd').value || '18:00';
  const hourly = Math.max(0, Number($('stHourly').value) || 0);
  const milkPrice = Math.max(1, Number($('stMilk').value) || 220);
  const lunarReminder = $('stLunar').checked;
  state.settings = { start, end, hourly, milkPrice, lunarReminder };
  store.set({ settings: state.settings });
  closeSheet('settingsMask');
  updateWork();
  toast('设置已保存');
}

/* 成员表单 */
let draftAvatar = null;
let draftRelation = '宝宝';
let editingId = null;

function renderRelChips() {
  const box = $('relChips');
  box.innerHTML = '';
  for (const r of RELATIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rel-chip' + (r.key === draftRelation ? ' on' : '');
    btn.textContent = `${r.emoji} ${r.key}`;
    btn.addEventListener('click', () => {
      draftRelation = r.key;
      renderRelChips();
      renderAvatarPreview();
    });
    box.appendChild(btn);
  }
}

function openBabySheet(id) {
  editingId = id || null;
  const m = id ? state.members.find((b) => b.id === id) : null;
  draftAvatar = m ? m.avatar || null : null;
  draftRelation = m ? relationOf(m) : '宝宝';
  $('babySheetTitle').textContent = m ? '编辑成员' : '添加成员';
  $('babyNameInput').value = m ? m.name : '';
  $('babyBirthInput').value = m ? m.birthday : '';
  $('babyDelete').style.display = m ? 'block' : 'none';
  $('babyDelete').textContent = '删除';
  renderAvatarPreview();
  renderRelChips();
  openSheet('babyMask');
  setTimeout(() => $('babyNameInput').focus(), 120);
}

function renderAvatarPreview() {
  const box = $('avatarPreview');
  box.innerHTML = '';
  if (draftAvatar) {
    const img = document.createElement('img');
    img.src = draftAvatar;
    box.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'ph';
    ph.textContent = REL_EMOJI[draftRelation] || '👶';
    box.appendChild(ph);
  }
  const cam = document.createElement('span');
  cam.className = 'cam';
  cam.textContent = '📷';
  box.appendChild(cam);
}

function handleAvatarFile(file, input) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('请选择图片文件'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      const sx = (img.width - s) / 2;
      const sy = (img.height - s) / 2;
      g.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      draftAvatar = c.toDataURL('image/jpeg', 0.85);
      renderAvatarPreview();
      toast('头像已更新');
    };
    img.onerror = () => toast('这张图片读不出来，换一张试试');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  if (input) input.value = '';
}

function saveBaby() {
  const name = $('babyNameInput').value.trim();
  const birth = $('babyBirthInput').value;
  if (!name) { toast('给 TA 起个称呼吧'); return; }
  if (!birth) { toast('请选择出生日期'); return; }
  const birthDate = parseYmd(birth);
  if (isNaN(birthDate.getTime())) { toast('日期格式不对'); return; }
  if (daysBetween(birthDate, startOfDay(new Date())) < 0) { toast('出生日期不能晚于今天'); return; }

  if (editingId) {
    const b = state.members.find((x) => x.id === editingId);
    if (b) {
      b.name = name;
      b.birthday = birth;
      b.relation = draftRelation;
      b.avatar = draftAvatar;
    }
  } else {
    state.members.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      birthday: birth,
      relation: draftRelation,
      avatar: draftAvatar,
    });
    state.currentId = state.members[state.members.length - 1].id;
  }
  state.stats.unlocked = Array.from(new Set(state.stats.unlocked));
  saveAll();
  closeSheet('babyMask');
  renderAll();
  checkAchievements();
  toast(editingId ? '已保存' : `${name} 已加入 ${draftRelation === '宝宝' ? '👶' : '👨‍👩‍👧'}`);
}

function deleteBaby() {
  const btn = $('babyDelete');
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = '再点一次确认删除';
    setTimeout(() => {
      btn.dataset.confirm = '0';
      btn.textContent = '删除';
    }, 3000);
    return;
  }
  state.members = state.members.filter((b) => b.id !== editingId);
  if (state.currentId === editingId) state.currentId = state.members[0] ? state.members[0].id : null;
  saveAll();
  closeSheet('babyMask');
  renderAll();
  toast('已删除');
}

/* 导入导出 */
function exportData() {
  const payload = {
    app: 'suisuinan',
    version: 3,
    exportedAt: new Date().toISOString(),
    members: state.members,
    babies: state.members,   // 兼容旧版导入逻辑
    settings: state.settings,
    stats: state.stats,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `岁岁念-备份-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('备份已导出');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data.members) ? data.members : Array.isArray(data.babies) ? data.babies : null;
      if (!list) throw new Error('格式不对');
      state.members = list.map((m) => ({ ...m, relation: m.relation || '宝宝' }));
      state.currentId = state.members[0] ? state.members[0].id : null;
      if (data.settings) state.settings = { ...DEFAULTS.settings, ...data.settings };
      if (data.stats) state.stats = { ...JSON.parse(JSON.stringify(DEFAULTS.stats)), ...data.stats };
      saveAll();
      renderAll();
      fillSettings();
      toast(`已导入 ${state.members.length} 位成员`);
    } catch (e) {
      toast('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
}

/* ---------------- 初始化 ---------------- */
async function init() {
  const data = await store.get(['members', 'babies', 'currentId', 'settings', 'stats']);

  // 老版本只有 babies[]，这里做一次迁移，补上 relation
  if (Array.isArray(data.members)) {
    state.members = data.members;
    if (data.babies) chrome.storage.local.remove('babies');
  } else {
    state.members = (Array.isArray(data.babies) ? data.babies : []).map((b) => ({ ...b, relation: b.relation || '宝宝' }));
    if (state.members.length) {
      await store.set({ members: state.members });
      chrome.storage.local.remove('babies');
    }
  }
  state.currentId = data.currentId || (state.members[0] ? state.members[0].id : null);
  state.settings = { ...DEFAULTS.settings, ...(data.settings || {}) };
  state.stats = { ...JSON.parse(JSON.stringify(DEFAULTS.stats)), ...(data.stats || {}) };
  state.stats.streak = { ...DEFAULTS.stats.streak, ...(state.stats.streak || {}) };
  state.stats.daily = { ...DEFAULTS.stats.daily, ...(state.stats.daily || {}) };
  state.stats.flags = { ...DEFAULTS.stats.flags, ...(state.stats.flags || {}) };
  if (!Array.isArray(state.stats.unlocked)) state.stats.unlocked = [];

  // 清掉已下线成就（比如番茄钟）留下的 id
  const knownAchv = new Set(ACHIEVEMENTS.map((a) => a.id));
  const cleaned = state.stats.unlocked.filter((id) => knownAchv.has(id));
  if (cleaned.length !== state.stats.unlocked.length) {
    state.stats.unlocked = cleaned;
    saveStats();
  }

  const hour = new Date().getHours();
  if (hour >= 22 || hour < 5) state.stats.flags.night = true;
  if (hour < 8) state.stats.flags.early = true;

  rollDaily();
  rollStreak();

  resizeCanvas();
  fillSettings();
  renderAll();
  checkAchievements();

  // 事件绑定
  $('avatarBtn').addEventListener('click', petMember);
  $('avatarEditBadge').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = currentMember();
    if (m) openBabySheet(m.id); else openBabySheet(null);
  });
  $('btnSettings').addEventListener('click', () => { fillSettings(); openSheet('settingsMask'); });
  $('btnAdd').addEventListener('click', () => openBabySheet(null));
  $('btnEdit').addEventListener('click', () => {
    const b = currentMember();
    if (b) openBabySheet(b.id); else openBabySheet(null);
  });
  $('stSave').addEventListener('click', saveSettings);
  $('stExport').addEventListener('click', exportData);
  $('stImport').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => importData(e.target.files[0]));
  $('babySave').addEventListener('click', saveBaby);
  $('babyDelete').addEventListener('click', deleteBaby);
  const pickAvatar = () => $('avatarInput').click();
  $('avatarPreview').addEventListener('click', pickAvatar);
  $('avatarPickBtn').addEventListener('click', pickAvatar);
  $('avatarInput').addEventListener('change', (e) => handleAvatarFile(e.target.files[0], e.target));

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeSheet(btn.dataset.close));
  });
  document.querySelectorAll('.sheet-mask').forEach((mask) => {
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.classList.remove('show'); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.sheet-mask.show').forEach((m) => m.classList.remove('show'));
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.view').forEach((v) => {
        v.classList.toggle('active', v.id === 'view-' + tab.dataset.view);
      });
      $('views').scrollTop = 0;
    });
  });

  // 上班时段打开时，默认落在「工位」，第一眼就是下班倒计时
  try {
    const now = new Date();
    const startMin = minutesOf(state.settings.start);
    let endMin = minutesOf(state.settings.end);
    if (endMin <= startMin) endMin += 1440;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (isWorkday(now) && nowMin >= startMin && nowMin < endMin) {
      const workTab = document.querySelector('.tab[data-view="work"]');
      if (workTab) workTab.click();
    }
  } catch (e) { /* ignore */ }

  // 时钟
  setInterval(() => {
    updateWork();
    rollDaily();
  }, 1000);

  // 跨天刷新
  let lastDay = todayKey();
  setInterval(() => {
    const k = todayKey();
    if (k !== lastDay) {
      lastDay = k;
      rollDaily();
      rollStreak();
      renderAll();
    }
  }, 30000);
}

document.addEventListener('DOMContentLoaded', init);
