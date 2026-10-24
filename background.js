/* 农历生日提醒：每天 09:00 检查一次，当天和前一天各弹一条浏览器通知 */
importScripts('lunar.js');

const ALARM = 'lunar-birthday-check';
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function ageText(birth) {
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  const anchor = (() => {
    const t = new Date(birth.getFullYear(), birth.getMonth() + months, 1);
    t.setDate(Math.min(birth.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return t;
  })();
  if (anchor > now) months -= 1;
  const y = Math.floor(months / 12);
  return y > 0 ? `${y} 岁` : `${months} 个月`;
}

function schedule() {
  chrome.alarms.get(ALARM, (a) => {
    if (a) return;
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    chrome.alarms.create(ALARM, { when: next.getTime(), periodInMinutes: 60 * 24 });
  });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);

// 每次 service worker 被唤醒都检查一次闹钟是否存在（安装/更新后可能没触发 onInstalled）
schedule();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) check(true);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'lunar-check') {
    check(!!msg.notify).then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  return false;
});

async function check(notify) {
  const data = await chrome.storage.local.get(['members', 'babies', 'settings', 'notified']);
  const members = data.members || (data.babies || []).map((m) => ({ ...m, relation: m.relation || '宝宝' }));
  const settings = data.settings || {};
  const notified = data.notified || {};
  if (settings.lunarReminder === false) return { skipped: 'reminder-off' };
  if (!Lunar.supported()) return { skipped: 'lunar-unsupported' };

  const today = new Date();
  const key = ymd(today);
  const out = [];

  for (const member of members) {
    if (!member || !member.birthday) continue;
    const birth = parseYmd(member.birthday);
    const nb = Lunar.nextBirthday(birth, today);
    if (!nb) continue;

    const label = `农历${nb.lunar.monthName}${nb.lunar.dayName}`;
    let title = null;
    let message = null;
    let id = null;

    if (nb.days === 0) {
      title = `🎂 今天是${member.name}的农历生日`;
      message = `${label} · 满 ${ageText(birth)}，记得买蛋糕。`;
      id = `lunar-${member.id}-${key}`;
    } else if (nb.days === 1) {
      title = `🍰 明天是${member.name}的农历生日`;
      message = `${label}，今天记得订蛋糕。`;
      id = `lunar-${member.id}-eve-${key}`;
    }

    if (id && notify && !notified[id]) {
      chrome.notifications.create(id, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title,
        message,
        priority: 2,
      });
      notified[id] = key;
    }
    out.push({ name: member.name, days: nb.days, label, notified: !!id });
  }

  // 只保留最近 60 条，避免无限增长
  const keys = Object.keys(notified);
  if (keys.length > 60) {
    keys.sort((a, b) => (notified[a] < notified[b] ? -1 : 1));
    for (const k of keys.slice(0, keys.length - 60)) delete notified[k];
  }
  await chrome.storage.local.set({ notified });
  return { today: key, members: out };
}
