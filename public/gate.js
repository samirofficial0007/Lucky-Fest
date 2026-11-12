/* Channel join popup (loaded before app.js) */
(function () {
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var overlay = null;
  var busy = false;

  function initHeaders() {
    var h = {};
    if (tg && tg.initData) h["x-telegram-init-data"] = tg.initData;
    return h;
  }

  /* ---- styles ---- */
  var css = [
    /* palette: cyan / blue / violet / magenta only (no yellow, no orange) */
    /* calm version: only GPU-friendly motion (transform/opacity), no animated blur/shadow/filter */
    "#cgOverlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;",
    "background:radial-gradient(circle at 12% 8%,rgba(0,200,255,.22),transparent 45%),radial-gradient(circle at 90% 95%,rgba(200,60,255,.24),transparent 45%),linear-gradient(180deg,#0d0a2e 0%,#06051a 100%);",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}",

    /* card: rotating RGB border (transform only) */
    "#cgOverlay .cg-card{position:relative;width:100%;max-width:400px;border-radius:26px;padding:30px 20px 22px;overflow:hidden;isolation:isolate;",
    "box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 34px rgba(124,77,255,.28);animation:cgIn .4s ease-out}",
    "#cgOverlay .cg-card:before{content:'';position:absolute;z-index:-2;left:-50%;top:-50%;width:200%;height:200%;",
    "background:conic-gradient(from 0deg,#00e5ff,#2979ff,#7c4dff,#e040fb,#ff2d95,#e040fb,#7c4dff,#2979ff,#00e5ff);animation:cgSpin 7s linear infinite;will-change:transform}",
    "#cgOverlay .cg-card:after{content:'';position:absolute;z-index:-1;inset:2px;border-radius:24px;background:linear-gradient(160deg,#150f45,#090721)}",
    "@keyframes cgIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}",
    "@keyframes cgSpin{to{transform:rotate(360deg)}}",

    /* icon: slow rotating ring, static glow */
    "#cgOverlay .cg-ico{position:relative;isolation:isolate;width:84px;height:84px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;font-size:36px;box-shadow:0 0 26px rgba(124,77,255,.55)}",
    "#cgOverlay .cg-ico:before{content:'';position:absolute;inset:-5px;border-radius:50%;z-index:-2;background:conic-gradient(#00e5ff,#2979ff,#7c4dff,#e040fb,#ff2d95,#e040fb,#7c4dff,#2979ff,#00e5ff);animation:cgSpin 5s linear infinite;will-change:transform}",
    "#cgOverlay .cg-ico:after{content:'';position:absolute;inset:0;border-radius:50%;z-index:-1;background:radial-gradient(circle at 30% 25%,#241a6b,#0a0828)}",

    /* title: static RGB gradient */
    "#cgOverlay h2{margin:6px 0 6px;text-align:center;font-size:25px;font-weight:800;",
    "background:linear-gradient(90deg,#00e5ff,#6a8bff 40%,#b255ff 70%,#ff3dac);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}",
    "#cgOverlay .cg-sub{text-align:center;font-size:13px;line-height:1.5;color:#b9b6e0;margin:0 6px 18px}",

    /* steps */
    "#cgOverlay .cg-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}",
    "#cgOverlay .cg-step{border-radius:14px;padding:10px 4px;text-align:center;font-size:11px;color:#c3c0e6;background:rgba(255,255,255,.05);border:1px solid rgba(140,120,255,.18)}",
    "#cgOverlay .cg-step b{display:grid;place-items:center;width:24px;height:24px;margin:0 auto 6px;border-radius:50%;font-size:12px;color:#fff;background:linear-gradient(135deg,#00c6ff,#7c4dff,#e040fb)}",

    /* channel rows (no re-animation) */
    "#cgOverlay .cg-row{display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:10px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(140,120,255,.22)}",
    "#cgOverlay .cg-av{flex:0 0 44px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:18px;color:#fff;background:linear-gradient(135deg,#00c6ff,#7c4dff,#ff2d95)}",
    "#cgOverlay .cg-meta{flex:1;min-width:0}",
    "#cgOverlay .cg-meta b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#cgOverlay .cg-meta small{color:#a9a5d6;font-size:12px;font-weight:600}",

    /* buttons: static RGB gradient + soft shine sweep (transform only) */
    "#cgOverlay .cg-join,#cgOverlay .cg-verify{position:relative;overflow:hidden;border:0;cursor:pointer;color:#fff;font-weight:800;",
    "background:linear-gradient(100deg,#00b8ff,#5b6bff 45%,#a14dff 75%,#e040fb);box-shadow:0 6px 18px rgba(124,77,255,.45);text-shadow:0 1px 5px rgba(0,0,0,.35)}",
    "#cgOverlay .cg-join:after,#cgOverlay .cg-verify:after{content:'';position:absolute;top:0;left:0;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:translateX(-160%) skewX(-20deg);animation:cgShine 4.5s ease-in-out infinite;will-change:transform}",
    "#cgOverlay .cg-join{font-size:14px;padding:10px 20px;border-radius:12px}",
    "#cgOverlay .cg-verify{width:100%;margin-top:6px;font-size:16px;padding:16px;border-radius:16px}",
    "@keyframes cgShine{0%{transform:translateX(-160%) skewX(-20deg)}45%,100%{transform:translateX(380%) skewX(-20deg)}}",
    "#cgOverlay .cg-join:active,#cgOverlay .cg-verify:active{transform:scale(.96)}",
    "#cgOverlay .cg-verify[disabled]{opacity:.65}",

    "#cgOverlay .cg-err{display:none;text-align:center;font-size:12.5px;color:#ff7ab8;margin:2px 0 8px}",
    "#cgOverlay .cg-card.shake{animation:cgShake .4s}",
    "@keyframes cgShake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}",
    "@media (prefers-reduced-motion:reduce){#cgOverlay *{animation:none!important}}"
  ].join("");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  /* ---- UI ---- */
  function openLink(url) {
    if (!url) return;
    if (tg && tg.openTelegramLink && /^https:\/\/t\.me\//i.test(url)) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function buildRows(card, channels) {
    var list = card.querySelector(".cg-list");
    var key = channels.map(function (c) { return (c.username || "") + "|" + (c.url || ""); }).join(",");
    if (list.getAttribute("data-key") === key) return;
    list.setAttribute("data-key", key);
    list.innerHTML = "";
    channels.forEach(function (c) {
      var row = el("div", "cg-row");
      var av = el("div", "cg-av", (c.title || c.username || "C").replace("@", "").charAt(0).toUpperCase());
      var meta = el("div", "cg-meta");
      meta.appendChild(el("b", "", c.username || c.title));
      meta.appendChild(el("small", "", "Official channel"));
      var btn = el("button", "cg-join", "Join");
      btn.type = "button";
      btn.onclick = function () { openLink(c.url); };
      row.appendChild(av);
      row.appendChild(meta);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function showGate(channels) {
    if (!overlay) {
      overlay = el("div");
      overlay.id = "cgOverlay";
      var card = el("div", "cg-card");
      card.appendChild(el("div", "cg-ico", "🔊"));
      card.appendChild(el("h2", "", "Join our channel first"));
      card.appendChild(el("p", "cg-sub", "Join our channel to unlock the app: news, rewards and updates are posted there."));
      var steps = el("div", "cg-steps");
      ["Join the channel", "Come back here", "Tap verify"].forEach(function (t, i) {
        var s = el("div", "cg-step");
        s.appendChild(el("b", "", String(i + 1)));
        s.appendChild(document.createTextNode(t));
        steps.appendChild(s);
      });
      card.appendChild(steps);
      card.appendChild(el("div", "cg-list"));
      card.appendChild(el("div", "cg-err", "You have not joined all channels yet."));
      var v = el("button", "cg-verify", "I joined, verify");
      v.type = "button";
      v.onclick = function () { verify(false); };
      card.appendChild(v);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      document.body.style.overflow = "hidden";
    }
    buildRows(overlay.querySelector(".cg-card"), channels);
  }

  function hideGate() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.body.style.overflow = "";
  }

  function check(fresh) {
    return window.__origFetch("/api/channel-gate" + (fresh ? "?fresh=1" : ""), { headers: initHeaders() })
      .then(function (r) { return r.json(); })
      .catch(function () { return { required: false, channels: [] }; });
  }

  function verify(silent) {
    if (busy || !overlay) return;
    busy = true;
    var btn = overlay.querySelector(".cg-verify");
    if (!silent) { btn.disabled = true; btn.textContent = "Checking..."; }
    check(true).then(function (d) {
      busy = false;
      if (!d.required) { hideGate(); return; }
      if (!overlay) return;
      btn.disabled = false;
      btn.textContent = "I joined, verify";
      buildRows(overlay.querySelector(".cg-card"), d.channels);
      if (!silent) {
        var card = overlay.querySelector(".cg-card");
        overlay.querySelector(".cg-err").style.display = "block";
        card.classList.remove("shake");
        void card.offsetWidth;
        card.classList.add("shake");
        if (tg && tg.HapticFeedback) { try { tg.HapticFeedback.notificationOccurred("error"); } catch (e) {} }
      }
    });
  }

  /* ---- fetch wrapper: any API call answered with gate:true reopens the popup ---- */
  window.__origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    return window.__origFetch(input, init).then(function (res) {
      try {
        var url = typeof input === "string" ? input : input && input.url;
        if (res.status === 403 && url && url.indexOf("/api/") !== -1 && url.indexOf("channel-gate") === -1) {
          res.clone().json().then(function (d) {
            if (d && d.gate) check(true).then(function (g) { if (g.required) showGate(g.channels); });
          }).catch(function () {});
        }
      } catch (e) {}
      return res;
    });
  };

  /* ---- start ---- */
  var lastCheck = 0;
  function recheck() {
    // Telegram can resume an already-open Mini App without reloading it,
    // so start() would never run again. Re-check on every resume + periodically.
    if (overlay || document.hidden) return;
    var now = Date.now();
    if (now - lastCheck < 5000) return;
    lastCheck = now;
    check(false).then(function (d) { if (d.required) showGate(d.channels); });
  }

  function start() {
    lastCheck = Date.now();
    check(false).then(function (d) { if (d.required) showGate(d.channels); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // user comes back from the channel -> auto verify (popup open) / re-check (popup closed)
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (overlay) verify(true);
    else recheck();
  });
  window.addEventListener("focus", function () { if (overlay) verify(true); else recheck(); });
  if (tg && tg.onEvent) {
    try { tg.onEvent("activated", function () { if (overlay) verify(true); else recheck(); }); } catch (e) {}
    try { tg.onEvent("viewportChanged", function (e) { if (!e || e.isStateStable) recheck(); }); } catch (e) {}
  }
  // while the app stays open: detect a leave within ~30s
  setInterval(function () { if (!overlay) recheck(); }, 30000);
})();
