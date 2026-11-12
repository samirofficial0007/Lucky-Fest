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
    "#cgOverlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;",
    "background:radial-gradient(circle at 50% 0%,#2a1b5e 0%,#0d0b24 55%,#07061a 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}",
    "#cgOverlay .cg-card{width:100%;max-width:400px;border-radius:26px;padding:26px 18px 20px;background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.02));",
    "border:1px solid rgba(160,140,255,.28);box-shadow:0 20px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(16px);animation:cgIn .35s ease}",
    "@keyframes cgIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}",
    "#cgOverlay .cg-ico{width:84px;height:84px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;font-size:36px;",
    "background:radial-gradient(circle at 30% 25%,#8b6dff,#4b2fb8);box-shadow:0 0 0 8px rgba(139,109,255,.14),0 0 0 18px rgba(139,109,255,.07),0 10px 30px rgba(110,80,255,.5)}",
    "#cgOverlay h2{margin:6px 0 6px;text-align:center;font-size:25px;font-weight:800;background:linear-gradient(90deg,#4cc9ff,#8b6dff 50%,#ff5fc8);-webkit-background-clip:text;background-clip:text;color:transparent}",
    "#cgOverlay .cg-sub{text-align:center;font-size:13px;line-height:1.45;color:#b4b0d6;margin:0 6px 16px}",
    "#cgOverlay .cg-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}",
    "#cgOverlay .cg-step{border-radius:14px;padding:10px 4px;text-align:center;font-size:11px;color:#b4b0d6;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}",
    "#cgOverlay .cg-step b{display:grid;place-items:center;width:22px;height:22px;margin:0 auto 5px;border-radius:50%;font-size:12px;color:#fff;background:linear-gradient(135deg,#4cc9ff,#c04dff)}",
    "#cgOverlay .cg-row{display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:10px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}",
    "#cgOverlay .cg-av{flex:0 0 42px;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:18px;background:linear-gradient(135deg,#4cc9ff,#ff5fc8)}",
    "#cgOverlay .cg-meta{flex:1;min-width:0}",
    "#cgOverlay .cg-meta b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#cgOverlay .cg-meta small{color:#a29ec8;font-size:12px;font-weight:600}",
    "#cgOverlay .cg-join{border:0;cursor:pointer;color:#fff;font-weight:800;font-size:14px;padding:10px 18px;border-radius:12px;background:linear-gradient(135deg,#7c5cff,#b24dff);box-shadow:0 6px 16px rgba(124,92,255,.45)}",
    "#cgOverlay .cg-join:active,#cgOverlay .cg-verify:active{transform:scale(.96)}",
    "#cgOverlay .cg-verify{width:100%;margin-top:6px;border:0;cursor:pointer;color:#fff;font-weight:800;font-size:16px;padding:16px;border-radius:16px;",
    "background:linear-gradient(90deg,#7c5cff,#d94fc4);box-shadow:0 10px 26px rgba(190,80,220,.4)}",
    "#cgOverlay .cg-verify[disabled]{opacity:.65}",
    "#cgOverlay .cg-err{display:none;text-align:center;font-size:12.5px;color:#ff8aa0;margin:2px 0 8px}",
    "#cgOverlay .cg-card.shake{animation:cgShake .4s}",
    "@keyframes cgShake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}"
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
  function start() {
    check(false).then(function (d) { if (d.required) showGate(d.channels); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // user comes back from the channel -> auto verify
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && overlay) verify(true);
  });
})();
