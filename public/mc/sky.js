/**
 * Tonight's sky — generative art behind Mission Control.
 *
 * Seeded by the date, so the whole day shares one sky and tomorrow
 * gets a different one. Nebula blobs drift, stars twinkle with
 * parallax, and shooting stars are rare. Honors reduced motion.
 */

(function () {
  var canvas = document.getElementById('sky');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // djb2 hash of the date → mulberry32, the fleet's usual RNG pairing.
  function hashString(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var today = new Date();
  var key = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  var rnd = mulberry32(hashString(key));

  var W = 0;
  var H = 0;
  var dpr = 1;
  var nebulas = [];
  var stars = [];
  var meteors = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function build() {
    var HUES = [190 + rnd() * 40, 250 + rnd() * 50, 320 + rnd() * 40, 150 + rnd() * 30];
    nebulas = [];
    for (var i = 0; i < 4; i++) {
      nebulas.push({
        x: rnd() * W,
        y: rnd() * H * 0.8,
        r: (0.28 + rnd() * 0.3) * Math.max(W, H),
        hue: HUES[i % HUES.length],
        dx: (rnd() - 0.5) * 6,
        dy: (rnd() - 0.5) * 4,
        phase: rnd() * Math.PI * 2,
        alpha: 0.05 + rnd() * 0.06,
      });
    }
    stars = [];
    for (var s = 0; s < 220; s++) {
      stars.push({
        x: rnd() * W,
        y: rnd() * H,
        size: 0.4 + rnd() * 1.3,
        depth: 0.25 + rnd() * 0.75,
        tw: rnd() * Math.PI * 2,
        speed: 0.4 + rnd() * 1.2,
      });
    }
    meteors = [];
  }

  function spawnMeteor() {
    meteors.push({
      x: W * (0.15 + Math.random() * 0.7),
      y: H * Math.random() * 0.35,
      vx: (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 120),
      vy: 130 + Math.random() * 110,
      life: 0,
      max: 0.9 + Math.random() * 0.6,
    });
  }

  var last = 0;
  function draw(ts) {
    var t = ts / 1000;
    var dt = Math.min(Math.max(t - last, 0), 0.05);
    last = t;

    ctx.clearRect(0, 0, W, H);

    for (var n = 0; n < nebulas.length; n++) {
      var neb = nebulas[n];
      var x = neb.x + Math.sin(t * 0.02 + neb.phase) * neb.dx + t * 0.6 * neb.dx * 0.1;
      var y = neb.y + Math.cos(t * 0.016 + neb.phase) * neb.dy;
      var g = ctx.createRadialGradient(x, y, 0, x, y, neb.r);
      g.addColorStop(0, 'hsla(' + neb.hue + ', 70%, 60%, ' + neb.alpha + ')');
      g.addColorStop(1, 'hsla(' + neb.hue + ', 70%, 60%, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * st.speed + st.tw));
      ctx.globalAlpha = a * st.depth;
      ctx.fillStyle = '#dfe8ff';
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
      ctx.fill();
      st.y += st.depth * 2.2 * dt;
      if (st.y > H + 2) st.y = -2;
    }
    ctx.globalAlpha = 1;

    // Spawn rate scales with real elapsed time, so hidden-tab slow ticks
    // don't make meteors rarer (or a fast display, more common).
    if (Math.random() < 0.13 * dt && meteors.length < 2) spawnMeteor();
    for (var m = meteors.length - 1; m >= 0; m--) {
      var mt = meteors[m];
      mt.life += dt;
      mt.x += mt.vx * dt;
      mt.y += mt.vy * dt;
      var fade = 1 - mt.life / mt.max;
      if (fade <= 0) { meteors.splice(m, 1); continue; }
      var grad = ctx.createLinearGradient(mt.x, mt.y, mt.x - mt.vx * 0.14, mt.y - mt.vy * 0.14);
      grad.addColorStop(0, 'rgba(255, 240, 210, ' + (0.85 * fade) + ')');
      grad.addColorStop(1, 'rgba(255, 240, 210, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(mt.x, mt.y);
      ctx.lineTo(mt.x - mt.vx * 0.14, mt.y - mt.vy * 0.14);
      ctx.stroke();
    }

  }

  // Background tabs never fire rAF, which would leave the sky blank —
  // so: paint one frame synchronously at boot, then keep ticking with a
  // slow timer while hidden and rAF while visible. One loop only, no
  // matter how many times the tab flips visibility.
  var ticking = false;
  function schedule() {
    if (ticking) return;
    ticking = true;
    if (document.hidden) {
      setTimeout(function () { ticking = false; draw(performance.now()); schedule(); }, 220);
    } else {
      requestAnimationFrame(function (ts) { ticking = false; draw(ts); schedule(); });
    }
  }

  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('resize', function () { resize(); build(); draw(performance.now()); });

  function drawStatic() {
    resize();
    last = 0;
    draw(0);
  }

  resize();
  build();
  if (reduceMotion) drawStatic();
  else { draw(performance.now()); schedule(); }
})();
