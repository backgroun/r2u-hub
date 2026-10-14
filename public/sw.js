// R2U 공지 알림 서비스 워커: 푸시를 받으면 알림을 띄우고, 누르면 해당 화면을 연다.
// 홈 화면에 추가한 앱이면 아이콘에 ‘앱을 마지막으로 연 뒤 받은 푸시 수’를 숫자로 달고, 앱을 열면 지운다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const BADGE_CACHE = "r2u-badge";
const BADGE_KEY = "/__badge";

async function getBadge() {
  try {
    const r = await (await caches.open(BADGE_CACHE)).match(BADGE_KEY);
    return r ? Number(await r.text()) || 0 : 0;
  } catch (_) { return 0; }
}

async function setBadge(n) {
  try { await (await caches.open(BADGE_CACHE)).put(BADGE_KEY, new Response(String(n))); } catch (_) {}
  // 아이콘 숫자(Badging API): 지원하지 않는 기기에서는 조용히 넘어간다
  try {
    if (n > 0 && navigator.setAppBadge) await navigator.setAppBadge(n);
    else if (navigator.clearAppBadge) await navigator.clearAppBadge();
  } catch (_) {}
}

// 지금 앱 화면을 보고 있으면 알림이 와도 숫자를 올리지 않는다
async function appVisible() {
  try {
    const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    return cs.some((c) => c.visibilityState === "visible");
  } catch (_) { return false; }
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "R2U 공지", {
      body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: d.url || "/" },
    }),
    (async () => { if (!(await appVisible())) await setBadge((await getBadge()) + 1); })(),
  ]));
});

// 앱 화면이 열리면(또는 다시 보이면) 페이지가 숫자를 지우라고 알려 준다
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "clear-badge") e.waitUntil(setBadge(0));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(Promise.all([
    setBadge(0),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if ("focus" in c) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    }),
  ]));
});
