/* Museum of Ages, the pages' count. Plain totals with no key between them, each at most once per page load:
   page_arrival (the page opened), page_read (the middle of the page's text came into view), door_press (a way
   into the walk was pressed, by its place), ask_shown (the question for visitors from our grant ads was seen,
   which ask.js announces with the moa:shown event) and ask_yes, ask_no or ask_close (its answer, announced with
   the moa:answer event; close is the X, which also means no), and on a page of a wing in the making guess_open
   (the guess's answer was opened) and out_wing (the plain link to an open wing's page was followed). Each beacon
   carries the page's kind, its language and, on arrival, whether the visit began here with the source word the edge
   set on the page (data-source). The read, the guess and the link out carry those same two fields again, from the
   same attribute, nothing more. For the count nothing is stored and nothing is read from storage, except the mark our
   own test browsers carry. Nothing after the question mark is read, except probe=1. The server's answer is never read.
   The click id a yes keeps in the tab is ask.js's alone: the count never reads it and never sends it. */
(function () {
  'use strict';
  var doc = document, win = window, root = doc.documentElement, loc = win.location;
  var HOSTS = ['museumofages.org', 'www.museumofages.org', '127.0.0.1', 'localhost'];
  var SOURCES = ['direct', 'search', 'ad_grant', 'ad_paid', 'ad_forum', 'forum', 'code', 'edu', 'wiki', 'news',
    'mail', 'award', 'assistant', 'social', 'referral'];
  var DOORS = ['top', 'item', 'end'];
  var PROBE = 'moa_probe';
  if (HOSTS.indexOf(loc.hostname) < 0 || !navigator.sendBeacon) return;
  var me = doc.currentScript || doc.querySelector('script[data-count]');
  var page = me ? me.getAttribute('data-count') : '';
  var language = root.getAttribute('lang') || '';
  if (!page || !language) return;

  /* our own test browsers: an address with probe=1 marks the browser, and its rows say probe */
  var probe = false;
  try {
    if (/(?:^|[?&])probe=1(?:&|$)/.test(loc.search)) win.localStorage.setItem(PROBE, '1');
    probe = win.localStorage.getItem(PROBE) === '1';
  } catch (e) { probe = false; }

  function send(step, fields) {
    fields.step = step; fields.page = page; fields.language = language;
    if (probe) fields.probe = 1;
    try { navigator.sendBeacon('/v1/funnel', JSON.stringify(fields)); } catch (e) { /* a count never stands in the way */ }
  }

  /* where the visit came from, as the edge saw the page request: a word when it began here, empty when it came
     from this site, no attribute where no edge stood (a local file server) */
  var from = root.getAttribute('data-source');
  var arrival = {};
  if (from === '') arrival.start = 0;
  else if (SOURCES.indexOf(from) >= 0) { arrival.start = 1; arrival.source = from; }
  /* a fresh copy for each beacon that carries them, since send() writes into the object it is given */
  function begun() {
    var f = {};
    if (arrival.start !== undefined) f.start = arrival.start;
    if (arrival.source !== undefined) f.source = arrival.source;
    return f;
  }

  /* a visit that began here hands its word to the walk, in the door's fragment */
  if (arrival.start === 1) {
    doc.querySelectorAll('a[data-door]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      a.setAttribute('href', href + (href.indexOf('#') >= 0 ? '&' : '#') + 'via=' + from);
    });
  }

  function arrive() { send('page_arrival', begun()); watchRead(); }

  function watchRead() {
    var main = doc.getElementById('main') || doc.querySelector('main');
    if (!main) return;
    var ticking = false, done = false;
    function check() {
      ticking = false;
      if (done) return;
      var r = main.getBoundingClientRect(), mid = r.top + r.height / 2;
      if (mid < 0 || mid > win.innerHeight) return;
      done = true;
      win.removeEventListener('scroll', queue);
      win.removeEventListener('resize', queue);
      send('page_read', begun());
    }
    function queue() { if (!ticking) { ticking = true; win.requestAnimationFrame(check); } }
    win.addEventListener('scroll', queue, { passive: true });
    win.addEventListener('resize', queue, { passive: true });
    queue();
  }

  var pressed = false;
  function press(e) {
    if (pressed || (e.type === 'auxclick' && e.button !== 1)) return;
    var a = e.target && e.target.closest ? e.target.closest('a[data-door]') : null;
    var place = a ? a.getAttribute('data-door') : '';
    if (DOORS.indexOf(place) < 0) return;
    pressed = true;
    send('door_press', { door: place });
  }
  doc.addEventListener('click', press, true);
  doc.addEventListener('auxclick', press, true);

  /* the question seen, and its answer as a word: never the click id, never the time */
  var ANSWERS = ['yes', 'no', 'close'];
  var seen = false, answered = false;
  doc.addEventListener('moa:shown', function () {
    if (seen) return;
    seen = true;
    send('ask_shown', {});
  });
  doc.addEventListener('moa:answer', function (e) {
    var said = e && e.detail;
    if (answered || ANSWERS.indexOf(said) < 0) return;
    answered = true;
    send('ask_' + said, {});
  });

  /* a page of a wing in the making: the guess's answer opened, and the link to an open wing followed, each a step
     alone. A details element's toggle does not bubble, so it is heard on its way down. */
  var guessed = false, left = false;
  doc.addEventListener('toggle', function (e) {
    var d = e.target;
    if (guessed || !d || !d.matches || !d.matches('details[data-guess]') || !d.open) return;
    guessed = true;
    send('guess_open', begun());
  }, true);
  function leave(e) {
    if (left || (e.type === 'auxclick' && e.button !== 1)) return;
    var a = e.target && e.target.closest ? e.target.closest('a[data-out]') : null;
    if (!a || a.getAttribute('data-out') !== 'wing') return;
    left = true;
    send('out_wing', begun());
  }
  doc.addEventListener('click', leave, true);
  doc.addEventListener('auxclick', leave, true);

  /* a page the browser renders ahead counts once it is shown */
  if (doc.prerendering) doc.addEventListener('prerenderingchange', arrive, { once: true });
  else arrive();
})();
