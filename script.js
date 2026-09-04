document.documentElement.classList.add('js');

function initReveal() {
  const revealEls = document.querySelectorAll('.reveal');
  if (!revealEls.length) return;
  const isWorkPage = document.body.classList.contains('work-page');

  const replayReveal = () => {
    for (const el of revealEls) {
      el.classList.remove('show');
    }

    requestAnimationFrame(() => {
      for (const el of revealEls) {
        // Force reflow per element so transition is replayed reliably.
        void el.offsetWidth;
        el.classList.add('show');
      }
    });
  };

  if (isWorkPage) {
    replayReveal();
    window.addEventListener('pageshow', () => {
      replayReveal();
    });
    return;
  }

  if (!('IntersectionObserver' in window)) {
    for (const el of revealEls) {
      el.classList.add('show');
    }
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.01, rootMargin: "0px 0px -8% 0px" }
  );

  for (const el of revealEls) {
    observer.observe(el);
  }

  // Safety: reveal elements already in view right after navigation.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      for (const el of revealEls) {
        if (el.classList.contains('show')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < viewportH * 0.95 && rect.bottom > 0) {
          el.classList.add('show');
          observer.unobserve(el);
        }
      }
    });
  });

  // Final fallback: never leave reveal content hidden.
  window.setTimeout(() => {
    for (const el of revealEls) {
      if (!el.classList.contains('show')) {
        el.classList.add('show');
        observer.unobserve(el);
      }
    }
  }, 900);
}

