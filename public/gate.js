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
    "#cgOverlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;isolation:isolate;",
    "background:radial-gradient(circle at 50% 0%,#17104a 0%,#09071f 55%,#04030f 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}",
    /* moving RGB aurora behind the card */
    "#cgOverlay:before,#cgOverlay:after{content:'';position:fixed;z-index:-1;width:380px;height:380px;border-radius:50%;filter:blur(90px);opacity:.5;pointer-events:none}",
    "#cgOverlay:before{top:-120px;left:-120px;background:#00d4ff;animation:cgFloatA 9s ease-in-out infinite alternate}",
    "#cgOverlay:after{bottom:-140px;right:-120px;background:#c13bff;animation:cgFloatB 11s ease-in-out infinite alternate}",
    "@keyframes cgFloatA{0%{transform:translate(0,0);background:#00d4ff}50%{background:#4f6bff}100%{transform:translate(160px,200px);background:#9b4dff}}",
    "@keyframes cgFloatB{0%{transform:translate(0,0);background:#c13bff}50%{background:#ff2d95}100%{transform:translate(-160px,-200px);background:#2f8bff}}",

    /* card with flowing RGB border */
    "#cgOverlay .cg-card{position:relative;width:100%;max-width:400px;border-radius:26px;padding:28px 18px 20px;",
    "background:linear-gradient(160deg,rgba(18,14,52,.88),rgba(8,6,28,.92));",
    "box-shadow:0 24px 70px rgba(0,0,0,.65),0 0 40px rgba(110,80,255,.25);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);animation:cgIn .45s cubic-bezier(.2,.9,.3,1.2),cgGlow 6s linear infinite}",
    "#cgOverlay .cg-card:before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1.6px;pointer-events:none;",
    "background:linear-gradient(115deg,#00e5ff,#2979ff,#7c4dff,#e040fb,#ff2d95,#e040fb,#7c4dff,#2979ff,#00e5ff);background-size:300% 100%;animation:cgFlow 4s linear infinite;",
    "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}",
    "@keyframes cgIn{from{opacity:0;transform:translateY(22px) scale(.95)}to{opacity:1;transform:none}}",
    "@keyframes cgFlow{0%{background-position:0% 50%}100%{background-position:300% 50%}}",
    "@keyframes cgGlow{0%,100%{box-shadow:0 24px 70px rgba(0,0,0,.65),0 0 44px rgba(0,212,255,.28)}33%{box-shadow:0 24px 70px rgba(0,0,0,.65),0 0 44px rgba(124,77,255,.34)}66%{box-shadow:0 24px 70px rgba(0,0,0,.65),0 0 44px rgba(255,45,149,.28)}}",

    /* icon with spinning RGB ring */
    "#cgOverlay .cg-ico{position:relative;isolation:isolate;width:84px;height:84px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;font-size:36px;animation:cgPulse 2.6s ease-in-out infinite}",
    "#cgOverlay .cg-ico:before{content:'';position:absolute;inset:-5px;border-radius:50%;z-index:-2;background:conic-gradient(#00e5ff,#2979ff,#7c4dff,#e040fb,#ff2d95,#e040fb,#7c4dff,#2979ff,#00e5ff);animation:cgSpin 3s linear infinite}",
    "#cgOverlay .cg-ico:after{content:'';position:absolute;inset:0;border-radius:50%;z-index:-1;background:radial-gradient(circle at 30% 25%,#241a6b,#0a0828)}",
    "@keyframes cgSpin{to{transform:rotate(360deg)}}",
    "@keyframes cgPulse{0%,100%{filter:drop-shadow(0 0 10px rgba(0,212,255,.55))}50%{filter:drop-shadow(0 0 22px rgba(224,64,251,.75))}}",

    /* flowing RGB title */
    "#cgOverlay h2{margin:6px 0 6px;text-align:center;font-size:25px;font-weight:800;letter-spacing:.2px;",
    "background:linear-gradient(90deg,#00e5ff,#4f8bff,#a855ff,#ff3dac,#a855ff,#4f8bff,#00e5ff);background-size:300% 100%;animation:cgFlow 5s linear infinite;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}",
    "#cgOverlay .cg-sub{text-align:center;font-size:13px;line-height:1.5;color:#b9b6e0;margin:0 6px 18px}",

    /* steps */
    "#cgOverlay .cg-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}",
    "#cgOverlay .cg-step{border-radius:14px;padding:10px 4px;text-align:center;font-size:11px;color:#c3c0e6;background:rgba(255,255,255,.05);border:1px solid rgba(140,120,255,.18)}",
    "#cgOverlay .cg-step b{display:grid;place-items:center;width:24px;height:24px;margin:0 auto 6px;border-radius:50%;font-size:12px;color:#fff;",
    "background:linear-gradient(135deg,#00e5ff,#7c4dff,#ff2d95);background-size:200% 200%;animation:cgFlow 3s linear infinite;box-shadow:0 0 12px rgba(124,77,255,.6)}",

    /* channel rows */
    "#cgOverlay .cg-row{display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:10px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(140,120,255,.22);animation:cgRowIn .5s ease both}",
    "@keyframes cgRowIn{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}",
    "#cgOverlay .cg-av{flex:0 0 44px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:18px;color:#fff;",
    "background:linear-gradient(135deg,#00e5ff,#7c4dff,#ff2d95,#00e5ff);background-size:300% 300%;animation:cgFlow 4s linear infinite;box-shadow:0 0 16px rgba(124,77,255,.5)}",
    "#cgOverlay .cg-meta{flex:1;min-width:0}",
    "#cgOverlay .cg-meta b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#cgOverlay .cg-meta small{color:#a9a5d6;font-size:12px;font-weight:600}",

    /* buttons: flowing RGB + glow + shine sweep */
    "#cgOverlay .cg-join,#cgOverlay .cg-verify{position:relative;overflow:hidden;border:0;cursor:pointer;color:#fff;font-weight:800;",
    "background:linear-gradient(100deg,#00c6ff,#4f6bff,#9b4dff,#e040fb,#4f6bff,#00c6ff);background-size:300% 100%;animation:cgFlow 4s linear infinite,cgBtnGlow 3s ease-in-out infinite;text-shadow:0 1px 6px rgba(0,0,0,.35)}",
    "#cgOverlay .cg-join:after,#cgOverlay .cg-verify:after{content:'';position:absolute;top:0;left:-70%;width:45%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent);transform:skewX(-20deg);animation:cgShine 3.2s ease-in-out infinite}",
    "#cgOverlay .cg-join{font-size:14px;padding:10px 20px;border-radius:12px}",
    "#cgOverlay .cg-verify{width:100%;margin-top:6px;font-size:16px;padding:16px;border-radius:16px}",
    "@keyframes cgShine{0%{left:-70%}55%,100%{left:130%}}",
    "@keyframes cgBtnGlow{0%,100%{box-shadow:0 6px 20px rgba(0,198,255,.45)}50%{box-shadow:0 6px 26px rgba(224,64,251,.6)}}",
    "#cgOverlay .cg-join:active,#cgOverlay .cg-verify:active{transform:scale(.96)}",
    "#cgOverlay .cg-verify[disabled]{opacity:.65}",

    "#cgOverlay .cg-err{display:none;text-align:center;font-size:12.5px;color:#ff7ab8;margin:2px 0 8px}",
    "#cgOverlay .cg-card.shake{animation:cgShake .4s,cgGlow 6s linear infinite}",
    "@keyframes cgShake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}",
    "@media (prefers-reduced-motion:reduce){#cgOverlay *,#cgOverlay:before,#cgOverlay:after{animation:none!important}}"
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
