document.documentElement.classList.add('js');

function enforceVersionedWorkPageUrls() {
  const version = 'stable20260305';
  const targets = new Set(['gravitation.html', 'uchusen-kansoku-sparklers.html']);

  // Normalize current URL for pages that were known to restore stale snapshots.
  const current = window.location.pathname.split('/').pop() || '';
  if (targets.has(current)) {
    const url = new URL(window.location.href);
    if (url.searchParams.get('v') !== version) {
      url.searchParams.set('v', version);
      window.location.replace(url.toString());
      return true;
    }
  }

  // Keep links versioned so navigation always bypasses stale cache entries.
  const anchors = document.querySelectorAll('a[href]');
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) continue;
    const [path] = href.split('?');
    if (!targets.has(path)) continue;
    a.setAttribute('href', `${path}?v=${version}`);
  }

  return false;
}

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

function initShaderBackground() {
  const canvas = document.getElementById('shader-bg');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) return;

  const vertexSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 ip = floor(p);
      vec2 u = fract(p);
      u = u * u * (3.0 - 2.0 * u);

      float res = mix(
        mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
        mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x),
        u.y
      );

      return res * res;
    }

    const mat2 mtx = mat2(0.80, 0.60, -0.60, 0.80);

    float fbm(vec2 p) {
      float f = 0.0;

      f += 0.500000 * noise(p + u_time); p = mtx * p * 2.02;
      f += 0.031250 * noise(p); p = mtx * p * 2.01;
      f += 0.250000 * noise(p); p = mtx * p * 2.03;
      f += 0.125000 * noise(p); p = mtx * p * 2.01;
      f += 0.062500 * noise(p); p = mtx * p * 2.04;
      f += 0.015625 * noise(p + sin(u_time));

      return f / 0.96875;
    }

    float pattern(vec2 p) {
      return fbm(p + fbm(p + fbm(p)));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.x;
      float shade = pattern(uv);
      float bw = pow(clamp(shade, 0.0, 1.0), 1.4) * 0.25;
      vec3 color = vec3(bw);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  if (!program) return;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return;
  }

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]),
    gl.STATIC_DRAW
  );

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const timeLocation = gl.getUniformLocation(program, 'u_time');
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function render(now) {
    resize();

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Use wall-clock time so shader phase stays continuous across page navigations.
    const globalSeconds = (performance.timeOrigin + now) * 0.001;
    gl.uniform1f(timeLocation, globalSeconds);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
  }

  window.addEventListener('resize', resize);
  requestAnimationFrame(render);
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
  const translations = {
    jp: {
      aboutText:
        'Atsuya / フロントエンドデベロッパー。HTML・CSS・JavaScriptを軸に、コンセプトのあるUIと軽快な実装を行います。目的に対して最適な構成を選び、伝わるデザインへ落とし込みます。',
      contactText: 'お仕事のご相談はメールまたはSNSからお気軽にどうぞ。',
      workPageBody: '作品ページ。',
    },
    en: {
      aboutText:
        'Atsuya / Frontend Developer. I build concept-driven interfaces with clean HTML, CSS, and JavaScript implementation. I choose the right structure for each goal and shape it into clear visual communication.',
      contactText: 'For project inquiries, feel free to reach out by email or social media.',
      workPageBody: 'Project page.',
    },
  };

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

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && typeof value === 'string') el.textContent = value;
  }

  function setLang(lang) {
    const safeLang = lang === 'en' ? 'en' : 'jp';
    const dict = translations[safeLang];
    const isWorkPage = body.classList.contains('work-page');

    if (!isWorkPage) {
      setText('section.about p', dict.aboutText);
      setText('section.contact p', dict.contactText);
    } else {
      setText('section.about p', dict.workPageBody);
    }

    for (const btn of switchRoot.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === safeLang);
    }

    document.documentElement.lang = safeLang === 'jp' ? 'ja' : 'en';
    window.localStorage.setItem('siteLang', safeLang);
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
  document.body.style.backgroundColor = '#cdced1';
  document.body.style.color = '#141517';
}

function initInstagramFab() {
  if (document.querySelector('.ig-fab')) return;
  const link = document.createElement('a');
  link.className = 'ig-fab';
  link.href = 'https://www.instagram.com/';
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.setAttribute('aria-label', 'Instagram');
  link.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5.2" stroke="currentColor" stroke-width="1.8"></rect>
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" stroke-width="1.8"></circle>
      <circle cx="17.4" cy="6.6" r="1.15" fill="currentColor"></circle>
    </svg>
  `;
  document.body.appendChild(link);
}

const redirectedForVersion = enforceVersionedWorkPageUrls();
if (!redirectedForVersion) {
  initReveal();
  initShaderBackground();
  initTextScramble();
  initLanguageSwitch();
  enforceCurrentDesign();
  initInstagramFab();
}

window.addEventListener('pageshow', (event) => {
  enforceCurrentDesign();
  if (event.persisted) {
    window.location.reload();
  }
});