const navLinks = document.querySelectorAll('a[href^="#"]');
for (const link of navLinks) {
  link.addEventListener('click', (event) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;

    const target = document.querySelector(href);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function initCurlBackground() {
  const canvas = document.getElementById('bg-curl');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  // WebGL が無い環境では body の地色だけが残る。背景は装飾なので黙って諦める。
  if (!gl) {
    canvas.remove();
    return;
  }

  const vertexSource = `
    attribute vec2 aPos;
    void main() {
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uPointer;   // uv と同じ座標系
    uniform float uHold;     // ポインタの効き具合 0..1

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float s = 0.0;
      float a = 0.5;
      for (int i = 0; i < 3; i++) {
        s += a * vnoise(p);
        p = p * 2.03 + vec2(11.3, 7.7);
        a *= 0.5;
      }
      return s;
    }

    // スカラーポテンシャルの回転をとると、湧き出しのない流れ場になる（カールノイズ）
    vec2 curl(vec2 p) {
      const float e = 0.09;
      float a = fbm(p);
      float b = fbm(p + vec2(e, 0.0));
      float c = fbm(p + vec2(0.0, e));
      return vec2(c - a, a - b) / e;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
      float t = uTime * 0.15;

      vec2 q = uv * 1.35;
      float paint = 0.0;
      float wsum = 0.0;
      float stir = 0.0;

      // 流れ場に沿って逆向きに辿りながら濃度を積む＝絵の具を引き伸ばした筆致になる
      for (int i = 0; i < 6; i++) {
        vec2 v = curl(q * 1.5 + vec2(t, -t * 0.6));

        // ポインタのまわりに渦をひとつ足して、絵の具をかき混ぜる
        vec2 dp = q - uPointer;
        float r2 = dot(dp, dp);
        float infl = exp(-r2 * 5.0) * uHold;
        v += vec2(-dp.y, dp.x) / (sqrt(r2) + 0.10) * infl * 3.4;
        v -= dp * infl * 1.5;
        stir += infl;

        q -= v * 0.072;
        float w = 1.0 - float(i) * 0.13;
        paint += fbm(q * 2.7 + vec2(0.0, t * 0.8)) * w;
        wsum += w;
      }
      paint /= wsum;
      stir /= 6.0;

      // 濃度差を刻んで筆の跡を分ける
      float wash = smoothstep(0.10, 0.62, paint);
      float edge = smoothstep(0.38, 0.66, paint);
      float rim  = smoothstep(0.52, 0.60, paint) * (1.0 - smoothstep(0.60, 0.74, paint));

      // オレンジを主役に、補色側の淡い青灰と、隣接色の淡いピーチを添える
      vec3 base   = vec3(0.043, 0.043, 0.048);
      vec3 haze   = vec3(0.255, 0.300, 0.395);
      vec3 orange = vec3(0.995, 0.615, 0.335);
      vec3 peach  = vec3(0.990, 0.760, 0.615);

      vec3 col = base;
      col = mix(col, haze, wash * 0.55);
      col = mix(col, orange, pow(edge, 1.3) * 0.82);
      col = mix(col, peach, rim * 0.34);

      // かき混ぜたところはわずかに温度が上がる
      col = mix(col, orange, clamp(stir, 0.0, 1.0) * 0.18);

      float vig = clamp(1.0 - 0.38 * dot(uv, uv), 0.0, 1.0);
      col *= vig;

      // 暗部の階調段差を隠す微細なノイズ
      col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.012;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('curl background:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = compile(gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) {
    canvas.remove();
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('curl background:', gl.getProgramInfoLog(program));
    canvas.remove();
    return;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, 'uRes');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uPointer = gl.getUniformLocation(program, 'uPointer');
  const uHold = gl.getUniformLocation(program, 'uHold');

  // 背景なので実解像度は落とす。文字の可読性には影響しない。
  const SCALE = 0.6;

  function resize() {
    const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
    const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  // ---- ポインタ追従 ----
  const target = { x: 0.0, y: 0.0 };
  const eased = { x: 0.0, y: 0.0 };
  let targetHold = 0;
  let hold = 0;

  function setPointer(clientX, clientY) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const m = Math.min(w, h);
    target.x = ((clientX - w * 0.5) / m) * 1.35;
    // gl_FragCoord は下が原点なので Y を反転する
    target.y = (-(clientY - h * 0.5) / m) * 1.35;
    targetHold = 1;
  }

  window.addEventListener(
    'pointermove',
    (event) => setPointer(event.clientX, event.clientY),
    { passive: true }
  );
  window.addEventListener('pointerdown', (event) => {
    setPointer(event.clientX, event.clientY);
    targetHold = 1;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { targetHold = 0; }, { passive: true });
  document.addEventListener('mouseleave', () => { targetHold = 0; }, { passive: true });

  function draw(seconds) {
    resize();
    // 追従を鈍らせて、絵の具をなでるような手触りにする
    eased.x += (target.x - eased.x) * 0.13;
    eased.y += (target.y - eased.y) * 0.13;
    hold += (targetHold - hold) * 0.09;
    gl.uniform1f(uTime, seconds);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform2f(uPointer, eased.x, eased.y);
    gl.uniform1f(uHold, hold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const FRAME = 1000 / 60;
  let raf = null;
  let last = 0;

  function loop(now) {
    raf = window.requestAnimationFrame(loop);
    if (now - last < FRAME) return;
    last = now;
    draw(now * 0.001);
  }

  function start() {
    if (raf !== null || reduce.matches || document.hidden) return;
    raf = window.requestAnimationFrame(loop);
  }

  function stop() {
    if (raf === null) return;
    window.cancelAnimationFrame(raf);
    raf = null;
  }

  draw(0);
  start();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener('resize', () => {
    if (raf === null) draw(window.performance.now() * 0.001);
  });

  const onReduceChange = () => {
    if (reduce.matches) {
      stop();
      draw(0);
    } else {
      start();
    }
  };
  if (reduce.addEventListener) reduce.addEventListener('change', onReduceChange);
  else if (reduce.addListener) reduce.addListener(onReduceChange);

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stop();
  });
}

function initTextScramble() {
  const targets = document.querySelectorAll(
    '.logo, nav a, .section-head h2, .about h2, .contact h2, .work-title'
  );
  if (!targets.length) return;
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const active = new WeakMap();

  function triggerScramble(el) {
    if (active.get(el)) return;

    const original = (el.textContent || '').trim();
    if (!original) return;

    active.set(el, true);
    let frame = 0;
    const totalFrames = 8;

    const timer = window.setInterval(() => {
      frame += 1;
      const revealCount = Math.floor((frame / totalFrames) * original.length);
      let output = '';

      for (let i = 0; i < original.length; i += 1) {
        const ch = original[i];
        if (ch === ' ') {
          output += ' ';
          continue;
        }
        if (i < revealCount) {
          output += ch;
        } else {
          output += glyphs[Math.floor(Math.random() * glyphs.length)];
        }
      }

      el.textContent = output;

      if (frame >= totalFrames) {
        window.clearInterval(timer);
        el.textContent = original;
        active.delete(el);
      }
    }, 24);
  }

  for (const el of targets) {
    el.addEventListener('mouseenter', () => triggerScramble(el));
    el.addEventListener('focus', () => triggerScramble(el));
  }
}

function initLanguageSwitch() {
  const body = document.body;
  if (!body) return;

  let switchRoot = document.querySelector('.lang-switch');
  if (!switchRoot) {
    switchRoot = document.createElement('div');
    switchRoot.className = 'lang-switch';
    switchRoot.setAttribute('role', 'group');
    switchRoot.setAttribute('aria-label', 'Language switch');
    switchRoot.innerHTML = `
      <button type="button" data-lang="jp">JP</button>
      <button type="button" data-lang="en">EN</button>
    `;
    body.appendChild(switchRoot);
  }

  function applyTranslations(lang) {
    for (const el of document.querySelectorAll('[data-en]')) {
      if (el.dataset.jpText === undefined) {
        el.dataset.jpText = el.textContent;
      }
      el.textContent = lang === 'en' ? el.getAttribute('data-en') : el.dataset.jpText;
    }
  }

  function setLang(lang) {
    const safeLang = lang === 'en' ? 'en' : 'jp';

    for (const btn of switchRoot.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === safeLang);
    }

    document.documentElement.lang = safeLang === 'jp' ? 'ja' : 'en';
    window.localStorage.setItem('siteLang', safeLang);
    applyTranslations(safeLang);
  }

  switchRoot.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const lang = target.getAttribute('data-lang');
    if (!lang) return;
    setLang(lang);
  });

  const initial = window.localStorage.getItem('siteLang') || 'jp';
  setLang(initial);
}

function enforceCurrentDesign() {
  // Remove legacy background nodes if an old page snapshot is restored.
  document.getElementById('shader-bg')?.remove();
  document.querySelectorAll('.work-photo-bg').forEach((el) => el.remove());

  // Hard-apply current palette so old theme snapshots cannot stay visible.
  document.body.style.backgroundColor = '#0a0a0b';
  document.body.style.color = '#f4f4f2';
}

function removeLegacyPlaceholderText() {
  const targetPattern = /Project page\.|作品ページ。/;

  const candidates = document.querySelectorAll('p, div, span, li');
  for (const el of candidates) {
    const t = (el.textContent || '').trim();
    if (!targetPattern.test(t)) continue;
    if (el.children.length === 0) {
      el.remove();
    }
  }

  // Guard against stale bfcache text-node restores.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = (node.nodeValue || '').trim();
    if (targetPattern.test(text)) {
      const parent = node.parentElement;
      if (parent && parent.children.length === 0) {
        parent.remove();
      } else {
        node.nodeValue = '';
      }
    }
    node = walker.nextNode();
  }
}

function startLegacyPlaceholderGuard() {
  removeLegacyPlaceholderText();
  window.setTimeout(removeLegacyPlaceholderText, 60);
  window.setTimeout(removeLegacyPlaceholderText, 260);
  window.setTimeout(removeLegacyPlaceholderText, 900);

  const observer = new MutationObserver(() => {
    removeLegacyPlaceholderText();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

removeLegacyPlaceholderText();
initReveal();
initCurlBackground();
initTextScramble();
initLanguageSwitch();
enforceCurrentDesign();
startLegacyPlaceholderGuard();

window.addEventListener('pageshow', (event) => {
  enforceCurrentDesign();
  removeLegacyPlaceholderText();
  if (event.persisted) {
    window.location.reload();
  }
});
