/* 訪問ごとに配色（文字色と背景色の組み合わせ）を選び直す。
   最初の描画より前に色を確定させたいので、head で同期読み込みしている。
   同じ訪問のあいだはページを移動しても色を保つため sessionStorage に覚える。 */
(function () {
  var KEY = 'siteTheme';
  var FALLBACK = { bg: [10, 10, 11], ink: [244, 244, 242] };

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function f(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    if (s === 0) {
      var v = Math.round(l * 255);
      return [v, v, v];
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [
      Math.round(f(p, q, h + 1 / 3) * 255),
      Math.round(f(p, q, h) * 255),
      Math.round(f(p, q, h - 1 / 3) * 255),
    ];
  }

  function luminance(rgb) {
    var a = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function contrast(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function pick() {
    var offsets = [0, 24, -24, 42, -42, 180];
    for (var i = 0; i < 40; i++) {
      var h = Math.random() * 360;
      var bg = hslToRgb(h, 0.35 + Math.random() * 0.50, 0.060 + Math.random() * 0.090);
      var inkHue = h + offsets[Math.floor(Math.random() * offsets.length)];
      var ink = hslToRgb(inkHue, 0.12 + Math.random() * 0.38, 0.860 + Math.random() * 0.090);
      // 本文が読めない配色は採用しない
      if (contrast(ink, bg) >= 12) return { bg: bg, ink: ink };
    }
    return FALLBACK;
  }

  function apply(t) {
    var root = document.documentElement;
    root.style.setProperty('--bg-rgb', t.bg.join(', '));
    root.style.setProperty('--ink-rgb', t.ink.join(', '));
  }

  var theme = null;
  try {
    var raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.bg && parsed.bg.length === 3 && parsed.ink && parsed.ink.length === 3) {
        theme = parsed;
      }
    }
  } catch (e) {
    // プライベートモードなどで読めない場合は毎回選び直すだけ
  }

  if (!theme) {
    theme = pick();
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(theme));
    } catch (e) {}
  }

  apply(theme);
})();
