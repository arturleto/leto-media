/* LETO MEDIA v4. Скрипт страницы.
   Схема сети (canvas), графики (SVG), пульт, чек за месяц, калькулятор, карусель кейсов,
   навигация и тема. Все цифры уже стоят в разметке, скрипт только оживляет их.
   Цифры прогноза считает model.js, это точная копия ФИНМОДЕЛЬ/model_v4.py. */
(function () {
  'use strict';

  var LM = window.LM, MODEL = window.LMModel;
  if (!LM || !MODEL) return;
  var M = LM.M;

  var NB = ' ', MINUS = '−';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var docEl = document.documentElement;
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mqSmall = window.matchMedia ? window.matchMedia('(max-width: 700px)') : null;
  var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function rm() { return !!(mqReduce && mqReduce.matches); }
  function small() { return !!(mqSmall && mqSmall.matches); }
  function listen(mq, fn) { if (!mq) return; if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return (ctx || document).querySelectorAll(sel); }
  function safe(fn) { try { return fn(); } catch (e) { if (window.console) console.error(e); return null; } }

  /* ---------- числа и слова ---------- */
  function fmt(x, d) {
    d = d || 0;
    var s = Math.abs(x).toFixed(d);
    if (Number(s) === 0) x = 0;
    var p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return (x < 0 ? MINUS : '') + p.join(',');
  }
  function usd(x, d) { return fmt(x, d) + NB + '$'; }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function trimNum(x) {
    var d = Math.abs(x - Math.round(x)) < 1e-9 ? 0 : (Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? 1 : 2);
    return fmt(x, d);
  }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function chanTxt(n) { return n + NB + plural(n, 'канал', 'канала', 'каналов'); }
  function monthsTxt(a) {
    if (Math.abs(a - Math.round(a)) < 1e-9) { var n = Math.round(a); return n + NB + plural(n, 'месяц', 'месяца', 'месяцев'); }
    return fmt(a, 1) + NB + 'месяца';
  }
  function short(v) {
    if (v === 0) return '0';
    if (v >= 1e6) return trimNum(v / 1e6) + NB + 'млн';
    if (v >= 1e3) return trimNum(v / 1e3) + NB + 'тыс.';
    return fmt(v);
  }
  function shortR(v) {
    if (v >= 1e6) { var mv = v / 1e6; return trimNum(mv >= 10 ? Math.round(mv) : Math.round(mv * 10) / 10) + NB + 'млн'; }
    if (v >= 1e3) return fmt(Math.round(v / 1e3)) + NB + 'тыс.';
    return fmt(Math.round(v));
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), s = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < s.length; i++) if (s[i] * p >= v - 1e-9) return s[i] * p;
    return 10 * p;
  }

  /* ---------- прогоны модели ---------- */
  var RUNS = {};
  ['c', 'w', 's'].forEach(function (k) { RUNS[k] = MODEL.run(M, LM.scen[k].params, 0).rows; });
  var SC_NAME = { c: 'осторожный', w: 'рабочий', s: 'сильный' };
  var SC_IN = { c: 'осторожном', w: 'рабочем', s: 'сильном' };
  var SC_COLOR = { c: 'var(--sc-c)', w: 'var(--sc-w)', s: 'var(--sc-s)' };
  var calcRows = null, calcPayback = null;

  /* ---------- SVG ---------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, anchor) {
    var t = el('text', { x: (+x).toFixed(1), y: (+y).toFixed(1), 'class': cls || 'lbl' }, parent);
    if (anchor) t.setAttribute('text-anchor', anchor);
    t.textContent = s;
    return t;
  }
  function plate(parent, node, px, py) {
    try {
      var b = node.getBBox();
      if (!b.width) return;
      parent.insertBefore(el('rect', {
        x: (b.x - px).toFixed(1), y: (b.y - py).toFixed(1),
        width: (b.width + 2 * px).toFixed(1), height: (b.height + 2 * py).toFixed(1), rx: 3, 'class': 'plate'
      }), node);
    } catch (e) { /* без подложки тоже читается */ }
  }
  function lin(d0, d1, r0, r1) { var k = (r1 - r0) / (d1 - d0); return function (v) { return r0 + (v - d0) * k; }; }
  function logS(d0, d1, r0, r1) {
    var l0 = Math.log(d0), k = (r1 - r0) / (Math.log(d1) - l0);
    return function (v) { return r0 + (Math.log(Math.max(v, d0 * 0.5)) - l0) * k; };
  }
  function px(v) { return Math.round(v) + 0.5; }
  function swatch(color) { return '<i style="background:' + color + '"></i>'; }
  function row(color, s) { return '<div class="tr">' + swatch(color) + '<span>' + s + '</span></div>'; }

  /* ---------- общий каркас графика: размер, подсказка, мышь, клавиатура ---------- */
  var hosts = [];
  function chart(plot, o) {
    var st = { plot: plot, o: o, w: 0, h: 0, items: [], cur: -1 };
    st.svg = el('svg', { 'aria-hidden': 'true', focusable: 'false' });
    plot.appendChild(st.svg);
    st.tip = document.createElement('div');
    st.tip.className = 'tip';
    st.tip.setAttribute('aria-hidden', 'true');
    plot.appendChild(st.tip);

    st.render = function () {
      var w = Math.round(plot.clientWidth);
      if (!w) return;
      st.w = w;
      st.h = o.height(w);
      var svg = st.svg;
      svg.setAttribute('width', w);
      svg.setAttribute('height', st.h);
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + st.h);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      st.items = [];
      st.cur = -1;
      st.tip.classList.remove('on');
      o.draw(st, svg);
      st.hl = el('g', null, svg);
    };

    function show(i) {
      if (i === st.cur) return;
      st.cur = i;
      if (st.hl) while (st.hl.firstChild) st.hl.removeChild(st.hl.firstChild);
      if (i < 0 || !st.items[i]) { st.tip.classList.remove('on'); return; }
      var it = st.items[i];
      if (o.mark) o.mark(st, it, st.hl);
      st.tip.innerHTML = o.tip(st, it);
      st.tip.classList.add('on');
      var tw = st.tip.offsetWidth, th = st.tip.offsetHeight;
      var ax = it.ax, ay = it.ay !== undefined ? it.ay : st.h / 2;
      var x = ax + 14;
      if (x + tw > st.w) x = ax - 14 - tw;
      if (x < 0) x = Math.max(0, Math.min(st.w - tw, ax - tw / 2));
      var y = ay - th - 12;
      if (y < -4) y = ay + 16;
      if (y + th > st.h + 24) y = Math.max(-4, st.h + 24 - th);
      st.tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }
    st.show = show;

    function local(ev) {
      var r = st.svg.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    function onPoint(ev) {
      if (!st.items.length) return;
      var p = local(ev);
      show(o.pick(st, p.x, p.y));
    }
    plot.addEventListener('pointermove', onPoint);
    plot.addEventListener('pointerdown', onPoint);
    plot.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') show(-1); });
    document.addEventListener('pointerdown', function (ev) { if (st.cur >= 0 && !plot.contains(ev.target)) show(-1); });
    plot.addEventListener('keydown', function (ev) {
      var n = st.items.length;
      if (!n) return;
      var k = ev.key, i = st.cur;
      if (k === 'ArrowRight') i = i < 0 ? 0 : Math.min(n - 1, i + 1);
      else if (k === 'ArrowLeft') i = i < 0 ? n - 1 : Math.max(0, i - 1);
      else if (k === 'Home') i = 0;
      else if (k === 'End') i = n - 1;
      else if (k === 'Escape') i = -1;
      else return;
      ev.preventDefault();
      show(i);
    });
    plot.addEventListener('blur', function () { show(-1); });

    var lastW = -1, raf = 0;
    function check() {
      raf = 0;
      var w = Math.round(plot.clientWidth);
      if (w && w !== lastW) { lastW = w; st.render(); }
    }
    function req() { if (!raf) raf = requestAnimationFrame(check); }
    if ('ResizeObserver' in window) new ResizeObserver(req).observe(plot);
    else window.addEventListener('resize', req);
    listen(mqSmall, function () { st.render(); });
    lastW = Math.round(plot.clientWidth);
    st.render();
    hosts.push(st);
    return st;
  }

  function pickNearest(st, x, y, maxD) {
    var best = -1, bd = maxD * maxD;
    for (var i = 0; i < st.items.length; i++) {
      var p = st.items[i], dx = p.ax - x, dy = p.ay - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function pickX(st, x) {
    if (x < st.x0 - 24 || x > st.x1 + 24) return -1;
    var best = -1, bd = 1e9;
    for (var i = 0; i < st.items.length; i++) {
      var d = Math.abs(st.items[i].ax - x);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function markDot(st, it, g) {
    el('circle', { cx: it.ax.toFixed(1), cy: it.ay.toFixed(1), r: st.r + 2.5, 'class': it.cls + ' on' }, g);
  }
  function markCross(st, it, g) {
    el('line', { x1: px(it.ax), x2: px(it.ax), y1: st.top, y2: st.bot, 'class': 'cross' }, g);
    it.pts.forEach(function (p) { el('circle', { cx: it.ax.toFixed(1), cy: p.y.toFixed(1), r: 4.5, 'class': 'pt ' + p.cls }, g); });
  }
  function linePath(X, Y, vals, from0) {
    var d = from0 ? 'M' + X(0).toFixed(1) + ',' + Y(0).toFixed(1) : '';
    for (var i = 0; i < vals.length; i++) d += (d ? 'L' : 'M') + X(vals[i][0]).toFixed(1) + ',' + Y(vals[i][1]).toFixed(1);
    return d;
  }
  function topRound(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return 'M' + x.toFixed(1) + ',' + (y + h).toFixed(1) + 'V' + (y + r).toFixed(1) +
      'A' + r + ',' + r + ' 0 0 1 ' + (x + r).toFixed(1) + ',' + y.toFixed(1) +
      'H' + (x + w - r).toFixed(1) +
      'A' + r + ',' + r + ' 0 0 1 ' + (x + w).toFixed(1) + ',' + (y + r).toFixed(1) +
      'V' + (y + h).toFixed(1) + 'Z';
  }

  /* ---------- 1. Возраст канала и доход: точки, шкала дохода логарифмическая ---------- */
  function drawScatter(st, svg) {
    var w = st.w, h = st.h, narrow = w < 700;
    var m = { l: 66, r: 14, t: 18, b: 46 };
    var X = lin(0, 18, m.l, w - m.r), Y = logS(300, 50000, h - m.b, m.t);
    el('rect', { x: X(0).toFixed(1), y: Y(50000).toFixed(1), width: (X(6) - X(0)).toFixed(1), height: (Y(1000) - Y(50000)).toFixed(1), 'class': 'quad' }, svg);
    var g = el('g', { 'class': 'grid' }, svg), gt = el('g', null, svg);
    [300, 1000, 3000, 10000, 30000].forEach(function (v) {
      var y = px(Y(v));
      if (v !== 1000 && v !== 300) el('line', { x1: m.l, x2: w - m.r, y1: y, y2: y }, g);
      txt(gt, m.l - 8, y + 4, usd(v), 'tick', 'end');
    });
    for (var a = 0; a <= 18; a += 3) {
      var x = px(X(a));
      if (a !== 0 && a !== 6) el('line', { x1: x, x2: x, y1: m.t, y2: h - m.b }, g);
      txt(gt, x, h - m.b + 18, String(a), 'tick', 'middle');
    }
    txt(gt, w - m.r, h - 5, 'возраст канала, месяцев', 'tick', 'end');
    var ax = el('g', { 'class': 'axis' }, svg);
    el('line', { x1: m.l, x2: w - m.r, y1: px(h - m.b), y2: px(h - m.b) }, ax);
    el('line', { x1: px(X(6)), x2: px(X(6)), y1: m.t, y2: h - m.b, 'class': 'ref' }, svg);
    el('line', { x1: m.l, x2: w - m.r, y1: px(Y(1000)), y2: px(Y(1000)), 'class': 'ref' }, svg);

    var r = narrow ? 3.5 : 4, gd = el('g', null, svg);
    var pts = LM.ch.map(function (c) {
      var inq = c[0] <= 6 && c[1] >= 1000;
      return { a: c[0], v: c[1], n: c[2], ax: X(c[0]), ay: Y(c[1]), cls: inq ? 'dot in' : 'dot' };
    }).sort(function (p, q) { return p.a - q.a || p.v - q.v; });
    pts.forEach(function (p) { el('circle', { cx: p.ax.toFixed(1), cy: p.ay.toFixed(1), r: r, 'class': p.cls }, gd); });
    st.items = pts;
    st.r = r;

    if (!narrow) {
      var ga = el('g', null, svg), xr = w - m.r - 12, y0 = m.t + 26;
      txt(ga, xr, y0, LM.stats.nx_1k_lt6 + ' из ' + LM.stats.nx_1k, 'lbl-big', 'end');
      txt(ga, xr, y0 + 20, 'каналов от 1' + NB + '000' + NB + '$ в месяц', 'lbl', 'end');
      txt(ga, xr, y0 + 37, 'моложе 6' + NB + 'месяцев', 'lbl', 'end');
      plate(svg, ga, 8, 6);
    }
  }
  function tipScatter(st, it) {
    return '<b>' + esc(it.n) + '</b><div class="tm">возраст ' + monthsTxt(it.a) + ' · ' + usd(it.v) + ' в месяц</div>';
  }

  /* ---------- 2. Ставка за 1 000 просмотров: рой точек ---------- */
  function drawSwarm(st, svg) {
    var w = st.w, h = st.h, narrow = w < 700;
    var m = { l: 16, r: 16, t: 34, b: 42 };
    var X = lin(0, 16, m.l, w - m.r);
    var r = narrow ? 4.5 : 5, d = 2 * r + 1.5;
    var cy = m.t + (h - m.t - m.b) / 2;
    var g = el('g', { 'class': 'grid' }, svg), gt = el('g', null, svg);
    for (var v = 0; v <= 16; v += 2) {
      var x = px(X(v));
      el('line', { x1: x, x2: x, y1: m.t, y2: h - m.b }, g);
      txt(gt, x, h - m.b + 18, v + NB + '$', 'tick', 'middle');
    }
    txt(gt, w - m.r, h - 4, 'за 1' + NB + '000 просмотров', 'tick', 'end');
    var ax = el('g', { 'class': 'axis' }, svg);
    el('line', { x1: m.l, x2: w - m.r, y1: px(h - m.b), y2: px(h - m.b) }, ax);

    var med = LM.stats.cs_med_rpm, mod = LM.scen.w.params.RPM;
    el('line', { x1: px(X(med)), x2: px(X(med)), y1: m.t - 8, y2: h - m.b, 'class': 'ref' }, svg);
    el('line', { x1: px(X(mod)), x2: px(X(mod)), y1: m.t - 8, y2: h - m.b, 'class': 'ref-model' }, svg);

    var pts = LM.cases.map(function (c) { return { n: c.n, p: c.p, v: c.r, a: c.a, ax: X(c.p), cls: 'dot in' }; })
      .sort(function (a, b) { return a.p - b.p; });
    var placed = [], lim = (h - m.t - m.b) / 2 - r;
    pts.forEach(function (p) {
      var best = cy;
      for (var off = 0; off <= lim + 40; off += 1) {
        var found = false;
        for (var s = -1; s <= 1; s += 2) {
          var y = cy + off * s, ok = true;
          for (var j = 0; j < placed.length; j++) {
            var q = placed[j], dx = q.ax - p.ax, dy = q.ay - y;
            if (dx * dx + dy * dy < d * d) { ok = false; break; }
          }
          if (ok) { best = y; found = true; break; }
          if (off === 0) break;
        }
        if (found) break;
      }
      p.ay = best;
      placed.push(p);
    });
    var gd = el('g', null, svg);
    pts.forEach(function (p) { el('circle', { cx: p.ax.toFixed(1), cy: p.ay.toFixed(1), r: r, 'class': p.cls }, gd); });
    var gl = el('g', null, svg);
    var t1 = txt(gl, X(mod) - 7, m.t - 14, 'в модели ' + usd(mod), 'lbl lbl-strong', 'end');
    var t2 = txt(gl, X(med) + 7, m.t - 14, 'половина выше ' + usd(med, 2), 'lbl', 'start');
    plate(gl, t1, 3, 1);
    plate(gl, t2, 3, 1);
    st.items = pts;
    st.r = r;
  }
  function tipSwarm(st, it) {
    return '<b>' + esc(it.n) + '</b><div class="tr"><span>' + usd(it.p, 2) + ' за 1' + NB + '000 просмотров</span></div>' +
      '<div class="tm">доход ' + usd(it.v) + ' в месяц, возраст ' + monthsTxt(it.a) + '</div>';
  }

  /* ---------- 3. Просмотры одного канала по типам ---------- */
  var KINDS = [['выстрелил', 'hit', 'var(--c-ads)'], ['средний', 'mid', 'var(--ink-2)'], ['не взлетел', 'miss', 'var(--muted)']];
  function kindRev(kind, t) {
    var p = LM.scen.w.params, v = M.ramp_curve[kind][t - 1];
    if (kind === 'не взлетел') return { v: v, r: 0 };
    var r = (t >= p.MON ? v * p.RPM / 1000 : 0) + (t >= p.PROD_FROM ? v * p.PROD / 1000 : 0) + (t >= p.INT_FROM ? p.INT_N * p.INT_PRICE : 0);
    return { v: v, r: r };
  }
  function drawRamp(st, svg) {
    var w = st.w, h = st.h;
    var m = { l: 74, r: 12, t: 26, b: 40 };
    var X = lin(1, 24, m.l, w - m.r), Y = lin(0, 1e6, h - m.b, m.t);
    st.x0 = m.l; st.x1 = w - m.r; st.top = m.t; st.bot = h - m.b;
    var g = el('g', { 'class': 'grid' }, svg), gt = el('g', null, svg);
    [0, 250000, 500000, 750000, 1000000].forEach(function (v) {
      var y = px(Y(v));
      el('line', { x1: m.l, x2: w - m.r, y1: y, y2: y }, g);
      txt(gt, m.l - 8, y + 4, short(v), 'tick', 'end');
    });
    [1, 6, 12, 18, 24].forEach(function (t) { txt(gt, X(t), h - m.b + 18, String(t), 'tick', 'middle'); });
    txt(gt, w - m.r, h - 4, 'месяц', 'tick', 'end');
    KINDS.forEach(function (k) {
      var arr = M.ramp_curve[k[0]].map(function (v, i) { return [i + 1, v]; });
      el('path', { d: linePath(X, Y, arr), 'class': 'ln ln-' + k[1] }, svg);
    });
    var gl = el('g', null, svg);
    KINDS.forEach(function (k) {
      var v = M.ramp_curve[k[0]][23];
      var t = txt(gl, w - m.r, Y(v) - 8, k[0], k[1] === 'hit' ? 'lbl lbl-strong' : 'lbl', 'end');
      plate(gl, t, 3, 1);
    });
    for (var t = 1; t <= 24; t++) {
      st.items.push({
        t: t, ax: X(t), ay: Y(M.ramp_curve['выстрелил'][t - 1]),
        pts: KINDS.map(function (k) { return { y: Y(M.ramp_curve[k[0]][t - 1]), cls: 'pt-' + k[1] }; })
      });
    }
  }
  function tipRamp(st, it) {
    var s = '<b>Месяц ' + it.t + ', один канал</b><div class="tm">просмотры · доход в месяц</div>';
    KINDS.forEach(function (k) {
      var x = kindRev(k[0], it.t);
      s += row(k[2], k[0] + ' · ' + fmt(x.v) + ' · ' + usd(x.r));
    });
    return s;
  }

  /* ---------- 4. Выручка сети по месяцам, столбики ---------- */
  var barsKey = 'w';
  function drawBars(st, svg) {
    var w = st.w, h = st.h, narrow = w < 640;
    var m = { l: 66, r: 10, t: 16, b: 54 };
    var rows = MODEL.run(M, LM.scen[barsKey].params, 0).rows.slice(0, 36);
    var X0 = m.l, PW = w - m.l - m.r, bw = PW / 36, bot = h - m.b;
    var Y = lin(0, 50000, bot, m.t);
    st.x0 = X0; st.x1 = w - m.r; st.top = m.t; st.bot = bot; st.bw = bw;
    var g = el('g', { 'class': 'grid' }, svg), gt = el('g', null, svg);
    for (var v = 0; v <= 50000; v += 10000) {
      var y = px(Y(v));
      if (v) el('line', { x1: m.l, x2: w - m.r, y1: y, y2: y }, g);
      txt(gt, m.l - 8, y + 4, usd(v), 'tick', 'end');
    }
    [12, 24].forEach(function (mm) {
      var x = px(X0 + mm * bw);
      el('line', { x1: x, x2: x, y1: m.t, y2: bot + 36, 'class': 'yr' }, svg);
    });
    ['1-й год', '2-й год', '3-й год'].forEach(function (s, i) { txt(gt, X0 + (6 + 12 * i) * bw, h - 6, s, 'lbl', 'middle'); });
    (narrow ? [1, 12, 24, 36] : [1, 6, 12, 18, 24, 30, 36]).forEach(function (t) { txt(gt, X0 + (t - 0.5) * bw, bot + 17, String(t), 'tick', 'middle'); });

    var gap = Math.max(2, Math.min(8, bw * 0.28)), bwid = Math.max(1, bw - gap);
    var gb = el('g', null, svg);
    rows.forEach(function (r, i) {
      var x = X0 + i * bw + gap / 2;
      var segs = [['ads', r.ads], ['prod', r.prod], ['int', r.integ]].filter(function (s) { return s[1] > 0.5; });
      var cum = 0;
      segs.forEach(function (s, j) {
        var yTop = Y(cum + s[1]), yBot = Y(cum);
        if (j > 0) yBot -= 2;
        cum += s[1];
        var hh = yBot - yTop;
        if (hh < 0.8) return;
        if (j === segs.length - 1) el('path', { d: topRound(x, yTop, bwid, hh, 4), 'class': 'seg-' + s[0] }, gb);
        else el('rect', { x: x.toFixed(1), y: yTop.toFixed(1), width: bwid.toFixed(1), height: hh.toFixed(1), 'class': 'seg-' + s[0] }, gb);
      });
      st.items.push({ t: i + 1, r: r, x: x, bw: bwid, ax: x + bwid / 2, ay: Y(r.rev), top: Y(r.rev) });
    });
    var ax = el('g', { 'class': 'axis' }, svg);
    el('line', { x1: m.l, x2: w - m.r, y1: px(bot), y2: px(bot) }, ax);
  }
  function pickBars(st, x) {
    if (x < st.x0 || x > st.x1) return -1;
    return Math.max(0, Math.min(st.items.length - 1, Math.floor((x - st.x0) / st.bw)));
  }
  function markBars(st, it, g) {
    var top = Math.min(it.top, st.bot - 2);
    el('rect', { x: (it.x - 2).toFixed(1), y: (top - 2).toFixed(1), width: (it.bw + 4).toFixed(1), height: (st.bot - top + 2).toFixed(1), rx: 3, 'class': 'hov' }, g);
  }
  function tipBars(st, it) {
    var r = it.r, p = LM.scen[barsKey].params;
    var s = '<b>Месяц ' + it.t + ', выручка ' + usd(r.rev) + '</b>' +
      row('var(--c-ads)', 'реклама YouTube · ' + usd(r.ads)) +
      row('var(--c-prod)', 'мини-продукты · ' + usd(r.prod)) +
      row('var(--c-int)', 'интеграции · ' + usd(r.integ));
    if (r.ads < 0.5) s += '<div class="tm">YouTube начинает платить с ' + p.MON + '-го месяца</div>';
    return s;
  }
  function barsLabel(plot) {
    plot.setAttribute('aria-label', 'Столбики выручки сети за 36 месяцев. В ' + SC_IN[barsKey] +
      ' сценарии выручка растёт до ' + usd(RUNS[barsKey][23].rev) + ' в месяц к 24-му месяцу.');
  }

  /* ---------- 5. Ваш итог: выплачено минус вложено ---------- */
  var cumN = 36;
  function netPos(r) { return r.paid - r.invested; }
  function usdS(x) { return (x > 0.5 ? '+' : '') + usd(x); }
  function tickS(x) {
    if (Math.abs(x) < 1e6) return usdS(x);
    return (x > 0 ? '+' : MINUS) + trimNum(Math.abs(x) / 1e6) + NB + 'млн' + NB + '$';
  }
  function niceStep(span, n) {
    var raw = span / n, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), s = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < s.length; i++) if (s[i] * p >= raw - 1e-9) return s[i] * p;
    return 10 * p;
  }
  function drawCum(st, svg) {
    var w = st.w, h = st.h, narrow = w < 560, N = cumN, KS = ['c', 'w', 's'];
    var lo = 0, hi = 0;
    KS.forEach(function (k) {
      for (var t = 1; t <= N; t++) { var v = netPos(RUNS[k][t - 1]); if (v < lo) lo = v; if (v > hi) hi = v; }
    });
    var step = niceStep(hi - lo, narrow ? 4 : 6);
    var yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step;
    var m = { l: 88, r: 12, t: 20, b: 44 };
    var X = lin(0, N, m.l, w - m.r), Y = lin(yMin, yMax, h - m.b, m.t);
    st.x0 = m.l; st.x1 = w - m.r; st.top = m.t; st.bot = h - m.b;
    var g = el('g', { 'class': 'grid' }, svg), gt = el('g', null, svg);
    for (var v = yMin; v <= yMax + 1e-6; v += step) {
      var y = px(Y(v)), zero = Math.abs(v) < 1e-6;
      if (!zero && v > yMin + 1e-6) el('line', { x1: m.l, x2: w - m.r, y1: y, y2: y }, g);
      txt(gt, m.l - 8, y + 4, zero ? '0' + NB + '$' : tickS(v), 'tick', 'end');
    }
    var ax = el('g', { 'class': 'axis' }, svg), yb = px(Y(yMin));
    el('line', { x1: m.l, x2: w - m.r, y1: yb, y2: yb }, ax);
    var ticks = [];
    if (N === 120) { for (var yr = narrow ? 2 : 1; yr <= 10; yr += narrow ? 2 : 1) ticks.push([yr * 12, String(yr)]); }
    else { (narrow ? [1, 12, 24, 36] : [1, 6, 12, 18, 24, 30, 36]).forEach(function (t) { ticks.push([t, String(t)]); }); }
    ticks.forEach(function (tk) {
      var x = px(X(tk[0]));
      el('line', { x1: x, x2: x, y1: yb, y2: yb + 5 }, ax);
      txt(gt, x, yb + 19, tk[1], 'tick', 'middle');
    });
    txt(gt, w - m.r, h - 4, N === 120 ? 'год' : 'месяц', 'tick', 'end');

    var y0 = Y(0);
    el('line', { x1: m.l, x2: w - m.r, y1: y0.toFixed(1), y2: y0.toFixed(1), 'class': 'ln-inv' }, svg);
    var wpb = LM.scen.w.payback, xp = px(X(wpb));
    var lead = el('line', { x1: xp, x2: xp, y1: y0.toFixed(1), y2: y0.toFixed(1), 'class': 'ref' }, svg);
    KS.forEach(function (k) {
      var rows = RUNS[k], vals = [];
      for (var t = 1; t <= N; t++) vals.push([t, netPos(rows[t - 1])]);
      el('path', { d: linePath(X, Y, vals, true), 'class': 'ln ln-' + k }, svg);
    });
    (narrow ? ['w'] : KS).forEach(function (k) {
      var pb = LM.scen[k].payback;
      if (pb && pb <= N) el('circle', { cx: X(pb).toFixed(1), cy: y0.toFixed(1), r: 5, 'class': 'pt pt-' + k }, svg);
    });

    var lab = el('g', null, svg), boxes = [];
    function keep(t) {
      try { var b = t.getBBox(); boxes.push({ x0: b.x - 3, x1: b.x + b.width + 3, y0: b.y - 1, y1: b.y + b.height + 1 }); } catch (e) { /* без замера */ }
    }
    ['s', 'w', 'c'].forEach(function (k) {
      var val = netPos(RUNS[k][N - 1]);
      var t = txt(lab, w - m.r - 2, Y(val) - 9, SC_NAME[k] + ' · ' + usdS(val), k === 'w' ? 'lbl lbl-strong' : 'lbl', 'end');
      plate(lab, t, 3, 1);
      keep(t);
    });

    // подпись возврата: рядом с точкой, там, где её не пересекает ни одна линия и ни одна другая подпись
    var pbT = txt(lab, xp, y0, narrow ? 'возврат, ' + wpb + '-й месяц' : 'вложенное вернулось, ' + wpb + '-й месяц', 'lbl lbl-strong', 'end');
    var bw = 0;
    try { bw = pbT.getBBox().width; } catch (e) { bw = 7 * pbT.textContent.length; }
    function monthAt(x) { return (x - m.l) / (w - m.l - m.r) * N; }
    function free(x0, x1, ybase) {
      var top = ybase - 15, bot = ybase + 6;
      if (x0 < m.l + 2 || x1 > w - m.r || top < m.t - 8 || bot > h - m.b - 2) return false;
      var t0 = Math.max(1, Math.floor(monthAt(x0))), t1 = Math.min(N, Math.ceil(monthAt(x1)));
      for (var t = t0; t <= t1; t++) {
        for (var i = 0; i < KS.length; i++) {
          var yy = Y(netPos(RUNS[KS[i]][t - 1]));
          if (yy > top - 2 && yy < bot + 2) return false;
        }
      }
      return boxes.every(function (b) { return b.x1 < x0 || b.x0 > x1 || b.y1 < top || b.y0 > bot; });
    }
    var spot = null, gap = 8;
    for (var dy = 26; !spot && dy < h; dy += 4) {
      [y0 - dy, y0 + dy + 12].forEach(function (yy) {
        if (spot) return;
        if (free(xp - gap - bw - 3, xp - gap + 3, yy)) spot = { x: xp - gap, y: yy, a: 'end' };
        else if (free(xp + gap - 3, xp + gap + bw + 3, yy)) spot = { x: xp + gap, y: yy, a: 'start' };
      });
    }
    if (!spot) spot = { x: xp + gap, y: m.t + 14, a: 'start' };
    pbT.setAttribute('x', spot.x.toFixed(1));
    pbT.setAttribute('y', spot.y.toFixed(1));
    pbT.setAttribute('text-anchor', spot.a);
    plate(lab, pbT, 3, 1);
    lead.setAttribute('y1', (spot.y < y0 ? spot.y - 4 : spot.y - 14).toFixed(1));

    for (var t = 1; t <= N; t++) {
      var hiY = Math.min.apply(null, KS.map(function (k) { return Y(netPos(RUNS[k][t - 1])); }));
      st.items.push({
        t: t, ax: X(t), ay: hiY,
        pts: ['s', 'w', 'c'].map(function (k) { return { y: Y(netPos(RUNS[k][t - 1])), cls: 'pt-' + k }; })
      });
    }
  }
  function tipCum(st, it) {
    var s = '<b>Месяц ' + it.t + (cumN === 120 && it.t > 12 ? ', ' + Math.ceil(it.t / 12) + '-й год' : '') + '</b>';
    ['s', 'w', 'c'].forEach(function (k) { s += row(SC_COLOR[k], SC_NAME[k] + ' · ' + usdS(netPos(RUNS[k][it.t - 1]))); });
    var r = RUNS.w[it.t - 1];
    return s + '<div class="tm">рабочий: выплачено ' + usd(r.paid) + ', вложено ' + usd(r.invested) + '</div>';
  }

  /* ---------- 6. Мини-график калькулятора ---------- */
  function drawSpark(st, svg) {
    var w = st.w, h = st.h;
    var m = { l: 4, r: 4, t: 18, b: 22 };
    var me = calcRows || RUNS.w, ref = RUNS.w, lo = 0, hi = 0;
    for (var i = 0; i < 120; i++) {
      lo = Math.min(lo, netPos(me[i]), netPos(ref[i]));
      hi = Math.max(hi, netPos(me[i]), netPos(ref[i]));
    }
    var top = niceCeil(Math.max(hi, 1000)), bottom = lo < 0 ? -niceCeil(-lo) : 0;
    var X = lin(0, 120, m.l, w - m.r), Y = lin(bottom, top, h - m.b, m.t);
    st.x0 = m.l; st.x1 = w - m.r; st.top = m.t; st.bot = h - m.b;
    var g = el('g', { 'class': 'grid' }, svg), gt = el('g', null, svg);
    el('line', { x1: m.l, x2: w - m.r, y1: px(Y(top)), y2: px(Y(top)) }, g);
    txt(gt, m.l, Y(top) - 6, usdS(top), 'tick', 'start');
    var ax = el('g', { 'class': 'axis' }, svg);
    el('line', { x1: m.l, x2: w - m.r, y1: px(Y(bottom)), y2: px(Y(bottom)) }, ax);
    txt(gt, m.l, h - 5, 'старт', 'tick', 'start');
    txt(gt, X(60), h - 5, '5' + NB + 'лет', 'tick', 'middle');
    txt(gt, w - m.r, h - 5, '10' + NB + 'лет', 'tick', 'end');
    el('line', { x1: m.l, x2: w - m.r, y1: Y(0).toFixed(1), y2: Y(0).toFixed(1), 'class': 'ln-inv' }, svg);
    function series(rows) { var v = []; for (var t = 1; t <= 120; t++) v.push([t, netPos(rows[t - 1])]); return v; }
    el('path', { d: linePath(X, Y, series(ref), true), 'class': 'ln ln-ref' }, svg);
    el('path', { d: linePath(X, Y, series(me), true), 'class': 'ln ln-w' }, svg);
    var pb = calcRows ? calcPayback : LM.scen.w.payback;
    if (pb) el('circle', { cx: X(pb).toFixed(1), cy: Y(0).toFixed(1), r: 4.5, 'class': 'pt pt-w' }, svg);
    for (var t = 1; t <= 120; t++) {
      var a = netPos(me[t - 1]), b = netPos(ref[t - 1]);
      st.items.push({
        t: t, ax: X(t), ay: Y(Math.max(a, b)),
        pts: [{ y: Y(a), cls: 'pt-w' }, { y: Y(b), cls: 'pt-miss' }]
      });
    }
  }
  function tipSpark(st, it) {
    var me = calcRows || RUNS.w;
    return '<b>Месяц ' + it.t + '</b>' +
      row('var(--sc-w)', 'ваш расчёт · ' + usdS(netPos(me[it.t - 1]))) +
      row('var(--muted)', 'рабочий · ' + usdS(netPos(RUNS.w[it.t - 1])));
  }

  var DEFS = {
    scatter: { height: function () { return small() ? 320 : 400; }, draw: drawScatter, pick: function (st, x, y) { return pickNearest(st, x, y, 30); }, mark: markDot, tip: tipScatter },
    swarm: { height: function () { return small() ? 220 : 190; }, draw: drawSwarm, pick: function (st, x, y) { return pickNearest(st, x, y, 26); }, mark: markDot, tip: tipSwarm },
    ramp: { height: function () { return small() ? 290 : 320; }, draw: drawRamp, pick: pickX, mark: markCross, tip: tipRamp },
    bars: { height: function () { return small() ? 290 : 360; }, draw: drawBars, pick: pickBars, mark: markBars, tip: tipBars },
    cum: { height: function () { return small() ? 330 : 400; }, draw: drawCum, pick: pickX, mark: markCross, tip: tipCum },
    spark: { height: function () { return 150; }, draw: drawSpark, pick: pickX, mark: markCross, tip: tipSpark },
    dash: { height: function () { return small() ? 240 : 300; }, draw: drawDash, pick: pickBars, mark: markBars, tip: tipDash }
  };
  var charts = {};
  function chartsInit() {
    each($$('.plot[data-chart]'), function (plot) {
      var kind = plot.getAttribute('data-chart');
      if (DEFS[kind]) charts[kind] = safe(function () { return chart(plot, DEFS[kind]); });
    });
    var bb = $$('[data-bars]');
    each(bb, function (b) {
      b.addEventListener('click', function () {
        barsKey = b.getAttribute('data-bars');
        each(bb, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        if (charts.bars) { charts.bars.render(); barsLabel(charts.bars.plot); }
      });
    });
    var cb = $$('[data-cum]');
    each(cb, function (b) {
      b.addEventListener('click', function () {
        cumN = +b.getAttribute('data-cum');
        each(cb, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        if (charts.cum) charts.cum.render();
      });
    });
  }

  /* ---------- ползунки: заливка дорожки ---------- */
  function setP(inp) {
    var mn = +inp.min || 0, mx = +inp.max, v = +inp.value;
    var p = mx > mn ? (v - mn) / (mx - mn) * 100 : 0;
    inp.style.setProperty('--p', p.toFixed(2) + '%');
  }

  /* ---------- калькулятор ---------- */
  function calcInit() {
    var hits = $('#k-hits');
    if (!hits) return;
    var mids = $('#k-mids'), rpm = $('#k-rpm'), prod = $('#k-prod'), integ = $('#k-int'), delay = $('#k-delay');
    var all = [hits, mids, rpm, prod, integ, delay];
    var base = LM.scen.w.params;
    function o(k) { return $('[data-o="' + k + '"]'); }
    function res(k) { return $('[data-k="' + k + '"]'); }
    function update() {
      var h = +hits.value, maxM = 10 - h;
      if (+mids.max !== maxM) mids.max = String(maxM);
      if (+mids.value > maxM) mids.value = String(maxM);
      var md = +mids.value;
      var s = {
        mix: { 'выстрелил': h, 'средний': md, 'не взлетел': 10 - h - md },
        RPM: +rpm.value, MON: base.MON, PROD: +prod.value, PROD_FROM: base.PROD_FROM,
        INT_N: +integ.value, INT_PRICE: base.INT_PRICE, INT_FROM: base.INT_FROM
      };
      var r = MODEL.run(M, s, +delay.value);
      calcRows = r.rows;
      calcPayback = r.payback;
      o('hits').textContent = chanTxt(h);
      o('mids').textContent = chanTxt(md);
      o('rpm').textContent = trimNum(+rpm.value) + NB + '$';
      o('prod').textContent = trimNum(+prod.value) + NB + '$';
      o('int').textContent = String(+integ.value);
      o('delay').textContent = String(+delay.value);
      res('invested').textContent = usd(r.invested);
      res('payback').textContent = r.payback ? 'на ' + r.payback + '-м месяце' : 'за 10 лет не вернётся';
      res('p60').textContent = usd(r.rows[59].paid);
      res('p120').textContent = usd(r.rows[119].paid);
      res('rev24').textContent = usd(r.rows[23].rev);
      all.forEach(setP);
      if (charts.spark) charts.spark.render();
    }
    all.forEach(function (inp) { inp.addEventListener('input', update); });
    var reset = $('#k-reset');
    if (reset) reset.addEventListener('click', function () {
      hits.value = base.mix['выстрелил'];
      mids.max = String(10 - base.mix['выстрелил']);
      mids.value = base.mix['средний'];
      rpm.value = base.RPM;
      prod.value = base.PROD;
      integ.value = base.INT_N;
      delay.value = 0;
      update();
    });
    update();
  }

  /* ---------- печать чека: HTML-in-Canvas, если браузер умеет, иначе CSS ---------- */
  var HIC = (function () {
    try {
      if (typeof CanvasRenderingContext2D === 'undefined') return false;
      if (!('drawElementImage' in CanvasRenderingContext2D.prototype)) return false;
      var c = document.createElement('canvas');
      return 'requestPaint' in c;
    } catch (e) { return false; }
  })();
  function printCSS(paper) {
    paper.classList.remove('printing');
    void paper.offsetWidth;
    paper.classList.add('printing');
  }
  function printHiC(paper, stage, onDone) {
    var cv = null, done = false, painted = false, t0 = 0, timers = [];
    function finish(fallback) {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
      paper.style.visibility = '';
      if (fallback) printCSS(paper);
      if (onDone) onDone();
    }
    try {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var pw = paper.offsetWidth, ph = paper.offsetHeight, pad = 24, extra = 14;
      var cw = pw + pad * 2, chh = ph + extra;
      cv = document.createElement('canvas');
      cv.className = 'hic';
      cv.setAttribute('aria-hidden', 'true');
      cv.setAttribute('layoutsubtree', '');
      cv.style.left = (paper.offsetLeft - pad) + 'px';
      cv.style.top = paper.offsetTop + 'px';
      cv.style.width = cw + 'px';
      cv.style.height = chh + 'px';
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(chh * dpr);
      var clone = paper.cloneNode(true);
      clone.removeAttribute('id');
      clone.classList.remove('printing');
      clone.style.width = pw + 'px';
      clone.style.margin = '0';
      clone.style.boxShadow = 'none';
      cv.appendChild(clone);
      stage.appendChild(cv);
      var ctx = cv.getContext('2d');
      var DUR = 900, STRIP = 22, n = Math.ceil(ph / STRIP);
      cv.addEventListener('paint', function () {
        if (done) return;
        try {
          var now = performance.now();
          if (!painted) { painted = true; t0 = now; paper.style.visibility = 'hidden'; }
          var k = Math.min(1, (now - t0) / DUR);
          if (ctx.reset) ctx.reset(); else ctx.clearRect(0, 0, cv.width, cv.height);
          var shown = Math.min(n, Math.ceil(k * n));
          for (var i = 0; i < shown; i++) {
            var life = Math.max(0, 1 - (k * n - i) / 4);
            var off = Math.sin(i * 2.1 + now / 35) * 5 * life;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, i * STRIP * dpr, cv.width, STRIP * dpr + 1);
            ctx.clip();
            ctx.drawElementImage(clone, (pad + off) * dpr, 0, pw * dpr, ph * dpr);
            ctx.restore();
          }
          if (k >= 1) finish(false); else cv.requestPaint();
        } catch (e) { finish(true); }
      });
      cv.requestPaint();
      timers.push(setTimeout(function () { if (!painted) finish(true); }, 150));
      timers.push(setTimeout(function () { finish(false); }, 1600));
    } catch (e) {
      finish(true);
    }
    return { cancel: function () { finish(false); } };
  }

  /* ---------- чек за любой месяц ---------- */
  function receiptInit() {
    var range = $('#rc-month'), paper = $('#paper');
    if (!range || !paper) return;
    var outEl = $('#rc-out'), live = $('#rc-live'), stage = paper.parentNode;
    var presets = $$('.rc-presets [data-m]');
    var W = RUNS.w, cells = {};
    ['month', 'views', 'ads', 'prod', 'int', 'rev', 'cut', 'net', 'top', 'team', 'over', 'ret', 'share',
      'founders', 'fund', 'pay', 'paid', 'invested', 'left'].forEach(function (k) {
      cells[k] = paper.querySelector('[data-r="' + k + '"]');
    });
    function set(k, v) { if (cells[k]) cells[k].textContent = v; }
    function back(r) { return r.paid >= r.invested - 0.5; }
    function fill(t) {
      var r = W[t - 1];
      set('month', String(t));
      set('views', fmt(r.views));
      set('ads', usd(r.ads));
      set('prod', usd(r.prod));
      set('int', usd(r.integ));
      set('rev', usd(r.rev));
      set('cut', usd(-r.rev * M.haircut));
      set('net', usd(r.net));
      set('top', r.course ? usd(r.top) + ' с обучением' : usd(r.top));
      set('team', usd(-r.team));
      set('over', usd(r.over));
      set('ret', usd(r.ret));
      set('share', usd(r.share));
      set('founders', 'по' + NB + usd(r.artur));
      set('fund', usd(r.fund_m));
      set('pay', usd(r.pay));
      set('paid', usd(r.paid));
      set('invested', usd(r.invested));
      set('left', back(r) ? 'вложенное вернулось' : usd(r.invested - r.paid));
    }
    function sync(t) {
      if (outEl) outEl.textContent = String(t);
      setP(range);
      each(presets, function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-m') === t)); });
    }
    function say(t) {
      var r = W[t - 1];
      if (live) live.textContent = 'Месяц ' + t + '. Выплата вам ' + usd(r.pay) + ', всего выплачено ' + usd(r.paid) +
        (back(r) ? ', вложенное вернулось.' : '.');
    }
    var fx = null;
    function printFx() {
      if (rm()) return;
      if (fx) { fx.cancel(); fx = null; }
      if (HIC) fx = printHiC(paper, stage, function () { fx = null; });
      else printCSS(paper);
    }
    paper.addEventListener('animationend', function (e) { if (e.animationName === 'print') paper.classList.remove('printing'); });
    range.addEventListener('input', function () { var t = +range.value; fill(t); sync(t); });
    range.addEventListener('change', function () { var t = +range.value; say(t); printFx(); });
    each(presets, function (b) {
      b.addEventListener('click', function () {
        var t = +b.getAttribute('data-m');
        range.value = String(t);
        fill(t); sync(t); say(t); printFx();
      });
    });
    var t0 = +range.value;
    if (cells.month && cells.month.textContent !== String(t0)) fill(t0);
    sync(t0);
  }

  /* ---------- пульт: дни, недели и месяцы на цифрах модели ---------- */
  var DASH = null;
  var DASH_KIND = ['выстрелил', 'средний', 'не взлетел'];
  var DASH_SRC = ['ads', 'prod', 'int'];
  var DASH_SRC_NAME = { ads: 'реклама YouTube', prod: 'мини-продукты', int: 'интеграции' };
  var DASH_SRC_COLOR = { ads: 'var(--c-ads)', prod: 'var(--c-prod)', int: 'var(--c-int)' };
  function dashDays() {
    var T = 14, W = RUNS.w;
    var kinds = [0, 1, 2, 0, 1, 2, 0, 1, 2, 2], fac = [[1.15, 1, 0.85], [1.2, 1, 0.8], []], seen = [0, 0, 0];
    var chans = kinds.map(function (k, i) {
      var f = fac[k][seen[k]++] || 1;
      return { name: 'Канал ' + (i < 9 ? '0' : '') + (i + 1), kind: k, f: f };
    });
    var active = chans.filter(function (c) { return c.kind < 2; }).length;
    var days = [];
    for (var m = 1; m <= T; m++) {
      var r = W[m - 1], prevV = m > 1 ? W[m - 2].views : r.views, nextV = W[m].views;
      var tilt = r.views > 0 ? Math.max(-0.3, Math.min(0.3, (nextV - prevV) / (2 * r.views))) : 0;
      var ws = [], sum = 0, d;
      for (d = 0; d < 30; d++) {
        var x = 1 + 0.07 * Math.sin(1.3 * d + 0.7 * m) + 0.05 * Math.sin(0.45 * d + 1.9 * m) + (d % 7 >= 5 ? 0.06 : 0) + tilt * (d - 14.5) / 30;
        ws.push(x);
        sum += x;
      }
      var share = chans.map(function (c) {
        var v = c.kind < 2 ? MODEL.viewsAt(M.ramp, DASH_KIND[c.kind], m) * c.f : 0;
        return r.views > 0 ? v / r.views : 0;
      });
      for (d = 0; d < 30; d++) {
        var k = ws[d] / sum, integ = (d === 9 || d === 24) ? r.integ / 2 : 0;
        var rev = (r.ads + r.prod) * k + integ;
        days.push({
          m: m, d: d + 1, views: r.views * k, ads: r.ads * k, prod: r.prod * k, int: integ,
          pay: r.rev > 0 ? r.pay * rev / r.rev : 0, share: share
        });
      }
    }
    return { days: days, chans: chans, active: active };
  }
  function dashInit() {
    var root = $('#dash');
    if (!root) return;
    var base = dashDays(), days = base.days, chans = base.chans, N = days.length;
    var LEN = { '7': 7, '30': 30, q: 91, y: 360 };
    var PREV = { '7': 'к прошлым 7 дням', '30': 'к прошлым 30 дням', q: 'к прошлому кварталу' };
    var TITLE = { '7': 'Выручка по дням', '30': 'Выручка по дням', q: 'Выручка по неделям', y: 'Выручка по месяцам' };
    var st = { per: '30', on: { ads: true, prod: true, int: true }, key: 'rev', dir: -1 };
    function val(o) { var s = 0; DASH_SRC.forEach(function (k) { if (st.on[k]) s += o[k]; }); return s; }
    function sum(from, to) {
      var o = { ads: 0, prod: 0, int: 0, views: 0, pay: 0, rev: 0, n: 0 };
      for (var i = Math.max(0, from); i < to; i++) {
        var d = days[i], all = d.ads + d.prod + d.int;
        o.ads += d.ads; o.prod += d.prod; o.int += d.int; o.views += d.views; o.n++;
        if (all > 0) o.pay += d.pay * val(d) / all;
      }
      o.rev = val(o);
      return o;
    }
    function bars() {
      var len = LEN[st.per], from = N - len, out = [], i, g;
      if (st.per === '7' || st.per === '30') {
        for (i = from; i < N; i++) {
          g = sum(i, i + 1);
          g.lbl = String(days[i].d);
          g.title = 'День ' + days[i].d + ', ' + days[i].m + '-й месяц';
          out.push(g);
        }
      } else {
        var size = st.per === 'q' ? 7 : 30;
        for (i = from; i < N; i += size) {
          g = sum(i, i + size);
          var no = (i - from) / size + 1;
          g.lbl = st.per === 'q' ? String(no) : String(days[i].m);
          g.title = st.per === 'q' ? 'Неделя ' + no + ' из 13' : days[i].m + '-й месяц';
          out.push(g);
        }
      }
      return out;
    }
    function setT(sel, s) { var e = root.querySelector(sel); if (e) e.textContent = s; }
    function delta(k, cur, prev) {
      var e = root.querySelector('[data-dd="' + k + '"]');
      if (!e) return;
      e.classList.remove('up', 'down');
      if (prev === null || !(prev > 0)) { e.textContent = ''; return; }
      var c = cur / prev - 1, p = Math.round(Math.abs(c) * 100);
      e.textContent = (c >= 0 ? '+' : MINUS) + p + '% ' + PREV[st.per];
      if (p > 0) e.classList.add(c > 0 ? 'up' : 'down');
    }
    function tiles() {
      var len = LEN[st.per], cur = sum(N - len, N), hasPrev = N - 2 * len >= 0;
      var prev = hasPrev ? sum(N - 2 * len, N - len) : null;
      setT('[data-d="rev"]', usd(cur.rev));
      setT('[data-d="net"]', usd(cur.rev * (1 - M.haircut)));
      setT('[data-d="pay"]', usd(cur.pay));
      setT('[data-d="views"]', shortR(cur.views));
      setT('[data-d="vids"]', fmt(cur.n * 10));
      delta('rev', cur.rev, prev && prev.rev);
      delta('net', cur.rev, prev && prev.rev);
      delta('pay', cur.pay, prev && prev.pay);
      delta('views', cur.views, prev && prev.views);
      setT('[data-dd="vids"]', 'по 10 в день');
    }
    function table() {
      var body = $('#dash-body');
      if (!body) return;
      var len = LEN[st.per], from = N - len;
      var rows = chans.map(function (c, j) {
        var o = { name: c.name, kind: c.kind, views: 0, rev: 0 };
        for (var i = from; i < N; i++) {
          var d = days[i], s = d.share[j];
          o.views += d.views * s;
          if (st.on.ads) o.rev += d.ads * s;
          if (st.on.prod) o.rev += d.prod * s;
          if (st.on.int && c.kind < 2) o.rev += d.int / base.active;
        }
        return o;
      });
      var tot = rows.reduce(function (a, o) { return a + o.rev; }, 0);
      rows.forEach(function (o) { o.share = tot > 0 ? o.rev / tot : 0; });
      rows.sort(function (a, b) {
        var x = a[st.key], y = b[st.key], c;
        if (st.key === 'name') c = String(x).localeCompare(String(y), 'ru');
        else c = x - y;
        if (Math.abs(c) < 1e-9) c = a.name.localeCompare(b.name, 'ru') * st.dir;
        return c * st.dir;
      });
      body.innerHTML = rows.map(function (o) {
        return '<tr class="dk-' + o.kind + '"><th scope="row">' + esc(o.name) + '</th><td>' + DASH_KIND[o.kind] +
          '</td><td>' + shortR(o.views) + '</td><td>' + usd(o.rev) + '</td><td>' + fmt(o.share * 100, 1) + '%</td></tr>';
      }).join('');
      each($$('.dash-tbl thead th', root), function (th) {
        var b = th.querySelector('[data-sort]');
        var k = b && b.getAttribute('data-sort');
        th.setAttribute('aria-sort', k === st.key ? (st.dir > 0 ? 'ascending' : 'descending') : 'none');
      });
    }
    function update() {
      DASH = { bars: bars(), val: val, on: st.on, per: st.per };
      setT('#dash-title', TITLE[st.per]);
      tiles();
      table();
      if (charts.dash) {
        charts.dash.render();
        var b = DASH.bars, tot = b.reduce(function (a, g) { return a + g.rev; }, 0);
        charts.dash.plot.setAttribute('aria-label', TITLE[st.per] + '. Всего ' + usd(tot) + ' за ' + b.length + ' ' +
          (st.per === 'q' ? plural(b.length, 'неделю', 'недели', 'недель') : st.per === 'y' ? plural(b.length, 'месяц', 'месяца', 'месяцев') : plural(b.length, 'день', 'дня', 'дней')) + '.');
      }
    }
    var pb = $$('[data-per]', root);
    each(pb, function (b) {
      b.addEventListener('click', function () {
        st.per = b.getAttribute('data-per');
        each(pb, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        update();
      });
    });
    var sb = $$('[data-src]', root);
    each(sb, function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-src');
        var left = DASH_SRC.filter(function (s) { return st.on[s] && s !== k; }).length;
        if (st.on[k] && !left) return; // одно направление всегда включено
        st.on[k] = !st.on[k];
        b.setAttribute('aria-pressed', String(st.on[k]));
        update();
      });
    });
    each($$('[data-sort]', root), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (st.key === k) st.dir = -st.dir;
        else { st.key = k; st.dir = (k === 'name' || k === 'kind') ? 1 : -1; }
        table();
      });
    });
    update();
  }
  function drawDash(st, svg) {
    var D = DASH;
    if (!D || !D.bars.length) return;
    var bars = D.bars, n = bars.length, w = st.w, h = st.h;
    var m = { l: 66, r: 8, t: 14, b: 42 };
    var maxV = 0;
    bars.forEach(function (b) { maxV = Math.max(maxV, b.rev); });
    var step = niceStep(maxV || 1, small() ? 3 : 4), yMax = Math.max(step, Math.ceil(maxV / step) * step);
    var X0 = m.l, PW = w - m.l - m.r, bw = PW / n, bot = h - m.b, Y = lin(0, yMax, bot, m.t);
    st.x0 = X0; st.x1 = w - m.r; st.top = m.t; st.bot = bot; st.bw = bw;
    var g = el('g', { 'class': 'grid' }, svg), gt = el('g', null, svg);
    for (var v = 0; v <= yMax + 1e-6; v += step) {
      var y = px(Y(v));
      if (v) el('line', { x1: m.l, x2: w - m.r, y1: y, y2: y }, g);
      txt(gt, m.l - 8, y + 4, usd(v), 'tick', 'end');
    }
    var every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(PW / 30))));
    bars.forEach(function (b, i) {
      if (i % every === 0 || (i === n - 1 && (n - 1) % every > every / 2)) txt(gt, X0 + (i + 0.5) * bw, bot + 17, b.lbl, 'tick', 'middle');
    });
    txt(gt, w - m.r, h - 4, D.per === 'q' ? 'неделя' : D.per === 'y' ? 'месяц' : 'день месяца', 'tick', 'end');
    var gap = Math.max(2, Math.min(8, bw * 0.28)), bwid = Math.max(1, bw - gap);
    var gb = el('g', null, svg);
    bars.forEach(function (b, i) {
      var x = X0 + i * bw + gap / 2;
      var segs = DASH_SRC.filter(function (k) { return D.on[k] && b[k] > 0.5; });
      var cum = 0;
      segs.forEach(function (k, j) {
        var yTop = Y(cum + b[k]), yBot = Y(cum);
        if (j > 0) yBot -= 2;
        cum += b[k];
        var hh = yBot - yTop;
        if (hh < 0.8) return;
        if (j === segs.length - 1) el('path', { d: topRound(x, yTop, bwid, hh, Math.min(4, bwid / 2)), 'class': 'seg-' + k }, gb);
        else el('rect', { x: x.toFixed(1), y: yTop.toFixed(1), width: bwid.toFixed(1), height: hh.toFixed(1), 'class': 'seg-' + k }, gb);
      });
      st.items.push({ b: b, x: x, bw: bwid, ax: x + bwid / 2, ay: Y(b.rev), top: Y(b.rev) });
    });
    var ax = el('g', { 'class': 'axis' }, svg);
    el('line', { x1: m.l, x2: w - m.r, y1: px(bot), y2: px(bot) }, ax);
  }
  function tipDash(st, it) {
    var b = it.b, s = '<b>' + b.title + ', выручка ' + usd(b.rev) + '</b>';
    DASH_SRC.forEach(function (k) { if (DASH.on[k]) s += row(DASH_SRC_COLOR[k], DASH_SRC_NAME[k] + ' · ' + usd(b[k])); });
    return s + '<div class="tm">просмотров ' + shortR(b.views) + '</div>';
  }

  /* ---------- схема сети на первом экране ---------- */
  function netInit() {
    var cv = document.getElementById('net');
    if (!cv || !cv.getContext) return null;
    var ctx = cv.getContext('2d');
    if (!ctx) return null;
    var box = cv.parentNode;
    var W = 0, H = 0, dpr = 1, P = {}, running = false, raf = 0, last = 0, onScreen = true, clock = 0;
    var rot = 0.35, rot2 = 0, parts = [], acc = { v: 0, m: 0, p: 0 };
    var TAU = Math.PI * 2, TILT = -12 * Math.PI / 180, CT = Math.cos(TILT), STL = Math.sin(TILT);
    var youTxt = 'Вы · ' + pct(M.share);

    function readPalette() {
      var cs = getComputedStyle(docEl);
      ['surface', 'ink', 'ink-2', 'muted', 'line', 'c-ads', 'c-prod', 'c-int', 'c-you', 'on-orange'].forEach(function (k) {
        P[k] = cs.getPropertyValue('--' + k).trim() || '#888';
      });
    }
    function resize() {
      var r = box.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    function hub() { return { x: W * 0.5, y: H * 0.47 }; }
    function ell(rx, ry, a) {
      var c = hub(), ex = rx * Math.cos(a), ey = ry * Math.sin(a);
      return { x: c.x + ex * CT - ey * STL, y: c.y + ex * STL + ey * CT, d: (Math.sin(a) + 1) / 2 };
    }
    function chan(i) { return ell(W * 0.33, H * 0.17, rot + i * TAU / 10); }
    function reel(j) { return ell(W * 0.45, H * 0.30, rot2 + j * TAU / 30 + 0.1); }
    function you() { return { x: W * 0.8, y: H * 0.87 }; }
    function spawn(k, t) {
      var p = { k: k, t: t || 0 };
      if (k === 'v') { p.j = (Math.random() * 30) | 0; p.i = (p.j / 3) | 0; p.s = 0.5 + Math.random() * 0.35; }
      else if (k === 'm') { p.i = (Math.random() * 10) | 0; var r = Math.random(); p.c = r < 0.7 ? 'c-ads' : (r < 0.9 ? 'c-prod' : 'c-int'); p.s = 0.42 + Math.random() * 0.25; }
      else p.s = 0.33;
      parts.push(p);
    }
    function ease(t) { return t * t * (3 - 2 * t); }
    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function orbit(rx, ry) { var c = hub(); ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, TILT, 0, TAU); ctx.stroke(); }
    function drawReel(p, u) {
      var s = 0.78 + 0.32 * p.d, w = Math.max(6, 8 * u) * s, h = Math.max(10.5, 14 * u) * s;
      ctx.globalAlpha = 0.45 + 0.5 * p.d;
      rr(p.x - w / 2, p.y - h / 2, w, h, Math.max(1.5, 2 * u));
      ctx.fillStyle = P['ink-2']; ctx.fill();
      var k = w * 0.2;
      ctx.beginPath();
      ctx.moveTo(p.x - k * 0.8, p.y - k);
      ctx.lineTo(p.x + k, p.y);
      ctx.lineTo(p.x - k * 0.8, p.y + k);
      ctx.closePath();
      ctx.fillStyle = P.surface; ctx.fill();
      ctx.globalAlpha = 1;
    }
    function drawChan(p, u) {
      var s = (0.8 + 0.35 * p.d) * 30 * u;
      ctx.globalAlpha = 0.72 + 0.28 * p.d;
      rr(p.x - s / 2, p.y - s / 2, s, s, 5 * u);
      ctx.fillStyle = P.surface; ctx.fill();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.13, p.y - s * 0.2);
      ctx.lineTo(p.x + s * 0.21, p.y);
      ctx.lineTo(p.x - s * 0.13, p.y + s * 0.2);
      ctx.closePath();
      ctx.fillStyle = P['c-ads']; ctx.fill();
      ctx.globalAlpha = 1;
    }
    function drawHub(c, u) {
      var r = 38 * u;
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 7 * u, 0, TAU);
      ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.fillStyle = P.ink; ctx.fill();
      ctx.fillStyle = P.surface;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 ' + Math.max(9, 11 * u).toFixed(1) + 'px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('LETO', c.x, c.y - 7 * u);
      ctx.fillText('MEDIA', c.x, c.y + 8 * u);
    }
    function drawYou(p, u) {
      ctx.font = '650 ' + Math.max(11, 14 * u).toFixed(1) + 'px "Golos Text", system-ui, sans-serif';
      var w = ctx.measureText(youTxt).width + 26 * u, h = Math.max(24, 32 * u);
      rr(p.x - w / 2, p.y - h / 2, w, h, 4 * u);
      ctx.fillStyle = P['c-you']; ctx.fill();
      ctx.fillStyle = P['on-orange'];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(youTxt, p.x, p.y + 0.5);
    }
    function drawPart(p, ch, c, y, u) {
      var t = ease(p.t), a, b, r, col;
      if (p.k === 'v') { a = reel(p.j); b = ch[p.i]; r = 1.6 * u; col = P['ink-2']; }
      else if (p.k === 'm') { a = ch[p.i]; b = c; r = 2.4 * u; col = P[p.c]; }
      else { a = c; b = y; r = 3 * u; col = P['c-you']; }
      ctx.globalAlpha = p.k === 'v' ? 0.7 : 1;
      ctx.beginPath();
      ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, Math.max(1.2, r), 0, TAU);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    function draw() {
      if (!W || !H) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var u = W / 560, c = hub(), y = you(), i;
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      orbit(W * 0.33, H * 0.17);
      orbit(W * 0.45, H * 0.30);
      ctx.setLineDash([]);
      var ch = [];
      for (i = 0; i < 10; i++) ch.push(chan(i));
      ctx.beginPath();
      ch.forEach(function (p) { ctx.moveTo(c.x, c.y); ctx.lineTo(p.x, p.y); });
      ctx.stroke();
      ctx.save();
      ctx.strokeStyle = P['c-you'];
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -clock * 14;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(y.x, y.y); ctx.stroke();
      ctx.restore();
      for (i = 0; i < 30; i++) drawReel(reel(i), u);
      parts.forEach(function (p) { drawPart(p, ch, c, y, u); });
      ch.slice().sort(function (a, b) { return a.d - b.d; }).forEach(function (p) { drawChan(p, u); });
      drawHub(c, u);
      drawYou(y, u);
    }
    function step(dt) {
      clock += dt;
      rot += dt * 0.05;
      rot2 -= dt * 0.03;
      acc.v += dt * 14; acc.m += dt * 7; acc.p += dt * 1.5;
      while (acc.v >= 1) { acc.v -= 1; spawn('v'); }
      while (acc.m >= 1) { acc.m -= 1; spawn('m'); }
      while (acc.p >= 1) { acc.p -= 1; spawn('p'); }
      for (var i = parts.length - 1; i >= 0; i--) { parts[i].t += dt * parts[i].s; if (parts[i].t >= 1) parts.splice(i, 1); }
    }
    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || rm() || !onScreen || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    var s;
    for (s = 0; s < 42; s++) spawn('v', Math.random());
    for (s = 0; s < 20; s++) spawn('m', Math.random());
    for (s = 0; s < 4; s++) spawn('p', s / 4 + Math.random() * 0.15);
    readPalette();
    resize();
    draw();
    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); draw(); }).observe(box);
    else window.addEventListener('resize', function () { resize(); draw(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; if (onScreen) start(); else stop(); }).observe(box);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    listen(mqReduce, function () { if (rm()) { stop(); draw(); } else start(); });
    start();
    return { repaint: function () { readPalette(); draw(); } };
  }

  /* ---------- карусель кейсов ---------- */
  function casesInit() {
    var track = document.getElementById('cases');
    if (!track) return;
    var chips = $$('.chip[data-g]'), shown = document.getElementById('cases-shown');
    var arrows = $$('.cases-nav .arrow'), cards = $$('.case', track);
    function upd() {
      var max = track.scrollWidth - track.clientWidth - 2;
      each(arrows, function (a) {
        var dir = +a.getAttribute('data-dir');
        a.disabled = dir < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max;
      });
    }
    each(chips, function (chip) {
      chip.addEventListener('click', function () {
        var g = chip.getAttribute('data-g'), n = 0;
        each(cards, function (c) {
          var on = g === 'all' || c.getAttribute('data-g') === g;
          c.hidden = !on;
          if (on) n++;
        });
        each(chips, function (x) { x.setAttribute('aria-pressed', String(x === chip)); });
        if (shown) shown.textContent = String(n);
        track.scrollLeft = 0;
        upd();
      });
    });
    each(arrows, function (a) {
      a.addEventListener('click', function () {
        var first = null;
        each(cards, function (c) { if (!first && !c.hidden) first = c; });
        if (!first) return;
        var stepW = first.offsetWidth + 16;
        var per = Math.max(1, Math.floor(track.clientWidth / stepW));
        var left = (+a.getAttribute('data-dir')) * stepW * per;
        try { track.scrollBy({ left: left, behavior: rm() ? 'auto' : 'smooth' }); } catch (e) { track.scrollLeft += left; }
      });
    });
    var t = 0;
    track.addEventListener('scroll', function () { if (!t) t = requestAnimationFrame(function () { t = 0; upd(); }); }, { passive: true });
    window.addEventListener('resize', upd);
    upd();
  }

  /* ---------- навигация: якоря без смены адреса, активный раздел ---------- */
  function navInit() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var t = id ? document.getElementById(id) : null;
      e.preventDefault();
      if (!t) return;
      t.scrollIntoView({ behavior: rm() ? 'auto' : 'smooth', block: 'start' });
      if (!/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(t.tagName) && !t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
      try { t.focus({ preventScroll: true }); } catch (err) { /* старый браузер */ }
      if (/^src-/.test(id)) { t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
    });
    var nav = $('.nav'), links = {}, navLinks = $$('.nav a[data-nav]');
    each(navLinks, function (a) { links[a.getAttribute('href').slice(1)] = a; });
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        var cur = links[en.target.id || ''] || null;
        each(navLinks, function (a) { if (a === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
        if (cur && nav && nav.scrollWidth > nav.clientWidth + 4) {
          var nr = nav.getBoundingClientRect(), ar = cur.getBoundingClientRect();
          var left = nav.scrollLeft + (ar.left - nr.left) - (nav.clientWidth - ar.width) / 2;
          try { nav.scrollTo({ left: left, behavior: rm() ? 'auto' : 'smooth' }); } catch (err) { nav.scrollLeft = left; }
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    each($$('main > section'), function (s) { io.observe(s); });
  }

  /* ---------- тема ---------- */
  var net = null;
  function themeInit() {
    var btns = $$('[data-theme-set]');
    function cur() { var t = docEl.getAttribute('data-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; }
    function mark() { each(btns, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === cur())); }); }
    each(btns, function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-theme-set');
        if (v === 'auto') {
          docEl.removeAttribute('data-theme');
          try { localStorage.removeItem('lm-theme'); } catch (e) { /* хранилище закрыто */ }
        } else {
          docEl.setAttribute('data-theme', v);
          try { localStorage.setItem('lm-theme', v); } catch (e) { /* хранилище закрыто */ }
        }
        mark();
      });
    });
    mark();
    function onTheme() { if (net) net.repaint(); }
    if ('MutationObserver' in window) new MutationObserver(onTheme).observe(docEl, { attributes: true, attributeFilter: ['data-theme'] });
    listen(mqDark, onTheme);
  }

  /* ---------- появление блоков при прокрутке ---------- */
  function revealInit() {
    if (rm() || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight || docEl.clientHeight, items = [];
    each($$('main > section:not(.hero) > *'), function (el) {
      if (el.getBoundingClientRect().top < vh * 0.9) return;
      items.push(el);
    });
    if (!items.length) return;
    function show(el) {
      el.classList.add('rv-in');
      setTimeout(function () { el.classList.remove('rv', 'rv-in'); }, 900);
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        show(en.target);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    docEl.classList.add('rv-on');
    each(items, function (el) { el.classList.add('rv'); io.observe(el); });
    window.addEventListener('beforeprint', function () {
      each(items, function (el) { io.unobserve(el); el.classList.remove('rv', 'rv-in'); });
    });
  }

  /* ---------- запуск ---------- */
  function init() {
    safe(themeInit);
    safe(navInit);
    net = safe(netInit);
    safe(chartsInit);
    safe(dashInit);
    safe(casesInit);
    safe(receiptInit);
    safe(calcInit);
    safe(revealInit);
    each($$('input[type="range"]'), function (inp) { setP(inp); inp.addEventListener('input', function () { setP(inp); }); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        hosts.forEach(function (st) { safe(st.render); });
        if (net) net.repaint();
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
