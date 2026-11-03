/* Landing TrackTube · runtime (sem dependências)
   1) Site: nav, revelação de seções, tour com scroll-spy.
   2) Telas reais: janelas que alternam capturas do sistema (data-scene="shots").

   Regras que este arquivo garante:
   - O HTML estático já é completo: sem JS, cada janela mostra a primeira tela
     e as abas continuam legíveis.
   - Com prefers-reduced-motion nada troca sozinho; as abas seguem clicáveis.
   - A troca automática só roda com a janela visível e a aba do navegador ativa.
     Só opacity e transform. */
(() => {
  'use strict';

  const root = document.documentElement;
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hasIO = 'IntersectionObserver' in window;
  root.classList.add('js');

  const offscreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.top > window.innerHeight * 0.9 || r.bottom < 0;
  };

  /* ======================================================================
     1. Site
     ====================================================================== */

  function initNav() {
    const nav = document.querySelector('[data-nav]');
    if (!nav) return;
    // Ao rolar, a barra vira uma cápsula flutuante (CSS em .is-scrolled)
    const paint = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; paint(); });
    }, { passive: true });
    paint();
    initNavPill(nav);

    const toggle = nav.querySelector('[data-nav-toggle]');
    const menu = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
    if (!toggle || !menu) return;
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      menu.hidden = !open;
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { setOpen(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  // Pílula que desliza até o link da seção visível e até o link sob o mouse.
  function initNavPill(nav) {
    const list = nav.querySelector('.nav__links');
    const pill = list && list.querySelector('.nav__pill');
    if (!pill || !hasIO) return;
    const links = [...list.querySelectorAll('a[href^="#"]')];
    const sections = links.map((a) => document.getElementById(a.hash.slice(1)));
    let current = null;
    let hovering = false;
    const place = (a) => {
      const wasHidden = !list.classList.contains('has-pill');
      list.classList.toggle('has-pill', !!a);
      if (!a) return;
      if (wasHidden) pill.style.transition = 'none';   // surge no lugar, sem deslizar da ponta
      list.style.setProperty('--px', `${a.offsetLeft}px`);
      list.style.setProperty('--pw', `${a.offsetWidth}px`);
      if (wasHidden) { void pill.offsetWidth; pill.style.transition = ''; }
    };
    const inBand = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? inBand.add(e.target) : inBand.delete(e.target)));
      const i = sections.findIndex((sec) => sec && inBand.has(sec));
      current = i < 0 ? null : links[i];
      links.forEach((a) => a.classList.toggle('is-current', a === current));
      if (!hovering) place(current);
    }, { rootMargin: '-45% 0px -54% 0px' });
    sections.forEach((sec) => { if (sec) io.observe(sec); });
    links.forEach((a) => a.addEventListener('pointerenter', () => { hovering = true; place(a); }));
    list.addEventListener('pointerleave', () => { hovering = false; place(current); });
  }

  function initReveal() {
    if (RM.matches || !hasIO) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      if (!offscreen(el)) return;
      el.classList.add('is-armed');
      io.observe(el);
    });
  }

  function initTour() {
    if (!hasIO) return;
    document.querySelectorAll('[data-tour]').forEach((tour) => {
      const links = [...tour.querySelectorAll('[data-tour-link]')];
      if (!links.length) return;
      const byId = new Map(links.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
      const setCurrent = (id) => links.forEach((a) => {
        if (a === byId.get(id)) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setCurrent(e.target.id); });
      }, { rootMargin: '-40% 0px -55% 0px' });
      byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
      setCurrent(decodeURIComponent(links[0].hash.slice(1)));
    });
  }

  /* ======================================================================
     2. Telas reais alternando (abas = itens de menu do sistema)
     ====================================================================== */

  function initShots() {
    document.querySelectorAll('[data-scene~="shots"]').forEach((el) => {
      const frames = [...el.querySelectorAll('[data-frame]')];
      const tabs = [...el.querySelectorAll('[data-frame-tab]')];
      if (frames.length < 2) return;
      const interval = Number(el.dataset.interval) || 4800;
      let index = 0;
      let timer = 0;
      let visible = false;
      let held = false;     // mouse ou foco dentro: pausa
      let manual = false;   // a pessoa escolheu uma tela: não troca mais sozinho

      const show = (i) => {
        index = (i + frames.length) % frames.length;
        frames.forEach((f, k) => f.classList.toggle('is-active', k === index));
        tabs.forEach((t, k) => t.setAttribute('aria-pressed', String(k === index)));
      };
      const stop = () => { clearTimeout(timer); timer = 0; };
      const tick = () => {
        stop();
        if (RM.matches || manual || held || !visible || document.hidden) return;
        timer = setTimeout(() => { show(index + 1); tick(); }, interval);
      };

      tabs.forEach((t, k) => t.addEventListener('click', () => { manual = true; show(k); stop(); }));
      const hold = (on) => () => { held = on; tick(); };
      el.addEventListener('pointerenter', hold(true));
      el.addEventListener('pointerleave', hold(false));
      el.addEventListener('focusin', hold(true));
      el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) hold(false)(); });
      el.classList.add('is-live');

      if (!hasIO) return;
      new IntersectionObserver(([e]) => {
        visible = e.isIntersecting && e.intersectionRatio >= 0.25;
        if (visible) tick(); else stop();
      }, { threshold: [0, 0.25] }).observe(el);
      document.addEventListener('visibilitychange', tick);
      RM.addEventListener('change', tick);
    });
  }

  /* ======================================================================
     3. Movimento ligado à rolagem (efeitos no estilo 21st.dev, sem React)
     Container Scroll, Text Reveal, Tracing Beam, parallax e Spotlight. Um único rAF por quadro; só transform e opacity.
     ====================================================================== */

  const clamp = (v) => Math.max(0, Math.min(1, v));

  // Quebra o texto em palavras (.tw) preservando os spans de destaque.
  function splitWords(el) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    nodes.forEach((n) => {
      const frag = document.createDocumentFragment();
      n.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const s = document.createElement('span');
        s.className = 'tw';
        s.textContent = part;
        frag.appendChild(s);
      });
      n.replaceWith(frag);
    });
  }

  function initMotion() {
    document.querySelectorAll('[data-spotlight]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
        el.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
      });
    });
    if (RM.matches) return;

    const tilts = [...document.querySelectorAll('[data-tilt]')];
    const reveals = [...document.querySelectorAll('[data-text-reveal]')].map((el) => {
      splitWords(el);
      return { el, words: [...el.querySelectorAll('.tw')] };
    });
    const traces = [...document.querySelectorAll('[data-trace]')].map((el) => ({
      el, fill: el.querySelector('.timeline__fill'), steps: [...el.querySelectorAll('.tstep')],
    }));
    const pars = [...document.querySelectorAll('[data-parallax]')];

    let queued = false;
    const update = () => {
      queued = false;
      const vh = window.innerHeight;

      // Container Scroll: a janela chega inclinada e endireita ao subir na tela
      const narrow = window.innerWidth < 761;
      tilts.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top > vh + 100 || r.bottom < -100) return;
        const p = clamp((vh * 0.95 - r.top) / (vh * 0.55));
        const deg = (narrow ? 8 : 16) * (1 - p);
        el.style.transform = `rotateX(${deg.toFixed(2)}deg) scale(${(0.94 + 0.06 * p).toFixed(4)})`;
      });

      // Text Reveal: cada palavra acende quando o título sobe na tela
      reveals.forEach(({ el, words }) => {
        const r = el.getBoundingClientRect();
        const p = clamp((vh * 0.92 - r.top) / (vh * 0.4));
        const n = words.length;
        words.forEach((w, i) => { w.style.opacity = Math.max(0.16, Math.min(1, p * n - i)).toFixed(3); });
      });

      // Tracing Beam: o feixe acompanha a leitura e acende os passos
      traces.forEach(({ el, fill, steps }) => {
        const r = el.getBoundingClientRect();
        const line = vh * 0.62;
        fill.style.transform = `scaleY(${clamp((line - r.top) / r.height).toFixed(4)})`;
        steps.forEach((s) => s.classList.toggle('is-lit', s.getBoundingClientRect().top + 40 < line));
      });

      // Parallax: peças flutuam em velocidade diferente da página
      pars.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const c = r.top + r.height / 2 - vh / 2;
        el.style.setProperty('--py', `${(-c * Number(el.dataset.parallax)).toFixed(1)}px`);
      });
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
  }

  /* ======================================================================
     4. Fundos em canvas: vórtice de linhas (herói) e chuva (CTA final)
     Desenham a ~30 qps só com o canvas visível e a aba ativa. Com movimento
     reduzido, desenham um quadro parado.
     ====================================================================== */

  function runCanvas(canvas, draw, opts = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0; let h = 0; let raf = 0; let visible = true; let last = 0; let busy = false;
    const t0 = performance.now();
    const size = () => {
      if (opts.fit) opts.fit();
      const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, w, h, RM.matches ? 0 : (performance.now() - t0) / 1000);
    };
    // ~30 qps parado; quadro a quadro enquanto o desenho ainda acompanha a rolagem
    const loop = (now) => {
      raf = 0;
      if (!visible || document.hidden || RM.matches) return;
      if (busy || now - last > 32) { last = now; busy = draw(ctx, w, h, (now - t0) / 1000) === true; }
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && visible && !document.hidden && !RM.matches) raf = requestAnimationFrame(loop); };
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(canvas.parentElement);
    else window.addEventListener('resize', size);
    document.addEventListener('visibilitychange', start);
    if (hasIO) new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(canvas);
    size();
    start();
  }

  // Vórtice: fios que giram devagar. Afunilam até logo acima da janela do
  // sistema, descem como um tubo fino por trás dela e saem embaixo abrindo num
  // disco largo. A rolagem torce os fios e abre o disco. Alguns em carmim.
  function makeVortex(canvas) {
    const stage = document.querySelector('.hero__stage');
    const TILT = 0.2;
    const UP = 40;   // passos do topo até o pescoço
    const MID = 18;  // passos do tubo atrás da janela
    const DN = 44;   // passos da saída até a borda do disco
    let neck = 0;    // topo da janela, em px do canvas
    let exit = 0;    // fundo da janela, em px do canvas
    let sp = 0;      // rolagem suavizada: 0 no topo, 1 com o disco já à vista
    let px = 0; let py = 0;

    // O degradê do fim (--fade) começa logo abaixo da janela e some no fim do herói.
    // No celular o topo também some (--fade-a/--fade-b): o funil aparece a partir
    // dos botões, em vez de uma agulha comprida atrás do título.
    const fit = () => {
      if (!stage) return;
      neck = stage.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
      exit = neck + stage.offsetHeight;
      const narrow = canvas.clientWidth < 700;
      canvas.style.setProperty('--fade', `${Math.round(Math.max(0, canvas.clientHeight - exit) * 0.8)}px`);
      canvas.style.setProperty('--fade-a', narrow ? `${Math.round(Math.max(0, neck - 560))}px` : '0px');
      canvas.style.setProperty('--fade-b', narrow ? `${Math.round(Math.max(0, neck - 300))}px` : '0px');
    };

    const draw = (ctx, w, h, t) => {
      const target = RM.matches ? 0 : clamp(window.scrollY / Math.max(1, exit - window.innerHeight * 0.45));
      sp += (target - sp) * 0.12;
      if (Math.abs(target - sp) < 0.001) sp = target;

      const narrow = w < 700;
      const mid = !narrow && w < 1100;   // tablet: meio-termo entre celular e desktop
      const N = narrow ? 120 : mid ? 150 : 170;
      const cx = w / 2;
      const n1 = (neck || h * 0.4) - (narrow ? 14 : 26);   // vira tubo logo acima da janela
      const n2 = (exit || h * 0.8) + (narrow ? 8 : 14);    // e abre logo abaixo dela
      // no celular: pescoço mais largo e boca que abre rápido, num trecho curto
      const top = narrow ? Math.max(-h * 0.02, n1 - 600) : -h * 0.02;
      const rw = (narrow ? w * 0.11 : mid ? w * 0.065 : Math.max(26, w * 0.036)) * (1 - 0.25 * sp);
      const kTop = narrow ? Math.max(28, n1 * 0.07) : mid ? n1 * 0.1 : n1 * 0.13;
      const capR = narrow ? w * 1.1 : Infinity;
      const drop = (narrow ? 120 : 190) * (0.85 + 0.4 * sp);
      const maxR = w * (narrow ? 1 : 0.62) * (0.78 + 0.32 * sp);
      const kBot = drop / Math.sqrt((maxR / rw) ** 2 - 1);
      const spin = t * 0.12 + sp * 2.4;

      // f: 0 a 1 do topo ao pescoço, 1 a 2 no tubo, 2 a 3 abrindo o disco (mais pontos na borda)
      const at = (a0, f) => {
        let y; let r; let th;
        if (f <= 1) {
          y = top + f * (n1 - top);
          const d = (y - n1) / kTop;
          r = Math.min(capR, rw * Math.sqrt(1 + d * d));
          th = a0 + f * 2.2 + spin;
        } else if (f <= 2) {
          y = n1 + (f - 1) * (n2 - n1);
          r = rw;
          th = a0 + 2.2 + (f - 1) * 1.6 + spin;
        } else {
          const u = Math.sqrt(f - 2);
          y = n2 + u * drop;
          const d = (u * drop) / kBot;
          r = rw * Math.sqrt(1 + d * d);
          th = a0 + 3.8 + u * 2 + spin;
        }
        px = cx + r * Math.cos(th);
        py = y + r * Math.sin(th) * TILT;
      };

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 0.7;
      const glow = 1 + 0.35 * sp;
      for (let i = 0; i < N; i += 1) {
        const a0 = (i / N) * Math.PI * 2;
        ctx.strokeStyle = i % 11 === 0 ? 'rgba(255,59,107,0.45)' : `rgba(255,255,255,${((0.1 + (i % 5) * 0.045) * glow).toFixed(3)})`;
        ctx.beginPath();
        at(a0, 0); ctx.moveTo(px, py);
        for (let k = 1; k <= UP; k += 1) { at(a0, k / UP); ctx.lineTo(px, py); }
        for (let k = 1; k <= MID; k += 1) { at(a0, 1 + k / MID); ctx.lineTo(px, py); }
        for (let k = 1; k <= DN; k += 1) { at(a0, 2 + k / DN); ctx.lineTo(px, py); }
        ctx.stroke();
      }
      // pontos de luz descendo pelos fios até a borda do disco
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < N; i += 3) {
        at((i / N) * Math.PI * 2, (t * 0.1 + i * 0.137) % 3);
        ctx.fillRect(px, py, 1.4, 1.4);
      }
      return sp !== target;
    };
    return { fit, draw };
  }

  // Chuva: riscos finos caindo; poucos em carmim.
  function makeRain() {
    let drops = [];
    let lastW = 0;
    return (ctx, w, h, t) => {
      if (w !== lastW) {
        lastW = w;
        const n = Math.round(w / 7);
        drops = Array.from({ length: n }, (_, i) => ({
          x: Math.random() * w, y0: Math.random() * h, len: 8 + Math.random() * 26,
          v: 40 + Math.random() * 120, a: 0.08 + Math.random() * 0.25, red: i % 17 === 0,
        }));
      }
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      drops.forEach((d) => {
        const y = (d.y0 + t * d.v) % (h + d.len) - d.len;
        ctx.strokeStyle = d.red ? `rgba(255,59,107,${d.a + 0.1})` : `rgba(255,255,255,${d.a})`;
        ctx.beginPath(); ctx.moveTo(d.x, y); ctx.lineTo(d.x, y + d.len); ctx.stroke();
      });
    };
  }

  function initCanvasFx() {
    const vortex = document.querySelector('[data-vortex]');
    const rain = document.querySelector('[data-rain]');
    if (vortex) {
      const v = makeVortex(vortex);
      runCanvas(vortex, v.draw, { fit: v.fit, maxDpr: 1.5 });
    }
    if (rain) runCanvas(rain, makeRain());
  }

  initNav();
  initReveal();
  initTour();
  initShots();
  initMotion();
  initCanvasFx();
})();
