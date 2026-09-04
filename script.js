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
      const on = btn.getAttribute('data-lang') === safeLang;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
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
  var cs = getComputedStyle(document.documentElement);
  document.body.style.backgroundColor = cs.getPropertyValue('--bg').trim();
  document.body.style.color = cs.getPropertyValue('--ink').trim();
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
