// DNS Bench — Loon 插件 · 本地 WebUI DNS 测速
// 拦截 http://dns.bench.local 的请求,由 Request Script 直接返回 WebUI 与 JSON API
// 依赖:Loon Build 988+($dns.query);插件 [Argument]:policy_group(string)、rounds(number)

var ARG = {};
try { ARG = typeof $argument === "object" && $argument ? $argument : {}; } catch (e) { ARG = {}; }
var POLICY_GROUP = String(ARG.policy_group || "DNS 测速");
var ROUNDS = Math.min(Math.max(parseInt(ARG.rounds, 10) || 3, 1), 5);

// ---------- DNS 服务器列表(国内/国际大厂,含 IPv6 与加密 DNS) ----------
var SERVERS = [
  { name: "阿里公共 DNS", group: "cn", flag: "🇨🇳", proto: "udp", v6: false, server: "223.5.5.5", org: "Alibaba" },
  { name: "阿里公共 DNS", group: "cn", flag: "🇨🇳", proto: "udp", v6: true, server: "[2400:3200::1]:53", org: "Alibaba" },
  { name: "阿里 DoH", group: "cn", flag: "🇨🇳", proto: "doh", v6: false, server: "https://dns.alidns.com/dns-query", org: "Alibaba" },
  { name: "腾讯 DNSPod", group: "cn", flag: "🇨🇳", proto: "udp", v6: false, server: "119.29.29.29", org: "Tencent" },
  { name: "腾讯 DNSPod v6", group: "cn", flag: "🇨🇳", proto: "udp", v6: true, server: "[2402:4e00::]:53", org: "Tencent" },
  { name: "DNSPod DoH", group: "cn", flag: "🇨🇳", proto: "doh", v6: false, server: "https://doh.pub/dns-query", org: "Tencent" },
  { name: "字节火山引擎", group: "cn", flag: "🇨🇳", proto: "udp", v6: false, server: "180.184.1.1", org: "ByteDance" },
  { name: "114 DNS", group: "cn", flag: "🇨🇳", proto: "udp", v6: false, server: "114.114.114.114", org: "114DNS" },
  { name: "百度公共 DNS", group: "cn", flag: "🇨🇳", proto: "udp", v6: false, server: "180.76.76.76", org: "Baidu" },
  { name: "Google DNS", group: "intl", flag: "🌐", proto: "udp", v6: false, server: "8.8.8.8", org: "Google" },
  { name: "Google DNS v6", group: "intl", flag: "🌐", proto: "udp", v6: true, server: "[2001:4860:4860::8888]:53", org: "Google" },
  { name: "Google DoH", group: "intl", flag: "🌐", proto: "doh", v6: false, server: "https://dns.google/dns-query", org: "Google" },
  { name: "Cloudflare", group: "intl", flag: "🌐", proto: "udp", v6: false, server: "1.1.1.1", org: "Cloudflare" },
  { name: "Cloudflare v6", group: "intl", flag: "🌐", proto: "udp", v6: true, server: "[2606:4700:4700::1111]:53", org: "Cloudflare" },
  { name: "Cloudflare DoH3", group: "intl", flag: "🌐", proto: "doh3", v6: false, server: "h3://cloudflare-dns.com/dns-query", org: "Cloudflare" },
  { name: "Quad9", group: "intl", flag: "🌐", proto: "udp", v6: false, server: "9.9.9.9", org: "Quad9" },
  { name: "Quad9 v6", group: "intl", flag: "🌐", proto: "udp", v6: true, server: "[2620:fe::fe]:53", org: "Quad9" },
  { name: "AdGuard DNS", group: "intl", flag: "🌐", proto: "udp", v6: false, server: "94.140.14.14", org: "AdGuard" },
  { name: "AdGuard v6", group: "intl", flag: "🌐", proto: "udp", v6: true, server: "[2a10:50c0::ad1:ff]:53", org: "AdGuard" },
  { name: "AdGuard DoQ", group: "intl", flag: "🌐", proto: "quic", v6: false, server: "quic://dns.adguard-dns.com:853", org: "AdGuard" },
  { name: "OpenDNS", group: "intl", flag: "🌐", proto: "udp", v6: false, server: "208.67.222.222", org: "Cisco" },
  { name: "OpenDNS v6", group: "intl", flag: "🌐", proto: "udp", v6: true, server: "[2620:119:35::35]:53", org: "Cisco" },
  { name: "DNS.SB DoH", group: "intl", flag: "🌐", proto: "doh", v6: false, server: "https://doh.dns.sb/dns-query", org: "DNS.SB" }
];

