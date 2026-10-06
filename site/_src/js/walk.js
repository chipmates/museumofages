/* A walk of pictures, a piece under the showpiece contract (window.MoaPieces.walk).
   The place holds its finished still and, in a template, the pictures that follow it. Nothing of them is
   fetched before this script runs, which is after the page has loaded. The walk shows the still, then each
   picture in turn in a slow dissolve, each with the caption line of its beat, and comes to rest on the still.
   It runs once. play() after it has rested walks again, pause() holds the picture that is showing.
   No library, no canvas: stacked pictures and one opacity each. */
(function () {
  'use strict';
  var HOLD = 4200, FADE = 1400;
  var local = /^(127\.0\.0\.1|localhost)$/.test(window.location.hostname);

  function mount(box, place) {
    var store = box.querySelector('template[data-frames]');
    if (!store || !store.content) return null;
    var layer = document.createElement('div');
    layer.className = 'piece walk';
    layer.setAttribute('aria-hidden', 'true');
    layer.appendChild(store.content.cloneNode(true));
    var frames = Array.prototype.slice.call(layer.querySelectorAll('picture'));
    if (!frames.length) return null;
    box.appendChild(layer);

    /* step 0 is the still, step n the n-th picture of the template */
    var step = 0, timer = 0, wanted = false, visible = true, rested = false, left = HOLD, since = 0;

    function ready(n, then) {
      var img = n ? frames[n - 1].querySelector('img') : null;
      if (!img || (img.complete && img.naturalWidth)) { then(); return; }
      var done = function () { img.removeEventListener('load', done); img.removeEventListener('error', done); then(); };
      img.addEventListener('load', done); img.addEventListener('error', done);
    }
    function show(n) {
      step = n;
      frames.forEach(function (f, i) { f.classList.toggle('is-on', i === n - 1); });
      place.beat(n);
    }
    function wait(ms) {
      window.clearTimeout(timer);
      left = ms; since = Date.now();
      timer = window.setTimeout(next, ms);
    }
    function next() {
      if (!wanted || !visible || document.hidden || !place.moving()) return;
      var n = step + 1;
      if (n > frames.length) {
        /* back to the still, and rest there */
        show(0); wanted = false; rested = true; place.done();
        return;
      }
      /* a picture that has not arrived yet is waited for on the picture before it: the wall never stands empty */
      ready(n, function () {
        if (!wanted || step !== n - 1) return;
        show(n); wait(HOLD + FADE);
      });
    }
    function resume() {
      if (!wanted || timer) return;
      wait(Math.max(600, left));
    }
    function hold() {
      if (timer) { left = Math.max(0, left - (Date.now() - since)); window.clearTimeout(timer); timer = 0; }
    }
    var fire = next;
    next = function () { timer = 0; fire(); };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) resume(); else hold();
      }, { threshold: 0.35 }).observe(box);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) hold(); else if (visible) resume(); });

    /* On a builder's own machine #walk-hold=2 holds one picture, for a picture of it. A visitor's address never does. */
    var held = local ? /walk-hold=(\d)/.exec(window.location.hash || '') : null;

    return {
      play: function () {
        if (!place.moving()) return;
        if (held) { var n = Math.min(frames.length, Number(held[1])); ready(n, function () { show(n); place.done(); }); return; }
        if (rested) { rested = false; step = 0; left = 900; }
        wanted = true;
        if (visible && !document.hidden) wait(left);
      },
      pause: function () { wanted = false; hold(); }
    };
  }

  window.MoaPieces = window.MoaPieces || {};
  window.MoaPieces.walk = { mount: mount };
})();
