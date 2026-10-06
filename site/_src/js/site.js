/* Museum of Ages, every page's script. Deferred: nothing here runs before the first paint,
   and nothing here ever hides content. A picture about to arrive stands a little dim while it is
   still below the screen and brightens as it comes in; a reader who never scrolls sees none of it. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement, win = window;
  root.classList.add('js');

  var still = win.matchMedia('(prefers-reduced-motion: reduce)');
  var hasIO = 'IntersectionObserver' in win;
  var top = doc.querySelector('[data-top]');
  var dock = doc.querySelector('[data-dock]');
  var dusk = doc.querySelector('[data-dusk]');
  var lit = Array.prototype.slice.call(doc.querySelectorAll('[data-lit]'));
  var paused = false, armed = false;

  /* The menu and the list of wings open without a script. With one, a press outside or Escape closes them. */
  var folds = doc.querySelectorAll('[data-menu],[data-drop]');
  function fold(but) { folds.forEach(function (d) { if (d !== but) d.open = false; }); }
  if (folds.length) {
    doc.addEventListener('click', function (e) {
      var inside = e.target.closest ? e.target.closest('[data-menu],[data-drop]') : null;
      fold(inside);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      folds.forEach(function (d) {
        if (d.open) { d.open = false; var s = d.querySelector('summary'); if (s) s.focus(); }
      });
    });
  }

  /* The wall of wings: each plate knows its place in the hang, so the lamps can come on one after another. */
  doc.querySelectorAll('[data-wall]').forEach(function (wall) {
    var n = 0;
    wall.querySelectorAll('[data-lit]').forEach(function (el) { el.style.setProperty('--i', String(n % 5)); n++; });
  });

  /* The phone's door: up while neither of the page's own doors is on screen. */
  if (dock && hasIO) {
    var seen = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) seen.add(en.target); else seen.delete(en.target); });
      dock.classList.toggle('is-up', seen.size === 0 && win.scrollY > 200);
    });
    doc.querySelectorAll('[data-door-watch]').forEach(function (d) { io.observe(d); });
    dock.hidden = false;
  }

  /* Arrivals. Dim is only ever set on a picture that is wholly below the screen and close to it,
     so no capture and no jump finds a darkened picture far down the page. */
  function lights() {
    var vh = win.innerHeight;
    for (var i = lit.length - 1; i >= 0; i--) {
      var el = lit[i], t = el.getBoundingClientRect().top;
      if (t < vh * 0.9) { el.classList.remove('is-dim'); lit.splice(i, 1); }
      else if (t >= vh && t < vh * 2.4) el.classList.add('is-dim');
      else if (t >= vh * 2.4) el.classList.remove('is-dim');
    }
  }
  function allLit() {
    doc.querySelectorAll('.is-dim').forEach(function (el) { el.classList.remove('is-dim'); });
  }

  /* Scroll-linked: the arc under the header, the arrivals, and the dusk at the end. One rAF per frame. */
  var ticking = false;
  function frame() {
    ticking = false;
    var max = root.scrollHeight - win.innerHeight;
    if (top) top.style.setProperty('--arc', max > 0 ? Math.min(1, Math.max(0, win.scrollY / max)).toFixed(4) : '0');
    var move = armed && !paused && !still.matches;
    if (move && lit.length) lights();
    if (dusk && move) {
      var r = dusk.getBoundingClientRect();
      /* Far below the screen, and on a page that stands whole on the screen, the closing is left as it is
         drawn: day in the court, the stars full. The dusk is tied to the scroll only as the section nears. */
      if (max <= 0 || r.top > win.innerHeight * 1.6) {
        dusk.style.removeProperty('--day'); dusk.style.removeProperty('--stars');
      } else {
        var t = Math.min(1, Math.max(0, (win.innerHeight * 0.75 - r.top) / (win.innerHeight * 0.9)));
        dusk.style.setProperty('--day', (1 - 0.5 * t).toFixed(3));
        dusk.style.setProperty('--stars', (0.3 + 0.7 * t).toFixed(3));
      }
    }
  }
  function queue() { if (!ticking) { ticking = true; win.requestAnimationFrame(frame); } }
  /* Only the reader's own scroll arms the arrivals: a resize never does. */
  win.addEventListener('scroll', function () {
    if (!armed && win.scrollY > 4) { armed = true; root.classList.add('is-armed'); }
    queue();
  }, { passive: true });
  win.addEventListener('resize', queue, { passive: true });
  queue();

  /* A piece's script is named by the wing's data and fetched after the page has loaded, never before the first paint. */
  var me = doc.currentScript || doc.querySelector('script[src*="site.js"]');
  var base = me ? me.src.replace(/site\.js.*$/, '') : 'static/';
  var asked = {};
  function fetchScript(name, done, failed) {
    if (!/^[a-z0-9-]+\.js$/.test(name || '')) { if (failed) failed(); return; }
    if (asked[name]) { if (asked[name].done) done(); else asked[name].push(done); return; }
    var waiting = asked[name] = [done];
    var s = doc.createElement('script');
    s.src = base + name; s.async = true;
    s.onload = function () { waiting.done = true; waiting.forEach(function (f) { f(); }); };
    s.onerror = failed || null;
    doc.head.appendChild(s);
  }
  function piece(name) { return (win.MoaPieces && win.MoaPieces[name]) || null; }

  /* The places of showpieces. With no piece installed a place is a finished picture and nothing here runs. With one,
     the place keeps its part of the contract: the piece's files load after the page has loaded, it starts from
     the still, it gets a pause control, and a reader who asked for stillness keeps the still (a place marked
     data-press shows its control to them too: nothing there moves before a press). The first screen's
     piece starts when the page is idle, a piece lower on the page when the reader comes near it. The piece is
     handed the place's box and four calls: beat(n) sets the caption of beat n and that slide's own credit line, if
     it has one (0 gives the still's own caption back; a place marked data-keep-kind keeps the label's kind word
     in front of every beat), grades(on) shows the four grades inside the box, done() says it rests, moving() says whether it may
     run. clip is the address of the piece's one clip, or empty. It answers with { play(), pause() }. */
  var shows = [];
  function setPlace(place) {
    var box = place.querySelector('.hang');
    var cap = place.querySelector('.label');
    var line = cap ? cap.querySelector('.label__what') : null;
    var own = line ? line.innerHTML : '';
    /* a credit that belongs to one slide stands with that slide only */
    var credit = cap ? cap.querySelector('.label__src--slide') : null;
    var ownCredit = credit ? credit.innerHTML : '';
    /* a piece whose pictures are all of one kind keeps the kind's word in front of each beat's line */
    var keeps = place.hasAttribute('data-keep-kind');
    var legend = place.querySelector('[data-grades]');
    var toggle = place.querySelector('[data-place-toggle]');
    /* a place marked data-press waits for the visitor: its piece moves only after their press, whatever else is still */
    var press = place.hasAttribute('data-press');
    var st = { show: null, on: false }, swap = 0;
    function set(on) {
      st.on = on;
      if (st.show) { if (on) st.show.play(); else st.show.pause(); }
      if (toggle) { toggle.textContent = on ? toggle.dataset.stop : toggle.dataset.go; toggle.dataset.held = on ? 'false' : 'true'; }
    }
    st.set = set;
    var api = {
      beat: function (n) {
        if (!line) return;
        var words = n ? place.getAttribute('data-beat-' + n) : null;
        win.clearTimeout(swap);
        cap.classList.add('is-changing');
        swap = win.setTimeout(function () {
          var tag = words && keeps ? line.querySelector('.tag') : null;
          if (!words) line.innerHTML = own;
          else if (tag) {
            // the unseen colon after the tag stays: it stands outside the tag so the tag's margin never opens a line
            var last = tag.nextElementSibling && tag.nextElementSibling.className === 'vh' ? tag.nextElementSibling : tag;
            while (last.nextSibling) line.removeChild(last.nextSibling);
            line.appendChild(doc.createTextNode(' ' + words));
          }
          else line.textContent = words;
          if (credit) {
            if (n) credit.textContent = place.getAttribute('data-src-' + n) || '';
            else credit.innerHTML = ownCredit;
          }
          cap.classList.remove('is-changing');
        }, 350);
      },
      grades: function (on) { if (legend) legend.hidden = !on; },
      done: function () { st.on = false; if (toggle) { toggle.textContent = toggle.dataset.go; toggle.dataset.held = 'true'; } },
      moving: function () { return press ? st.on : !paused && !still.matches; },
      clip: place.getAttribute('data-clip') || ''
    };
    function start() {
      fetchScript(place.dataset.script, function () {
        var made = piece(place.dataset.piece);
        st.show = made && box ? made.mount(box, api) : null;
        if (!st.show) return;
        shows.push(st);
        if (toggle) {
          toggle.hidden = false;
          toggle.addEventListener('click', function () { set(!st.on); });
        }
        set(!paused && !press);
      });
    }
    function idle() { if ('requestIdleCallback' in win) win.requestIdleCallback(start, { timeout: 2500 }); else win.setTimeout(start, 900); }
    function near() {
      /* a piece lower on the page waits for its still and for a reader who comes near it */
      var img = box ? box.querySelector('img') : null;
      var go = function () { if (img && !(img.complete && img.naturalWidth)) img.addEventListener('load', start, { once: true }); else start(); };
      if (!hasIO) { go(); return; }
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect(); go();
      }, { rootMargin: '160px 0px' });
      io.observe(place);
    }
    var first = place.classList.contains('hero__plate');
    var begin = first ? idle : near;
    if (doc.readyState === 'complete') begin(); else win.addEventListener('load', begin, { once: true });
  }
  doc.querySelectorAll('[data-place][data-script]').forEach(function (place) {
    if (!still.matches || place.hasAttribute('data-press')) setPlace(place);
  });

  /* A stop's model to turn (a stage). Its poster is a finished picture and stays where there is no WebGL2. The
     model's script is fetched when a reader stays near the stage or touches it, never before the page has loaded.
     A reader who asked for stillness keeps the poster until they press the button. */
  doc.querySelectorAll('[data-stage][data-script]').forEach(function (stage) {
    var fig = stage.closest ? stage.closest('figure') : null;
    var toggle = fig ? fig.querySelector('[data-machine-toggle]') : null;
    var hint = fig ? fig.querySelector('[data-stage-hint]') : null;
    var machine = null, wanted = false;
    var st = { on: false };
    function say() {
      if (!toggle) return;
      toggle.textContent = st.on ? toggle.dataset.stop : toggle.dataset.go;
      toggle.dataset.held = st.on ? 'false' : 'true';
    }
    function turn(on) { st.on = on; if (machine) machine.turning(on); say(); }
    st.set = turn;
    function gone() { if (toggle) toggle.hidden = true; if (hint) hint.hidden = true; }
    function fetchMachine(then) {
      if (wanted) { if (machine && then) then(); return; }
      wanted = true;
      fetchScript(stage.dataset.script, function () {
        var made = piece(stage.dataset.piece);
        machine = made ? made.mount(stage, {}) : null;
        if (!machine) { gone(); return; }
        shows.push(st);
        if (toggle) toggle.hidden = false;
        if (hint) hint.hidden = false;
        if (then) then(); else turn(!paused && !still.matches);
      }, gone);
    }
    if (toggle) {
      toggle.addEventListener('click', function () {
        if (!machine) { fetchMachine(function () { turn(true); }); return; }
        turn(!st.on);
      });
    }
    /* The button stands from the start wherever the model can run, so its row is never empty. */
    if (toggle && win.WebGL2RenderingContext) { toggle.hidden = false; say(); }
    if (still.matches) return;
    stage.addEventListener('pointerdown', function () { fetchMachine(); }, { once: true });
    if (!hasIO) return;
    /* Only a reader who stays near the stage fetches the model: a page flung past it does not. */
    var dwell = 0;
    var near = new IntersectionObserver(function (entries) {
      win.clearTimeout(dwell);
      if (!entries[0].isIntersecting) return;
      dwell = win.setTimeout(function () { near.disconnect(); fetchMachine(); }, 600);
    }, { rootMargin: '700px 0px' });
    var begin = function () { near.observe(stage); };
    if (doc.readyState === 'complete') begin(); else win.addEventListener('load', begin, { once: true });
  });

  /* The pictures far down wait for the scroll and decode off the main thread. Once one is in, it is decoded
     ahead and from then on painted at once, so it never stands empty when it comes into view. */
  doc.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
    function ready() {
      var done = function () { img.decoding = 'sync'; };
      if (img.decode) img.decode().then(done, done); else done();
    }
    if (img.complete && img.naturalWidth) ready(); else img.addEventListener('load', ready, { once: true });
  });

  /* A jump from a link on the page glides. Every other scroll is the browser's own and arrives at once. */
  doc.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a || paused || still.matches) return;
    root.style.scrollBehavior = 'smooth';
    win.setTimeout(function () { root.style.scrollBehavior = ''; }, 1200);
  });

  /* A way to anything inside a closed fold opens the fold first: a press of a link, a visit that came with the
     address of a part inside it, the browser's back and forward. Some browsers do it themselves, not all. */
  function unfold(id) {
    var t = id ? doc.getElementById(id) : null;
    var d = t && t.closest ? t.closest('details.fold') : null;
    if (d && !d.open) d.open = true;
  }
  function hashId(h) { try { return decodeURIComponent((h || '').slice(1)); } catch (err) { return ''; } }
  doc.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href*="#"]') : null;
    if (a && a.origin === win.location.origin && a.pathname === win.location.pathname) unfold(hashId(a.hash));
  });
  win.addEventListener('hashchange', function () { unfold(hashId(win.location.hash)); });
  unfold(hashId(win.location.hash));

  /* One control stops everything that moves on its own. */
  var motion = doc.querySelector('[data-motion-toggle]');
  if (motion && !still.matches) {
    motion.hidden = false;
    motion.addEventListener('click', function () {
      paused = !paused;
      root.classList.toggle('motion-paused', paused);
      motion.textContent = paused ? motion.dataset.play : motion.dataset.pause;
      if (paused) {
        allLit();
        shows.forEach(function (st) { if (st.on) st.set(false); });
        if (dusk) { dusk.style.removeProperty('--day'); dusk.style.removeProperty('--stars'); }
      } else {
        queue();
      }
    });
  }

  function loaded() {
    root.classList.add('is-loaded');
    /* The styles below the first screen arrive after the browser has jumped to an anchor:
       a visit that came with one is set on it again. */
    if (win.location.hash.length > 1) {
      try {
        var t = doc.getElementById(decodeURIComponent(win.location.hash.slice(1)));
        if (t) t.scrollIntoView({ behavior: 'instant', block: 'start' });
      } catch (err) {}
    }
  }
  if (doc.readyState === 'complete') loaded(); else win.addEventListener('load', loaded, { once: true });
})();