// 测速用域名池:轮换域名降低缓存影响
var TEST_DOMAINS = [
  "www.apple.com", "www.cloudflare.com", "www.baidu.com",
  "www.qq.com", "www.microsoft.com", "www.taobao.com",
  "www.wikipedia.org", "www.jd.com"
];

// ---------- 工具 ----------
function jsonResponse(obj, status) {
  $done({
    response: {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(obj)
    }
  });
}

function htmlResponse(body) {
  $done({
    response: {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      body: body
    }
  });
}

function parseQuery(url) {
  var q = {};
  var i = url.indexOf("?");
  if (i < 0) return q;
  url.slice(i + 1).split("&").forEach(function (kv) {
    var p = kv.split("=");
    try { q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); } catch (e) {}
  });
  return q;
}

// ---------- API:服务器列表 + 当前策略 ----------
function apiServers() {
  var selected = "";
  try { selected = String($config.getSelectedPolicy(POLICY_GROUP) || ""); } catch (e) {}
  jsonResponse({ ok: true, servers: SERVERS, policy: { name: POLICY_GROUP, selected: selected }, rounds: ROUNDS });
}

// ---------- API:策略组子策略列表 ----------
function apiPolicies() {
  $config.getSubPolicies(POLICY_GROUP, function (text) {
    var list = [];
    try { list = text ? JSON.parse(text) : []; } catch (e) { list = []; }
    jsonResponse({ ok: true, policies: list });
  });
}

// ---------- API:切换策略 ----------
function apiSelect(name) {
  var changed = false;
  try { changed = $config.setSelectPolicy(POLICY_GROUP, name); } catch (e) {}
  jsonResponse({ ok: changed, selected: changed ? name : String($config.getSelectedPolicy(POLICY_GROUP) || "") });
}

// ---------- API:单服务器测速(轮数取最小) ----------
function apiTest(index) {
  var srv = SERVERS[index];
  if (!srv) { jsonResponse({ ok: false, error: "INVALID_INDEX" }, 400); return; }

  var opts = { domain: TEST_DOMAINS[index % TEST_DOMAINS.length], timeout: 2000 };
  if (srv.server === "system") { opts.server = "system"; }
  else {
    opts.server = srv.server;
    if (srv.proto === "doh") opts.protocol = "doh";
    else if (srv.proto === "doh3") opts.protocol = "doh3";
    else if (srv.proto === "quic") opts.protocol = "quic";
  }

  var lats = [];
  var round = 0;

  function oneRound() {
    // 每轮换域名,避免命中同一缓存
    opts.domain = TEST_DOMAINS[(index + round) % TEST_DOMAINS.length];
    var t0 = Date.now();
    $dns.query(opts, function (error, result) {
      var dt = Date.now() - t0;
      round++;
      if (!error) {
        if (!(result && result.fromCache)) lats.push(dt);
        else lats.push(Math.min(dt, 1)); // 缓存命中,近似 0ms 计
      } else if (error.code === "TIMEOUT") {
        lats.push(2001); // 超时按上限记录
      } else if (error.code === "NO_ANSWER" && srv.v6) {
        lats.push(dt); // IPv6 无记录但服务器有响应,仍计延迟
      } else {
        lats.push(-1); // 硬错误
      }
      if (round < ROUNDS) { oneRound(); return; }
      finish();
    });
  }

  function finish() {
    var errs = lats.filter(function (x) { return x === -1; });
    if (errs.length === ROUNDS) { jsonResponse({ ok: false, error: "QUERY_FAILED" }); return; }
    var valid = lats.filter(function (x) { return x >= 0 && x < 2000; });
    if (!valid.length) { jsonResponse({ ok: false, error: "TIMEOUT" }); return; }
    var min = Math.min.apply(null, valid);
    if (min === 1) min = 0; // 缓存轮
    jsonResponse({ ok: true, lat: min, rounds: lats });
  }

  oneRound();
}

