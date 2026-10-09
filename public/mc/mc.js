/**
 * Mission Control instruments: clock, today's quote, weather at the pad,
 * recent tasks, ambient drift, DJ Vault status, the Gallery walls,
 * the Daily Puzzle League, live FriendCredit™ bureau standings and the
 * adhdTracker streak.
 */
import { pickThrowback, prettyName, formatDate, yearsAgoText, isAudioName } from '../djmixes/throwback.js';
import { scoreFriends, computeAdhdStats, mergeById, todayStr, galleryBrief } from './summaries.js';
import { quoteOfDay } from '../quote-pool.js';
import { collectArtwork } from '../gallery/gallery.js';
import { createJoinUi } from './joinui.js';
import { joinCodeFromLocation } from './vault.js';

(function () {
  var VAULT_API = 'https://api.github.com/repos/jonnymexican/dj-mixes/releases?per_page=100';
  // Must match puzzleleague/src/puzzle.js — day 0 is 2026-09-28, UTC.
  var EPOCH = Date.UTC(2026, 8, 28);
  var TASKS_KEY = 'mc:tasks';

  var clockEl = document.getElementById('clock');
  var fleetLed = document.getElementById('led-fleet');
  var fleetText = document.getElementById('fleet-text');

  function tickClock() {
    clockEl.textContent = new Date().toLocaleTimeString();
  }
  tickClock();
  setInterval(tickClock, 1000);

  function readJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* private mode — the console just won't remember things */
    }
  }

  function esc(s) {
    return String(s).replace(/[<>&]/g, '');
  }

  /** Vault settings both fleet apps persist on this shared origin. */
  function readVaultSettings(key) {
    var s = readJSON(key);
    if (!s || !/^https:\/\//.test(s.url || '') || !s.code) return null;
    return s;
  }

  /** Read a bureau from the shared vault; falls back to this device's data. */
  function fetchBureau(settingsKey, localLists, remoteKey, then) {
    var settings = readVaultSettings(settingsKey);
    if (!settings) {
      then(localLists, '');
      return;
    }
    fetch(settings.url + '/bureau/' + encodeURIComponent(settings.code), {
      headers: { 'x-vault-code': settings.code },
    })
      .then(function (r) {
        if (!r.ok) throw new Error('vault said ' + r.status);
        return r.json();
      })
      .then(function (state) {
        then(localLists, state, 'live from the shared vault');
      })
      .catch(function () {
        then(localLists, null, 'vault unreachable — showing this device');
      });
  }

  // ---------------- Quote of the day (Get Inspired, same pick worldwide) ----------------
  (function quoteCard() {
    var led = document.getElementById('led-quote');
    var big = document.getElementById('quote-big');
    var detail = document.getElementById('quote-detail');
    try {
      big.textContent = quoteOfDay(new Date());
      var favs = readJSON('get-inspired:favorites');
      var n = Array.isArray(favs) ? favs.length : 0;
      detail.innerHTML =
        (n ? '♥ <b>' + n + '</b> favorite' + (n === 1 ? '' : 's') + ' saved on this device · ' : '') +
        'one a day, the same for the whole world.';
      led.className = 'led led-green';
    } catch (e) {
      big.textContent = '—';
      detail.textContent = 'The quote engine is offline.';
      led.className = 'led';
    }
  })();

  // ---------------- Weather at the pad ----------------
  var WMO = {
    0: ['☀️', 'Clear'], 1: ['🌤', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
    45: ['🌫', 'Fog'], 48: ['🌫', 'Icy fog'],
    51: ['🌦', 'Light drizzle'], 53: ['🌦', 'Drizzle'], 55: ['🌦', 'Heavy drizzle'],
    61: ['🌧', 'Light rain'], 63: ['🌧', 'Rain'], 65: ['🌧', 'Heavy rain'],
    66: ['🌧', 'Freezing rain'], 67: ['🌧', 'Freezing rain'],
    71: ['🌨', 'Light snow'], 73: ['🌨', 'Snow'], 75: ['🌨', 'Heavy snow'], 77: ['🌨', 'Snow grains'],
    80: ['🌧', 'Showers'], 81: ['🌧', 'Showers'], 82: ['⛈', 'Violent showers'],
    85: ['🌨', 'Snow showers'], 86: ['🌨', 'Snow showers'],
    95: ['⛈', 'Thunderstorm'], 96: ['⛈', 'Storm w/ hail'], 99: ['⛈', 'Storm w/ hail'],
  };

  function weatherShow(loc) {
    var url =
      'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&current=temperature_2m,apparent_temperature,weather_code&' +
      'daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&' +
      'temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto';
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('open-meteo said ' + r.status); return r.json(); })
      .then(function (w) {
        var cur = w.current || {};
        var daily = w.daily || {};
        var wmo = WMO[cur.weather_code] || ['🌡', 'Unknown'];
        var hi = daily.temperature_2m_max && daily.temperature_2m_max[0];
        var lo = daily.temperature_2m_min && daily.temperature_2m_min[0];
        var rain = daily.precipitation_probability_max && daily.precipitation_probability_max[0];
        document.getElementById('weather-big').textContent =
          Math.round(cur.temperature_2m) + '°F ' + wmo[0];
        document.getElementById('weather-detail').innerHTML =
          '<b>' + loc.name + '</b> · ' + wmo[1] +
          (isFinite(hi) && isFinite(lo) ? ' · hi ' + Math.round(hi) + '° / lo ' + Math.round(lo) + '°' : '') +
          (isFinite(rain) ? ' · rain ' + rain + '%' : '') +
          ' · feels ' + Math.round(cur.apparent_temperature) + '°';
        document.getElementById('led-weather').className = 'led led-green';
      })
      .catch(function (err) {
        document.getElementById('weather-big').textContent = '—';
        document.getElementById('weather-detail').textContent = 'Weather offline (' + err.message + ').';
        document.getElementById('led-weather').className = 'led led-amber';
      });
  }

  fetch('https://ipapi.co/json/')
    .then(function (r) { if (!r.ok) throw new Error('ipapi said ' + r.status); return r.json(); })
    .then(function (j) {
      if (typeof j.latitude !== 'number' || typeof j.longitude !== 'number') throw new Error('no fix');
      weatherShow({ lat: j.latitude, lon: j.longitude, name: [j.city, j.region].filter(Boolean).join(', ') || 'the pad' });
    })
    .catch(function () {
      // IP lookup failed — ask the browser for a position instead.
      if (!navigator.geolocation) {
        document.getElementById('weather-big').textContent = '—';
        document.getElementById('weather-detail').textContent = 'No location fix — weather offline.';
        document.getElementById('led-weather').className = 'led';
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          weatherShow({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'your spot' });
        },
        function () {
          document.getElementById('weather-big').textContent = '—';
          document.getElementById('weather-detail').textContent = 'No location fix — weather offline.';
          document.getElementById('led-weather').className = 'led';
        },
        { timeout: 6000, maximumAge: 600000 }
      );
    });

  // ---------------- Recent tasks ----------------
  var taskForm = document.getElementById('task-form');
  var taskInput = document.getElementById('task-input');
  var taskList = document.getElementById('task-list');

  function loadTasks() {
    var t = readJSON(TASKS_KEY);
    return Array.isArray(t) ? t : [];
  }

  function renderTasks() {
    var tasks = loadTasks();
    taskList.innerHTML = '';
    if (!tasks.length) {
      var empty = document.createElement('li');
      empty.className = 'task-empty';
      empty.textContent = 'Nothing on the console — capture the next small thing.';
      taskList.appendChild(empty);
      return;
    }
    tasks.slice(-8).reverse().forEach(function (task, idx) {
      var li = document.createElement('li');
      if (task.done) li.className = 'done';
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'task-dot' + (task.done ? ' done' : '');
      dot.textContent = task.done ? '✓' : '';
      dot.title = 'Toggle done';
      dot.addEventListener('click', function () {
        var all = loadTasks();
        var real = all.indexOf(task);
        if (real >= 0) { all[real].done = !all[real].done; writeJSON(TASKS_KEY, all); renderTasks(); }
      });
      var text = document.createElement('span');
      text.className = 'task-text';
      text.textContent = task.t;
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'task-x';
      x.textContent = '✕';
      x.title = 'Remove';
      x.addEventListener('click', function () {
        var all = loadTasks();
        var real = all.indexOf(task);
        if (real >= 0) { all.splice(real, 1); writeJSON(TASKS_KEY, all); renderTasks(); }
      });
      li.appendChild(dot);
      li.appendChild(text);
      li.appendChild(x);
      taskList.appendChild(li);
    });
  }

  taskForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = taskInput.value.trim();
    if (!t) return;
    var all = loadTasks();
    all.push({ t: t, done: false, at: Date.now() });
    writeJSON(TASKS_KEY, all);
    taskInput.value = '';
    renderTasks();
  });
  renderTasks();

  // ---------------- Ambient drift (generated, no assets) ----------------
  var ambientBtn = document.getElementById('ambient');
  var actx = null;
  var gain = null;
  var ambientOn = false;

  function buildAmbient() {
    var AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    var seconds = 3;
    var buf = actx.createBuffer(1, actx.sampleRate * seconds, actx.sampleRate);
    var data = buf.getChannelData(0);
    var lastV = 0;
    for (var i = 0; i < data.length; i++) {
      var white = Math.random() * 2 - 1;
      lastV = (lastV + 0.02 * white) / 1.02; // brown-ish noise
      data[i] = lastV * 3.2;
    }
    var src = actx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    var filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.4;
    // Slow "breathing" so it feels like weather, not a fan.
    var lfo = actx.createOscillator();
    lfo.frequency.value = 0.06;
    var lfoAmt = actx.createGain();
    lfoAmt.gain.value = 70;
    lfo.connect(lfoAmt);
    lfoAmt.connect(filter.frequency);
    gain = actx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(actx.destination);
    src.start();
    lfo.start();
  }

  ambientBtn.addEventListener('click', function () {
    if (!actx) buildAmbient();
    if (actx.state === 'suspended') actx.resume();
    ambientOn = !ambientOn;
    var now = actx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(ambientOn ? 0.055 : 0, now + 0.8);
    ambientBtn.textContent = ambientOn ? '🔊 Drifting' : '🔇 Ambient';
    ambientBtn.classList.toggle('on', ambientOn);
  });

  // ---------------- DJ Vault (live from the archive) ----------------
  fetch(VAULT_API)
    .then(function (r) {
      if (!r.ok) throw new Error('GitHub API said ' + r.status);
      return r.json();
    })
    .then(function (releases) {
      var led = document.getElementById('led-vault');
      var big = document.getElementById('vault-big');
      var detail = document.getElementById('vault-detail');
      var tbEl = document.getElementById('vault-throwback');
      var count = 0;
      var bytes = 0;
      (releases || []).forEach(function (rel) {
        (rel.assets || []).forEach(function (a) {
          if (!isAudioName(a.name)) return;
          count += 1;
          bytes += a.size || 0;
        });
      });
      if (!count) {
        big.textContent = '0 mixes';
        detail.textContent = 'The vault is empty.';
        led.className = 'led led-amber';
      } else {
        big.textContent = count + ' mix' + (count === 1 ? '' : 'es') + ' · ' + (bytes / 1e9).toFixed(2) + ' GB';
        detail.textContent = 'Streaming straight from the archive, no accounts.';
        led.className = 'led led-green';
      }
      var pick = pickThrowback(releases || [], new Date());
      if (pick) {
        tbEl.hidden = false;
        tbEl.innerHTML =
          '📻 <b>Throwback of the day:</b> ' +
          prettyName(pick.asset.name).replace(/[<>&]/g, '') +
          ' — <b>' + formatDate(pick.at) + '</b>' +
          (pick.isExactDate ? ' (' + yearsAgoText(pick.at, new Date()) + ')' : '') +
          '. <a href="/test/djmixes/">Tune in →</a>';
      }
    })
    .catch(function (err) {
      document.getElementById('led-vault').className = 'led';
      document.getElementById('vault-big').textContent = 'offline';
      document.getElementById('vault-detail').textContent = 'Could not reach the archive (' + err.message + ').';
    });

  // ---------------- The Gallery (live from the art archive) ----------------
  var GALLERY_API = 'https://api.github.com/repos/jonnymexican/art/releases?per_page=100';

  function galleryRender(shows, note) {
    var led = document.getElementById('led-gallery');
    var big = document.getElementById('gallery-big');
    var detail = document.getElementById('gallery-detail');
    var thumbs = document.getElementById('gallery-thumbs');
    var brief = galleryBrief(shows);
    thumbs.innerHTML = '';
    if (!brief.works) {
      big.textContent = 'the walls are bare';
      detail.textContent = 'No works hanging yet — open the gallery to start the first show.';
      led.className = 'led led-amber';
      return;
    }
    big.textContent =
      brief.works + ' work' + (brief.works === 1 ? '' : 's') +
      ' · ' + brief.shows + ' show' + (brief.shows === 1 ? '' : 's');
    if (brief.latest) {
      detail.innerHTML =
        'Newest show: <b>' + esc(brief.latest.title) + '</b> · ' + brief.latest.count + ' piece' +
        (brief.latest.count === 1 ? '' : 's') + (note ? ' · ' + note : '');
      brief.latest.thumbs.forEach(function (im) {
        var img = document.createElement('img');
        img.loading = 'lazy';
        img.src = im.src;
        img.alt = im.caption;
        img.title = im.caption;
        thumbs.appendChild(img);
      });
    } else if (note) {
      detail.textContent = note;
    }
    led.className = 'led led-green';
  }

  fetch(GALLERY_API, { cache: 'reload' })
    .then(function (r) {
      if (!r.ok) throw new Error('GitHub API said ' + r.status);
      return r.json();
    })
    .then(function (releases) {
      galleryRender(collectArtwork(releases), '');
    })
    .catch(function (err) {
      document.getElementById('led-gallery').className = 'led';
      document.getElementById('gallery-big').textContent = 'offline';
      document.getElementById('gallery-detail').textContent =
        'Could not reach the archive (' + err.message + ').';
    });

  // ---------------- Daily Puzzle League (same origin, shared localStorage) ----------------
  (function puzzleCard() {
    var led = document.getElementById('led-puzzle');
    var big = document.getElementById('puzzle-big');
    var detail = document.getElementById('puzzle-detail');
    var now = new Date();
    var dayNum = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EPOCH) / 86400000);
    var me = readJSON('puzzleleague:me');
    var history = readJSON('puzzleleague:history') || {};
    big.textContent = 'Puzzle #' + dayNum;
    if (!me) {
      detail.innerHTML = 'Not enlisted yet — one numbers puzzle a day, same for everyone. Four numbers, one solution.';
      led.className = 'led led-amber';
      return;
    }
    var streak = 0;
    var d = dayNum;
    if (!(history[d] && history[d].solvedAt)) d -= 1; // today unsolved doesn't break yesterday's streak
    while (history[d] && history[d].solvedAt) { streak += 1; d -= 1; }
    var today = history[dayNum];
    var todayText = today && today.solvedAt
      ? 'Cracked today with <b>' + today.clues + '</b> clue(s) for <b>' + today.base + '</b> pts.'
      : 'Today\u2019s four numbers are waiting.';
    detail.innerHTML =
      'Enlisted as <b>' + String(me.name).replace(/[<>&]/g, '') + '</b> · streak <b>' + streak + '</b> day(s). ' + todayText;
    led.className = 'led ' + (today && today.solvedAt ? 'led-green' : 'led-amber');
  })();

  // ---------------- FriendCredit™ Bureau (shared vault, live) ----------------
  var ledFC = document.getElementById('led-fc');

  function fcRender(data, note) {
    var friends = data.friends;
    var txns = data.txns;
    var roster = document.getElementById('fc-roster');
    var big = document.getElementById('fc-big');
    var detail = document.getElementById('fc-detail');
    roster.innerHTML = '';
    if (!friends.length) {
      big.textContent = 'no names on file';
      detail.textContent = 'The bureau is empty — open FriendCredit to add the first friend.';
      ledFC.className = 'led led-amber';
      return;
    }
    var scored = scoreFriends(friends, txns);
    var filed = txns.length;
    big.textContent =
      friends.length + ' friend' + (friends.length === 1 ? '' : 's') + ' · ' +
      filed + ' filing' + (filed === 1 ? '' : 's');
    var top = scored[0];
    detail.innerHTML =
      top.rank.emoji + ' <b>' + esc(top.friend.name) + '</b> leads at <b>' + top.score + '</b>' +
      (note ? ' · ' + note : '');
    scored.slice(0, 3).forEach(function (s) {
      var li = document.createElement('li');
      var emoji = document.createElement('span');
      emoji.textContent = s.rank.emoji;
      var name = document.createElement('span');
      name.textContent = s.friend.name;
      var score = document.createElement('span');
      score.className = 'r-score';
      score.textContent = s.score + ' · ' + s.rank.title;
      li.appendChild(emoji);
      li.appendChild(name);
      li.appendChild(score);
      roster.appendChild(li);
    });
    ledFC.className = 'led led-green';
  }

  function fcLoad() {
    var friends = readJSON('friendcredit:friends');
    var txns = readJSON('friendcredit:transactions');
    var local = { friends: Array.isArray(friends) ? friends : [], txns: Array.isArray(txns) ? txns : [] };
    fetchBureau('friendcredit:vault-settings', local, null, function (base, state, note) {
      if (!state) {
        fcRender({ friends: base.friends, txns: base.txns }, note);
        return;
      }
      fcRender(
        {
          friends: mergeById(base.friends, state.friends, state.tombstones),
          txns: mergeById(base.txns, state.transactions, state.tombstones),
        },
        note
      );
    });
  }

  // ---------------- adhdTracker streak (personal vault, live) ----------------
  var ledADHD = document.getElementById('led-adhd');

  function adhdRender(tasks, note) {
    var big = document.getElementById('adhd-big');
    var detail = document.getElementById('adhd-detail');
    if (!tasks.length) {
      big.textContent = 'no log';
      detail.textContent = 'No tasks on record — open the tracker to plan the day.';
      ledADHD.className = 'led led-amber';
      return;
    }
    var stats = computeAdhdStats(tasks);
    var today = todayStr();
    var doneToday = tasks.filter(function (t) { return t.done && t.completedOn === today; }).length;
    var openToday = tasks.filter(function (t) { return !t.done && t.date === today; }).length;
    var overdue = tasks.filter(function (t) { return !t.done && t.date && t.date < today; }).length;
    big.textContent = '🔥 ' + stats.streak + ' day streak · ' + stats.totalCompleted + ' done';
    detail.innerHTML =
      'Expectations met <b>' + (stats.expectationRate === null ? '—' : stats.expectationRate + '%') + '</b>' +
      ' · today: <b>' + doneToday + '</b> done / ' + openToday + ' open' +
      (overdue ? ' · <b>' + overdue + '</b> overdue' : '') +
      (note ? ' · ' + note : '');
    ledADHD.className = 'led led-green';
  }

  function adhdLoad() {
    var tasks = readJSON('adhdtracker:tasks');
    var tombs = readJSON('adhdtracker:tombs');
    var local = { tasks: Array.isArray(tasks) ? tasks : [], tombs: Array.isArray(tombs) ? tombs : [] };
    fetchBureau('adhdtracker:vault-settings', local, null, function (base, state, note) {
      if (!state) {
        adhdRender(base.tasks, note);
        return;
      }
      adhdRender(mergeById(base.tasks, state.tasks, (state.tombstones || []).concat(base.tombs)), note);
    });
  }

  fcLoad();
  adhdLoad();
  setInterval(function () { fcLoad(); adhdLoad(); }, 60000);
  // Fleet apps share this origin — react instantly when one writes from another tab.
  window.addEventListener('storage', function (e) {
    if (!e.key) return;
    if (e.key.indexOf('friendcredit:') === 0) fcLoad();
    if (e.key.indexOf('adhdtracker:') === 0) adhdLoad();
  });

  // ---------------- Join a vault (settings, no devtools required) ----------------
  var joinUi = createJoinUi({
    readJSON: readJSON,
    writeJSON: writeJSON,
    ids: {
      dialog: 'join',
      input: 'join-input',
      note: 'join-note',
      status: 'join-status',
      join: 'join-go',
      copy: 'join-copy',
      leave: 'join-leave',
      close: 'join-close',
    },
    onJoined: function () {
      fcLoad();
      adhdLoad();
    },
    onLeft: function () {
      fcLoad();
      adhdLoad();
    },
  });
  document.getElementById('vault-btn').addEventListener('click', function () {
    joinUi.open();
  });

  // Invite deep link: /test/mc/?join=CODE pre-fills the dialog on arrival.
  var inviteCode = joinCodeFromLocation(location.search, location.hash);
  if (inviteCode) {
    try {
      history.replaceState(null, '', location.pathname); // refresh won't re-nag with a stale code
    } catch (e) {}
    joinUi.open(inviteCode);
  }

  // ---------------- Fleet line ----------------
  fleetLed.className = 'led led-green';
  fleetText.textContent = 'All systems nominal · 10 ships · 0 accounts · ∞ vibes';
})();
