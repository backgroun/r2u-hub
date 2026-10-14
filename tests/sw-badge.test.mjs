// 서비스워커 아이콘 숫자 테스트: 가짜 서비스워커 환경에서 sw.js 를 실행해 푸시·열기 동작을 확인한다
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function makeSW({ visible = false, badgeApi = true } = {}) {
  const handlers = {};
  const store = new Map();
  const calls = { notifications: [], badge: [], navigated: [] };
  const state = { visible };
  const self = {
    addEventListener: (t, f) => (handlers[t] = f),
    skipWaiting: () => {}, registration: { showNotification: async (title, o) => calls.notifications.push([title, o]) },
    clients: {
      claim: async () => {},
      matchAll: async () => [{ visibilityState: state.visible ? "visible" : "hidden", focus: async () => {}, navigate: async (u) => calls.navigated.push(u) }],
      openWindow: async () => {},
    },
  };
  const navigator = badgeApi ? { setAppBadge: async (n) => calls.badge.push(n), clearAppBadge: async () => calls.badge.push(0) } : {};
  const caches = { open: async () => ({ put: async (k, r) => store.set(k, await r.text()), match: async (k) => (store.has(k) ? new Response(store.get(k)) : undefined) }) };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, navigator, caches, Response });
  const fire = async (type, ev = {}) => { let p = Promise.resolve(); await handlers[type]({ waitUntil: (x) => (p = x), ...ev }); await p; };
  return { fire, calls, state, handlers };
}
const push = (sw, data = { title: "공지", body: "내용" }) => sw.fire("push", { data: { json: () => data } });

test("푸시가 올 때마다 아이콘 숫자가 1씩 올라간다", async () => {
  const sw = makeSW();
  await push(sw); await push(sw); await push(sw);
  assert.deepEqual(sw.calls.badge, [1, 2, 3]);
  assert.equal(sw.calls.notifications.length, 3);
  assert.equal(sw.calls.notifications[0][0], "공지");
});

test("앱을 열면(clear-badge) 숫자가 지워지고 다시 1부터 센다", async () => {
  const sw = makeSW();
  await push(sw); await push(sw);
  await sw.fire("message", { data: { type: "clear-badge" } });
  assert.equal(sw.calls.badge.at(-1), 0);
  await push(sw);
  assert.equal(sw.calls.badge.at(-1), 1);
});

test("앱 화면을 보고 있는 중에 온 푸시는 숫자를 올리지 않는다 (알림은 그대로)", async () => {
  const sw = makeSW({ visible: true });
  await push(sw);
  assert.deepEqual(sw.calls.badge, []);
  assert.equal(sw.calls.notifications.length, 1);
});

test("알림을 눌러 앱을 열면 숫자가 지워지고 해당 화면으로 이동한다", async () => {
  const sw = makeSW();
  await push(sw, { title: "공지", body: "", url: "/notices" });
  await sw.fire("notificationclick", { notification: { close: () => {}, data: { url: "/notices" } } });
  assert.equal(sw.calls.badge.at(-1), 0);
  assert.deepEqual(sw.calls.navigated, ["/notices"]);
});

test("숫자 표시를 지원하지 않는 기기에서도 알림은 정상으로 뜬다", async () => {
  const sw = makeSW({ badgeApi: false });
  await push(sw); await push(sw);
  assert.equal(sw.calls.notifications.length, 2);
  assert.deepEqual(sw.calls.badge, []);
});