// ---------- 路由 ----------
var WEBUI_HTML = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no\">\n<title>DNS Bench · Loon</title>\n<style>\n:root{\n    --bg:#0b1220; --bg2:#101a2e;\n    --card:rgba(255,255,255,.055);\n    --card-hover:rgba(255,255,255,.09);\n    --line:rgba(255,255,255,.08);\n    --txt:#eef2f8; --txt2:#8b96a8; --txt3:#5b6577;\n    --blue:#0a84ff; --blue2:#5ac8fa;\n    --ok:#30d158; --warn:#ffd60a; --bad:#ff453a; --idle:#5b6577;\n    --grad:linear-gradient(135deg,#0a84ff 0%,#5e5ce6 100%);\n    --radius:18px;\n  }\n  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}\n  html,body{background:var(--bg);color:var(--txt);\n    font-family:-apple-system,BlinkMacSystemFont,\"SF Pro Text\",\"PingFang SC\",\"Segoe UI\",sans-serif;\n    -webkit-font-smoothing:antialiased;overscroll-behavior-y:none}\n  body{min-height:100vh;padding-bottom:calc(28px + env(safe-area-inset-bottom))}\n  body::before{content:\"\";position:fixed;inset:0;z-index:-1;\n    background:\n      radial-gradient(720px 340px at 85% -60px, rgba(94,92,230,.28), transparent 62%),\n      radial-gradient(560px 300px at -60px 12%, rgba(10,132,255,.22), transparent 60%),\n      var(--bg);}\n  .wrap{max-width:680px;margin:0 auto;padding:0 16px}\n\n  /* ---------- header ---------- */\n  header{position:sticky;top:0;z-index:50;padding-top:calc(10px + env(safe-area-inset-top));\n    background:rgba(11,18,32,.72);backdrop-filter:blur(22px) saturate(1.4);\n    -webkit-backdrop-filter:blur(22px) saturate(1.4);border-bottom:.5px solid var(--line)}\n  .h-row{display:flex;align-items:center;gap:12px;padding:6px 4px 12px}\n  .logo{width:42px;height:42px;border-radius:12px;background:var(--grad);\n    display:flex;align-items:center;justify-content:center;flex:none;\n    box-shadow:0 6px 18px rgba(10,132,255,.35)}\n  .logo svg{width:26px;height:26px}\n  .h-title{font-size:20px;font-weight:700;letter-spacing:.2px;line-height:1.15}\n  .h-sub{font-size:11.5px;color:var(--txt2);margin-top:2px;display:flex;align-items:center;gap:6px}\n  .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok)}\n  .h-right{margin-left:auto;text-align:right}\n  .h-right .ver{font-size:10px;color:var(--txt3);letter-spacing:.4px}\n\n  /* ---------- policy card ---------- */\n  .policy-card{margin-top:14px;background:var(--card);border:1px solid var(--line);\n    border-radius:var(--radius);padding:14px 16px;display:flex;align-items:center;gap:12px}\n  .policy-card .lbl{font-size:11px;color:var(--txt2);letter-spacing:.5px;margin-bottom:3px}\n  .policy-card .cur{font-size:16px;font-weight:650;display:flex;align-items:center;gap:7px}\n  .policy-card .cur .chev{color:var(--txt3);font-size:12px}\n  .policy-ico{width:38px;height:38px;border-radius:11px;flex:none;\n    background:rgba(10,132,255,.14);display:flex;align-items:center;justify-content:center}\n  .policy-ico svg{width:20px;height:20px}\n  .policy-arrow{margin-left:auto;color:var(--txt3);font-size:20px;padding:0 2px}\n\n  /* ---------- summary strip ---------- */\n  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}\n  .sum-item{background:var(--card);border:1px solid var(--line);border-radius:15px;\n    padding:11px 13px}\n  .sum-item .k{font-size:10.5px;color:var(--txt2);letter-spacing:.4px}\n  .sum-item .v{font-size:17px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums}\n  .sum-item .v small{font-size:11px;font-weight:500;color:var(--txt3);margin-left:2px}\n\n  /* ---------- toolbar ---------- */\n  .segs{display:flex;gap:8px;margin:16px 2px 10px;overflow-x:auto;scrollbar-width:none;\n    -webkit-overflow-scrolling:touch}\n  .segs::-webkit-scrollbar{display:none}\n  .seg{flex:none;padding:7px 14px;border-radius:999px;font-size:12.5px;font-weight:600;\n    color:var(--txt2);background:var(--card);border:1px solid var(--line);cursor:pointer;\n    transition:all .18s ease}\n  .seg.on{color:#fff;background:var(--grad);border-color:transparent;\n    box-shadow:0 4px 14px rgba(10,132,255,.35)}\n  .sort-btn{margin-left:auto;flex:none;display:flex;align-items:center;gap:5px;\n    padding:7px 13px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--blue2);\n    background:rgba(90,200,250,.1);border:1px solid rgba(90,200,250,.25);cursor:pointer}\n\n  /* ---------- list ---------- */\n  .list{display:flex;flex-direction:column;gap:9px;margin-top:4px}\n  .group-label{font-size:11px;font-weight:700;color:var(--txt3);letter-spacing:1px;\n    margin:14px 2px 2px;display:flex;align-items:center;gap:7px}\n  .group-label::after{content:\"\";flex:1;height:.5px;background:var(--line)}\n  .row{background:var(--card);border:1px solid var(--line);border-radius:15px;\n    padding:12px 14px;display:flex;align-items:center;gap:12px;\n    transition:background .15s ease,transform .15s ease}\n  .row:active{background:var(--card-hover)}\n  .row.best{border-color:rgba(48,209,88,.45);background:rgba(48,209,88,.07)}\n  .flag{font-size:17px;flex:none;width:26px;text-align:center}\n  .row-mid{flex:1;min-width:0}\n  .row-name{font-size:14.5px;font-weight:650;display:flex;align-items:center;gap:6px;\n    white-space:nowrap;overflow:hidden}\n  .row-addr{font-size:11px;color:var(--txt2);margin-top:2.5px;font-variant-numeric:tabular-nums;\n    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n  .badge{font-size:9px;font-weight:700;letter-spacing:.4px;padding:2px 6px;border-radius:5px;\n    vertical-align:1px}\n  .b-udp{background:rgba(10,132,255,.16);color:#64aefc}\n  .b-doh{background:rgba(94,92,230,.18);color:#a5a3ff}\n  .b-doh3{background:rgba(191,90,242,.18);color:#d78fff}\n  .b-quic{background:rgba(255,159,10,.16);color:#ffb340}\n  .b-v6{background:rgba(48,209,88,.14);color:#5be07e}\n  .b-best{background:rgba(48,209,88,.16);color:#5be07e}\n  .row-lat{flex:none;text-align:right;min-width:86px}\n  .lat-v{font-size:16px;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.2px}\n  .lat-v small{font-size:10.5px;font-weight:500;color:var(--txt3);margin-left:1px}\n  .lat-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.07);margin-top:5px;\n    overflow:hidden}\n  .lat-fill{height:100%;border-radius:2px;width:0%;\n    transition:width .5s cubic-bezier(.4,0,.2,1),background .3s}\n  .spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.18);\n    border-top-color:var(--blue);border-radius:50%;vertical-align:-2px;\n    animation:spin .7s linear infinite}\n  @keyframes spin{to{transform:rotate(360deg)}}\n  .lat-err{font-size:11px;color:var(--bad);font-weight:600}\n  .lat-idle{font-size:12px;color:var(--txt3);font-weight:500}\n\n  /* ---------- footer button ---------- */\n  .foot{position:fixed;left:0;right:0;bottom:0;z-index:60;\n    padding:12px 16px calc(12px + env(safe-area-inset-bottom));\n    background:linear-gradient(to top,rgba(11,18,32,.96) 55%,transparent);\n    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}\n  .foot-inner{max-width:680px;margin:0 auto;display:flex;gap:10px}\n  .btn-main{flex:1;padding:15px;border:none;border-radius:16px;background:var(--grad);\n    color:#fff;font-size:16px;font-weight:700;letter-spacing:.5px;cursor:pointer;\n    box-shadow:0 8px 24px rgba(10,132,255,.4);transition:transform .12s ease,opacity .2s;\n    display:flex;align-items:center;justify-content:center;gap:8px}\n  .btn-main:active{transform:scale(.97)}\n  .btn-main.testing{opacity:.85}\n  .btn-main:disabled{opacity:.55;box-shadow:none}\n  .btn-ghost{flex:none;padding:15px 18px;border-radius:16px;background:var(--card);\n    border:1px solid var(--line);color:var(--txt2);font-size:14px;font-weight:600;cursor:pointer}\n  .toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(20px);\n    background:rgba(28,38,58,.96);border:1px solid var(--line);color:var(--txt);\n    padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;z-index:99;\n    opacity:0;pointer-events:none;transition:all .3s ease;white-space:nowrap;\n    box-shadow:0 8px 30px rgba(0,0,0,.5)}\n  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}\n\n  /* ---------- sheet (policy picker) ---------- */\n  .sheet-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:80;opacity:0;\n    pointer-events:none;transition:opacity .25s}\n  .sheet-mask.show{opacity:1;pointer-events:auto}\n  .sheet{position:fixed;left:50%;bottom:0;transform:translateX(-50%);\n    width:100%;max-width:680px;z-index:81;background:var(--bg2);\n    border-radius:22px 22px 0 0;border:1px solid var(--line);border-bottom:none;\n    padding:10px 16px calc(18px + env(safe-area-inset-bottom));\n    max-height:72vh;display:none;flex-direction:column}\n  .sheet.show{display:flex;animation:sheetUp .28s cubic-bezier(.32,.72,.33,1)}\n  @keyframes sheetUp{from{transform:translateX(-50%) translateY(40px);opacity:.4}\n    to{transform:translateX(-50%) translateY(0);opacity:1}}\n  .sheet-grab{width:38px;height:5px;border-radius:3px;background:rgba(255,255,255,.18);\n    margin:2px auto 12px}\n  .sheet-title{font-size:16px;font-weight:700;padding:0 4px 10px;display:flex;justify-content:space-between;align-items:center}\n  .sheet-close{color:var(--txt2);font-size:13px;font-weight:600;padding:4px 8px;cursor:pointer}\n  .sheet-list{overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;\n    flex-direction:column;gap:7px}\n  .opt{padding:13px 14px;border-radius:13px;background:var(--card);\n    border:1px solid var(--line);font-size:14.5px;font-weight:600;cursor:pointer;\n    display:flex;align-items:center;gap:10px}\n  .opt.on{border-color:rgba(10,132,255,.55);background:rgba(10,132,255,.12)}\n  .opt .check{margin-left:auto;width:19px;height:19px;border-radius:50%;\n    border:1.6px solid var(--txt3);flex:none;display:flex;align-items:center;justify-content:center}\n  .opt.on .check{border-color:var(--blue);background:var(--blue)}\n  .opt .check svg{width:11px;height:11px;opacity:0}\n  .opt.on .check svg{opacity:1}\n  .foot-spacer{height:96px}\n  .row-copy{flex:none;width:30px;height:30px;border-radius:9px;flex:none;\n    background:rgba(255,255,255,.05);border:1px solid var(--line);\n    display:flex;align-items:center;justify-content:center;color:var(--txt3);\n    transition:all .15s ease}\n  .row-copy:active{background:rgba(10,132,255,.18);color:var(--blue2)}\n  .row-copy svg{width:15px;height:15px}\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <header>\n    <div class=\"h-row\">\n      <div class=\"logo\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M12 2C8.5 2 6 4.6 6 8c0 1.2.4 2.3 1 3.2L9 15h6l2-3.8c.6-.9 1-2 1-3.2 0-3.4-2.5-6-6-6Z\" fill=\"#fff\" opacity=\".92\"/><path d=\"M8.5 16.5h7L15 19h1.5l-.6 3H8.1L7.5 19H9l-.5-2.5Z\" fill=\"#fff\" opacity=\".78\"/><path d=\"M12 5.5c-1.9 0-3 1.4-3 3\" stroke=\"#5e5ce6\" stroke-width=\"1.4\" stroke-linecap=\"round\" opacity=\".8\"/></svg>\n      </div>\n      <div>\n        <div class=\"h-title\">DNS Bench</div>\n        <div class=\"h-sub\"><span class=\"dot\" id=\"netDot\"></span><span id=\"netInfo\">IPv4 · 已就绪</span></div>\n      </div>\n      <div class=\"h-right\"><div class=\"ver\">LOON PLUGIN</div><div class=\"ver\">v1.0.0</div></div>\n    </div>\n  </header>\n\n  <div class=\"policy-card\" id=\"policyCard\">\n    <div class=\"policy-ico\">\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#64aefc\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1\"/></svg>\n    </div>\n    <div>\n      <div class=\"lbl\">策略组 · 点击切换</div>\n      <div class=\"cur\"><span id=\"policyName\">DNS 测速</span><span class=\"chev\" id=\"policySel\">DIRECT</span></div>\n    </div>\n    <div class=\"policy-arrow\">›</div>\n  </div>\n\n  <div class=\"summary\">\n    <div class=\"sum-item\"><div class=\"k\">最快 DNS</div><div class=\"v\" id=\"sumBest\">—</div></div>\n    <div class=\"sum-item\"><div class=\"k\">平均延迟</div><div class=\"v\" id=\"sumAvg\">—<small>ms</small></div></div>\n    <div class=\"sum-item\"><div class=\"k\">可用 / 总数</div><div class=\"v\" id=\"sumOk\">—</div></div>\n  </div>\n\n  <div class=\"segs\" id=\"segs\">\n    <div class=\"seg on\" data-f=\"all\">全部</div>\n    <div class=\"seg\" data-f=\"cn\">国内</div>\n    <div class=\"seg\" data-f=\"intl\">国际</div>\n    <div class=\"seg\" data-f=\"v6\">IPv6</div>\n    <div class=\"seg\" data-f=\"doh\">加密 DNS</div>\n    <div class=\"sort-btn\" id=\"sortBtn\">↕ 延迟排序</div>\n  </div>\n\n  <div class=\"list\" id=\"list\"></div>\n  <div class=\"foot-spacer\"></div>\n</div>\n\n<div class=\"foot\">\n  <div class=\"foot-inner\">\n    <button class=\"btn-main\" id=\"goBtn\">\n      <svg width=\"17\" height=\"17\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z\"/></svg>\n      <span id=\"goTxt\">开始测速</span>\n    </button>\n    <button class=\"btn-ghost\" id=\"stopBtn\" style=\"display:none\">停止</button>\n  </div>\n</div>\n\n<div class=\"toast\" id=\"toast\"></div>\n<div class=\"sheet-mask\" id=\"sheetMask\"></div>\n<div class=\"sheet\" id=\"sheet\">\n  <div class=\"sheet-grab\"></div>\n  <div class=\"sheet-title\"><span>切换策略 · <span id=\"sheetPolicy\">DNS 测速</span></span><span class=\"sheet-close\" id=\"sheetClose\">关闭</span></div>\n  <div class=\"sheet-list\" id=\"sheetList\"></div>\n</div>\n<script>\nlet SERVERS = [];\nlet ROUNDS = 3;\nconst state = {filter:'all', sortByLat:false, results:{}, testing:false, stopFlag:false};\nconst $ = id => document.getElementById(id);\nconst protoLabel = {udp:'UDP', doh:'DoH', doh3:'DoH3', quic:'DoQ'};\n\nfunction classify(lat){\n  if(lat==null) return {c:'var(--idle)',w:0};\n  if(lat<60) return {c:'var(--ok)',w:100};\n  if(lat<150) return {c:'var(--warn)',w:70};\n  return {c:'var(--bad)',w:40};\n}\n\nfunction visible(){\n  let arr = SERVERS.map((s,i)=>({s,i}));\n  const f = state.filter;\n  if(f==='cn') arr = arr.filter(x=>x.s.group==='cn');\n  else if(f==='intl') arr = arr.filter(x=>x.s.group==='intl');\n  else if(f==='v6') arr = arr.filter(x=>x.s.v6);\n  else if(f==='doh') arr = arr.filter(x=>x.s.proto!=='udp');\n  if(state.sortByLat){\n    arr.sort((a,b)=>{\n      const la = state.results[a.i] && state.results[a.i].lat;\n      const lb = state.results[b.i] && state.results[b.i].lat;\n      if(la==null && lb==null) return 0;\n      if(la==null) return 1;\n      if(lb==null) return -1;\n      return la-lb;\n    });\n  }\n  return arr;\n}\n\nfunction render(){\n  const bestIdx = bestIndex();\n  const wrap = $('list');\n  wrap.innerHTML = '';\n  let lastGroup = null;\n  for(const {s,i} of visible()){\n    if(state.filter==='all' && !state.sortByLat && s.group!==lastGroup){\n      lastGroup = s.group;\n      const gl = document.createElement('div');\n      gl.className='group-label';\n      gl.textContent = s.group==='cn' ? '国内 DNS' : '国际 DNS';\n      wrap.appendChild(gl);\n    }\n    const r = state.results[i];\n    const row = document.createElement('div');\n    row.className = 'row' + (r && r.lat!=null && i===bestIdx ? ' best' : '');\n    let latHtml;\n    if(r && r.testing) latHtml = '<span class=\"spin\"></span>';\n    else if(r && r.lat!=null) latHtml = `${r.lat}<small>ms</small>`;\n    else if(r && r.err) latHtml = `<span class=\"lat-err\">${r.err}</span>`;\n    else latHtml = '<span class=\"lat-idle\">未测速</span>';\n    const cl = classify(r && r.lat);\n    row.innerHTML = `\n      <div class=\"flag\">${s.flag}</div>\n      <div class=\"row-mid\">\n        <div class=\"row-name\">${s.name}\n          <span class=\"badge b-${s.proto}\">${protoLabel[s.proto]}</span>\n          ${s.v6?'<span class=\"badge b-v6\">v6</span>':''}\n          ${r && r.lat!=null && i===bestIdx?'<span class=\"badge b-best\">最快</span>':''}\n        </div>\n        <div class=\"row-addr\">${s.server} · ${s.org}</div>\n      </div>\n      <div class=\"row-lat\">\n        <div class=\"lat-v\">${latHtml}</div>\n        <div class=\"lat-bar\"><div class=\"lat-fill\" style=\"width:${cl.w}%;background:${cl.c}\"></div></div>\n      </div>\n      <div class=\"row-copy\" data-copy=\"${s.server}\" title=\"复制服务器地址\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2.5\"/><path d=\"M5 15H4.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5\"/></svg>\n      </div>`;\n    wrap.appendChild(row);\n  }\n  renderSummary();\n}\n\nfunction copyText(text){\n  if (navigator.clipboard && navigator.clipboard.writeText){\n    return navigator.clipboard.writeText(text);\n  }\n  return new Promise((resolve,reject)=>{\n    const ta = document.createElement('textarea');\n    ta.value = text;\n    ta.style.cssText = 'position:fixed;left:-9999px;top:0';\n    document.body.appendChild(ta);\n    ta.select();\n    try{ document.execCommand('copy') ? resolve() : reject(); }\n    catch(e){ reject(e); }\n    finally{ ta.remove(); }\n  });\n}\n\ndocument.getElementById('list').addEventListener('click', e=>{\n  const btn = e.target.closest('.row-copy');\n  if(!btn) return;\n  copyText(btn.dataset.copy).then(()=>{\n    toast('已复制: ' + btn.dataset.copy);\n  }).catch(()=>{\n    toast('复制失败');\n  });\n});\n\nfunction bestIndex(){\n  let bi=null, bl=Infinity;\n  for(const k in state.results){\n    const r = state.results[k];\n    if(r && r.lat!=null && r.lat<bl){ bl=r.lat; bi=+k; }\n  }\n  return bi;\n}\n\nfunction renderSummary(){\n  const lats = Object.values(state.results).filter(r=>r&&r.lat!=null).map(r=>r.lat);\n  const bi = bestIndex();\n  $('sumBest').innerHTML = bi!=null ? `${SERVERS[bi].name.split(' ')[0]} <small style=\"font-size:11px;color:var(--ok)\">${state.results[bi].lat}ms</small>` : '—';\n  $('sumAvg').innerHTML = lats.length ? Math.round(lats.reduce((a,b)=>a+b,0)/lats.length)+'<small>ms</small>' : '—';\n  $('sumOk').textContent = lats.length ? `${lats.length} / ${SERVERS.length}` : '—';\n}\n\nfunction toast(t){\n  const el = $('toast');\n  el.textContent = t;\n  el.classList.add('show');\n  clearTimeout(el._t);\n  el._t = setTimeout(()=>el.classList.remove('show'), 2200);\n}\n\n/* ---- 真实测速:逐台调用 /api/test ---- */\nasync function runTest(){\n  if(state.testing) return;\n  state.testing = true;\n  state.stopFlag = false;\n  $('goTxt').textContent = '测速中…';\n  $('goBtn').classList.add('testing');\n  $('stopBtn').style.display='';\n  state.results = {};\n  SERVERS.forEach((_,i)=>state.results[i]={testing:true});\n  render();\n  for(let i=0;i<SERVERS.length;i++){\n    if(state.stopFlag){ state.results[i]={err:'已停止'}; render(); continue; }\n    try{\n      const r = await fetch(`/api/test?i=${i}`).then(r=>r.json());\n      state.results[i] = r.ok ? {lat:r.lat} : {err: r.error==='TIMEOUT'?'超时':'失败'};\n    }catch(e){\n      state.results[i] = {err:'失败'};\n    }\n    render();\n  }\n  state.testing = false;\n  // 测速完成后自动按照延迟升序排序\n  if(!state.sortByLat){\n    state.sortByLat = true;\n    const sb = $('sortBtn');\n    if(sb){\n      sb.style.color = '#fff';\n      sb.style.background = 'var(--grad)';\n    }\n  }\n  render();\n  $('goTxt').textContent = '重新测速';\n  $('goBtn').classList.remove('testing');\n  $('stopBtn').style.display='none';\n  const bi = bestIndex();\n  toast(bi!=null ? `最快:${SERVERS[bi].name} ${state.results[bi].lat}ms` : '测速完成');\n}\n\n/* ---- 初始化 ---- */\nasync function init(){\n  try{\n    const d = await fetch('/api/servers').then(r=>r.json());\n    SERVERS = d.servers;\n    ROUNDS = d.rounds || 3;\n    $('policyName').textContent = d.policy.name;\n    if(d.policy.selected) $('policySel').textContent = d.policy.selected;\n    $('netInfo').textContent = `共 ${SERVERS.length} 台 · ${ROUNDS} 轮取最小`;\n  }catch(e){\n    toast('初始化失败,请检查插件');\n  }\n  render();\n}\n\n/* ---- 交互绑定 ---- */\n$('segs').addEventListener('click', e=>{\n  const seg = e.target.closest('.seg');\n  if(seg){\n    document.querySelectorAll('.seg').forEach(x=>x.classList.remove('on'));\n    seg.classList.add('on');\n    state.filter = seg.dataset.f;\n    render();\n  }\n});\n$('sortBtn').addEventListener('click', ()=>{\n  state.sortByLat = !state.sortByLat;\n  $('sortBtn').style.color = state.sortByLat ? '#fff' : '';\n  $('sortBtn').style.background = state.sortByLat ? 'var(--grad)' : '';\n  toast(state.sortByLat ? '已按延迟排序' : '恢复默认排序');\n  render();\n});\n$('goBtn').addEventListener('click', runTest);\n$('stopBtn').addEventListener('click', ()=>{ state.stopFlag=true; toast('停止中…'); });\n\n/* ---- 策略组 sheet ---- */\nasync function openSheet(){\n  $('sheetPolicy').textContent = $('policyName').textContent;\n  const list = $('sheetList');\n  list.innerHTML = '<div style=\"padding:12px;color:var(--txt2);text-align:center\">加载中…</div>';\n  $('sheetMask').classList.add('show');\n  $('sheet').classList.add('show');\n  let policies = [];\n  try{\n    const d = await fetch('/api/policies').then(r=>r.json());\n    policies = d.policies || [];\n  }catch(e){}\n  list.innerHTML = '';\n  if(!policies.length){\n    list.innerHTML = '<div style=\"padding:12px;color:var(--txt2)\">未读取到子策略,请确认策略组名称</div>';\n    return;\n  }\n  policies.forEach(p=>{\n    const on = p === $('policySel').textContent;\n    const el = document.createElement('div');\n    el.className = 'opt' + (on?' on':'');\n    el.innerHTML = `${p}<span class=\"check\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 6 9 17l-5-5\"/></svg></span>`;\n    el.onclick = async ()=>{\n      try{\n        const d = await fetch('/api/select?name=' + encodeURIComponent(p)).then(r=>r.json());\n        if(d.ok){\n          $('policySel').textContent = p;\n          toast(`已切换 → ${p}`);\n        } else {\n          toast('切换失败');\n        }\n      }catch(e){ toast('切换失败'); }\n      closeSheet();\n    };\n    list.appendChild(el);\n  });\n}\nfunction closeSheet(){ $('sheetMask').classList.remove('show'); $('sheet').classList.remove('show'); }\n$('policyCard').addEventListener('click', openSheet);\n$('sheetClose').addEventListener('click', closeSheet);\n$('sheetMask').addEventListener('click', closeSheet);\n\ninit();\n\n</script>\n</body>\n</html>";

function main() {
  var url = String($request.url || "");
  var path = url.split("?")[0].replace(/^https?:\/\/[^/]+/, "");
  var query = parseQuery(url);

  if (path === "/" || path === "/index.html") { htmlResponse(WEBUI_HTML); return; }
  if (path === "/api/servers") { apiServers(); return; }
  if (path === "/api/policies") { apiPolicies(); return; }
  if (path === "/api/select") {
    if (!query.name) { jsonResponse({ ok: false, error: "MISSING_NAME" }, 400); return; }
    apiSelect(query.name);
    return;
  }
  if (path === "/api/test") { apiTest(parseInt(query.i, 10)); return; }
  jsonResponse({ ok: false, error: "NOT_FOUND", path: path }, 404);
}

main();
