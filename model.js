/* Модель LETO MEDIA v4 на JS. Точная копия run() из ФИНМОДЕЛЬ/model_v4.py.
   Сделка v4: партнёр доплачивает до 3 500 $ в месяц, пока сеть не покроет команду (не дольше 12 месяцев),
   плюс обучение в первом платеже. Всё выше 3 500 $ идёт партнёру до возврата, потом 30/30/30/10.
   Сверка с Python: node check_model.mjs */
(function (g) {
  var KINDS = ['выстрелил', 'средний', 'не взлетел'];

  function viewsAt(ramp, kind, age) {
    var pts = Object.keys(ramp[kind]).map(function (a) { return [Number(a), ramp[kind][a]]; })
      .sort(function (x, y) { return x[0] - y[0]; });
    if (age <= pts[0][0]) return pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var a0 = pts[i][0], v0 = pts[i][1], a1 = pts[i + 1][0], v1 = pts[i + 1][1];
      if (age <= a1) return v0 + (v1 - v0) * (age - a0) / (a1 - a0);
    }
    return pts[pts.length - 1][1];
  }

  function run(M, s, delay) {
    delay = delay || 0;
    var B = M.budget, SP = M.split;
    var invested = 0, paid = 0, fund = 0, financing = true;
    var stop = null, payback = null, cover = null, monthsPaid = 0, rows = [];
    var active = (s.mix['выстрелил'] || 0) + (s.mix['средний'] || 0);
    for (var t = 1; t <= 120; t++) {
      var age = t - delay, views = 0, ads = 0, prod = 0;
      for (var k = 0; k < KINDS.length; k++) {
        var kind = KINDS[k], n = s.mix[kind] || 0;
        if (kind === 'не взлетел' || age < 1 || !n) continue;
        var v = viewsAt(M.ramp, kind, age) * n;
        views += v;
        if (age >= s.MON) ads += v * s.RPM / 1000;
        if (age >= s.PROD_FROM) prod += v * s.PROD / 1000;
      }
      var integ = age >= s.INT_FROM ? s.INT_N * s.INT_PRICE * active : 0;
      var rev = ads + prod + integ;
      var net = rev * (1 - M.haircut);

      var top = 0;
      if (cover === null && net >= B) cover = t;
      if (financing && net >= B) { financing = false; stop = t; }
      if (financing && t > M.invest_months) financing = false;
      if (financing) top = M.topup ? B - net : B;
      var course = t === 1 ? M.course : 0;
      top += course;
      invested += top;
      if (top > 0) monthsPaid++;
      var team = Math.min(B, net + top - course);

      var over = financing ? 0 : Math.max(0, net - B);
      if (!M.topup && financing) fund += net;
      var pay = 0, ret = 0, rest = 0, fm = 0;
      var left = financing ? 0 : Math.max(0, invested - paid);
      if (over > 0) {
        if (payback === null) {
          ret = Math.min(over, left);
          pay += ret;
          rest = over - ret;
          if (paid + ret >= invested - 0.5) payback = t;
        } else rest = over;
        if (payback !== null && rest > 0) {
          pay += rest * SP['партнёр'];
          fm = rest * SP['фонд компании'];
        }
      }
      paid += pay;
      fund += fm;
      var phase = top > 0 ? 'вложение' : (payback === null || payback === t ? 'возврат' : 'делёж');
      rows.push({
        t: t, views: views, ads: ads, prod: prod, integ: integ, rev: rev, net: net,
        top: top, course: course, invested: invested, team: team, over: over,
        ret: ret, share: rest * SP['партнёр'], rest: rest, pay: pay, paid: paid,
        artur: rest * SP['Артур'] * (payback !== null ? 1 : 0),
        zarina: rest * SP['Зарина'] * (payback !== null ? 1 : 0),
        fund_m: fm, fund: fund, phase: phase
      });
    }
    return { rows: rows, payback: payback, invested: invested, stop: stop, cover: cover, monthsPaid: monthsPaid };
  }

  g.LMModel = { run: run, viewsAt: viewsAt };
})(typeof window !== 'undefined' ? window : globalThis);
