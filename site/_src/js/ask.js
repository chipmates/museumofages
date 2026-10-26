/* Museum of Ages, the question for visitors from our Google Ad Grants ads, and the privacy page's button that takes
   a yes back. The edge puts this script on every page under the grant's prefix (/a/g/) but the walk and the own page
   of a wing in the making, unless the request carries the Global Privacy Control header (functions/_entry/rules.js):
   this script, not the server, tests the address for the ad's click id (gclid), and tests the browser for Global
   Privacy Control once more. The privacy page carries it for its button. On any other page it does nothing, and it
   reads nothing after the question mark unless the page stands under the grant's prefix.
   The click id leaves the address bar at once and lives in this page's memory only until the answer. The question
   is not asked on arrival: the card comes once the visitor reads, at the first of the middle of the page's text
   coming into view (the moment the count calls page_read) and 45 seconds with the page in view, hidden time not
   counted, and only when the page has stopped moving. A press on a way into the walk before then means no question
   on this visit. The wait stores and sends nothing.
   A yes sends the visit at once, one POST to the site's own function (functions/v1/entry.js, the click id, the time
   of the yes and the word visit). On a page from which a wing can be entered it also keeps one entry for this tab
   (sessionStorage, moa_entry: the click id and the time of the yes), which the walk sends once when a wing opens and
   then deletes (museum/src/core/museum-entry.ts). A topic page of a wing in the making (main[data-asks="visit"]) has
   no way into a walk: a yes there sends the visit and keeps nothing. A no, or closing the card, keeps and sends
   nothing. No cookie, nothing in localStorage. The count hears the answer as a word (the moa:answer event: yes, no,
   or close for the X, which also means no) and that the card was seen (moa:shown), never the click id (count.js).
   The build puts every built language's words in WORDS; a language without every word of this card shows none. */
(function () {
  'use strict';
  var doc = document, win = window, root = doc.documentElement, loc = win.location;
  /* a page of a wing in the making is never asked, whatever its address carries: the edge never sends this script
     there, and should it arrive anyway it does nothing at all */
  if (doc.querySelector('main[data-unasked]')) return;
  /* a topic page of a wing in the making: a yes counts the visit alone, since no wing can be entered from it */
  var visitOnly = !!doc.querySelector('main[data-asks="visit"]');
  if (root.hasAttribute('data-ask')) return;
  root.setAttribute('data-ask', '');
  var HOSTS = ['museumofages.org', 'www.museumofages.org', '127.0.0.1', 'localhost'];
  var GRANT = '/a/g/', WALK = '/a/g/w/';
  var CLICK = /^[A-Za-z0-9_-]{20,200}$/;
  var ENTRY_KEY = 'moa_entry';
  var YES_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  var ENDPOINT = '/v1/entry', VISIT_KIND = 'visit';
  var SECTION = 'question';
  /* Google's own page on how it uses data from sites like ours */
  var GOOGLE = 'https://business.safety.google/privacy';
  /* the moment: this long with the page in view, unless the reader reaches the middle of the text first */
  var VISIBLE_MS = 45 * 1000;
  /* the card waits for the page to stand still this long, so it never slides in under a moving page */
  var SETTLE_MS = 400;
  /* a tap already on its way when the card appears answers nothing */
  var STILL_MS = 700;
  /* the card's words, as site/_src/ask.py names them: a language holds all of them or gets no card */
  var CARD = ['kicker', 'question', 'text', 'text2', 'under16', 'tell', 'decline', 'more', 'google', 'newtab', 'close',
    'dismiss', 'how_number', 'how_sent', 'how_account', 'how_age', 'full', 'told'];
  var VISIT = ['visit_text', 'visit_text2', 'visit_how_sent', 'visit_how_account', 'visit_how_age', 'visit_told'];
  var WORDS = {/*words*/};
  if (HOSTS.indexOf(loc.hostname) < 0) return;
  var t = WORDS[root.getAttribute('lang')];
  if (!t) return;
  function written(keys) {
    return keys.every(function (k) { return typeof t[k] === 'string' && t[k] !== ''; });
  }
  var worded = written(CARD) && (!visitOnly || written(VISIT));
  var me = doc.currentScript;
  var base = me && me.src ? me.src.replace(/ask\.js(?:[?#].*)?$/, '') : '/static/';

  function store() {
    try { return win.sessionStorage || null; } catch (e) { return null; }
  }
  /* the tab's yes, while it is whole and younger than six hours; anything else is dropped */
  function held() {
    var s = store();
    if (!s) return null;
    try {
      var raw = s.getItem(ENTRY_KEY);
      if (raw === null) return null;
      var e = JSON.parse(raw), now = Date.now();
      if (e && typeof e.gclid === 'string' && CLICK.test(e.gclid) && typeof e.yes === 'number' && e.yes <= now &&
          now - e.yes < YES_MAX_AGE_MS) return e;
    } catch (err) { /* a broken entry is dropped below */ }
    drop();
    return null;
  }
  function drop() {
    var s = store();
    try { if (s) s.removeItem(ENTRY_KEY); } catch (e) { /* nothing was kept */ }
  }
  function keep(gclid) {
    var s = store();
    if (!s) return false;
    try { s.setItem(ENTRY_KEY, JSON.stringify({ gclid: gclid, yes: Date.now() })); return true; } catch (e) { return false; }
  }
  /* the yes itself, once per page load, the click id and the time of the yes only; never with Global Privacy Control */
  var visitSent = false;
  function sendVisit(gclid, yes) {
    if (visitSent || navigator.globalPrivacyControl === true || !CLICK.test(gclid)) return;
    visitSent = true;
    try {
      win.fetch(ENDPOINT, { method: 'POST', body: JSON.stringify({ gclid: gclid, yes: yes, kind: VISIT_KIND }), keepalive: true,
        mode: 'same-origin', credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) { /* a visit never stands in the page's way */ }
  }
  function tell(word) {
    try { doc.dispatchEvent(new CustomEvent('moa:answer', { detail: word })); } catch (e) { /* the count is not told */ }
  }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function button(cls, text) {
    var b = el('button', cls, text);
    b.type = 'button';
    return b;
  }
  /* the card's look, once; nothing is shown before it has arrived */
  var styled = null;
  function withSheet(fn) {
    if (styled) { styled.push(fn); return; }
    styled = [fn];
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'ask.css';
    link.onload = function () { var waiting = styled; styled = { push: function (f) { f(); } }; waiting.forEach(function (f) { f(); }); };
    doc.head.appendChild(link);
  }

  /* the privacy page: what this tab holds, and the button that takes a yes back */
  function control(mount) {
    var yes = held();
    var state = el('p', 'undo__state', yes ? t.held : t.none);
    state.setAttribute('role', 'status');
    mount.textContent = '';
    mount.appendChild(state);
    if (yes) {
      var back = button('ask__btn undo__btn', t.undo);
      back.addEventListener('click', function () {
        drop();
        state.textContent = t.undone;
        back.remove();
      });
      mount.appendChild(back);
    }
    mount.hidden = false;
  }

  /* the ad's click id from this address, or ''; read only under the grant's prefix */
  function clickId() {
    if (navigator.globalPrivacyControl === true) return '';
    if (loc.pathname.indexOf(GRANT) !== 0 || loc.pathname.indexOf(WALK) === 0) return '';
    var found = '', rest = [];
    loc.search.replace(/^\?/, '').split('&').forEach(function (part) {
      if (!part) return;
      if (part.split('=')[0] === 'gclid') { if (!found) found = part.slice(6); }
      else rest.push(part);
    });
    if (!found) return '';
    /* out of the address bar at once, every other part of the address kept as it was */
    try { win.history.replaceState(win.history.state, '', loc.pathname + (rest.length ? '?' + rest.join('&') : '') + loc.hash); }
    catch (e) { /* the address keeps it, and the question is still asked */ }
    return CLICK.test(found) ? found : '';
  }

  /* the moment to ask, then go(); a way into the walk pressed before it, then gone(). Hidden time is not counted,
     and nothing here is stored, read from storage or sent. */
  function wait(go, gone) {
    var main = doc.getElementById('main') || doc.querySelector('main');
    var over = false, due = false, ticking = 0, rest = 0, timer = 0, spent = 0, since = 0, moved = 0;
    function middle() {
      if (!main) return false;
      var r = main.getBoundingClientRect(), mid = r.top + r.height / 2;
      return !(mid < 0 || mid > win.innerHeight);
    }
    /* in view on arrival is no read: then the time alone brings the moment */
    var unread = !middle();
    function shown() { return doc.visibilityState !== 'hidden'; }
    function end() {
      over = true;
      win.removeEventListener('scroll', scrolled);
      win.removeEventListener('resize', queue);
      doc.removeEventListener('visibilitychange', seen);
      doc.removeEventListener('click', door, true);
      doc.removeEventListener('auxclick', door, true);
      if (timer) win.clearTimeout(timer);
      if (rest) win.clearTimeout(rest);
      timer = rest = 0;
    }
    /* the moment has come: the card follows once the page has stood still for a moment, and the page is in view */
    function soon() {
      if (rest) win.clearTimeout(rest);
      rest = win.setTimeout(settle, SETTLE_MS);
    }
    function settle() {
      rest = 0;
      if (over || !shown()) return;
      var quiet = Date.now() - moved;
      if (quiet < SETTLE_MS) { rest = win.setTimeout(settle, SETTLE_MS - quiet); return; }
      end();
      go();
    }
    function check() {
      ticking = 0;
      if (over) return;
      if (!due && unread && middle()) due = true;
      if (due) soon();
    }
    function queue() { if (!ticking) ticking = win.requestAnimationFrame(check); }
    function scrolled() { moved = Date.now(); queue(); }
    function arm() {
      if (over || due || timer || !shown()) return;
      since = Date.now();
      timer = win.setTimeout(tick, Math.max(0, VISIBLE_MS - spent));
    }
    function tick() {
      timer = 0;
      spent += Date.now() - since;
      if (spent < VISIBLE_MS) { arm(); return; }
      due = true;
      soon();
    }
    function seen() {
      if (over) return;
      if (shown()) { arm(); if (due) soon(); return; }
      if (timer) { win.clearTimeout(timer); timer = 0; spent += Date.now() - since; }
    }
    function door(e) {
      if (over || (e.type === 'auxclick' && e.button !== 1)) return;
      var a = e.target && e.target.closest ? e.target.closest('a[data-door]') : null;
      if (!a) return;
      end();
      gone();
    }
    win.addEventListener('scroll', scrolled, { passive: true });
    win.addEventListener('resize', queue, { passive: true });
    doc.addEventListener('visibilitychange', seen);
    doc.addEventListener('click', door, true);
    doc.addEventListener('auxclick', door, true);
    arm();
  }

  /* the question: a card fixed to the foot of the screen, over the page but never in its way. It dims nothing,
     locks no scroll and traps no focus. While it stands the page gets room at its end and keeps a focused element
     clear of it (scroll-padding), and the phone's own door at the foot waits (ask.css). */
  function ask(gclid) {
    var card = el('section', 'ask');
    card.setAttribute('aria-labelledby', 'ask-q');
    var inner = el('div', 'ask__in');
    card.appendChild(inner);
    /* each control of the card answers only once the card has stood for a moment */
    var still = true;
    win.setTimeout(function () { still = false; }, STILL_MS);
    function on(node, fn) {
      node.addEventListener('click', function (e) {
        if (still) { if (e && e.preventDefault) e.preventDefault(); return; }
        if (fn) fn(e);
      });
      return node;
    }
    var close = on(button('ask__close'), function () { said('close'); });
    close.setAttribute('aria-label', t.close);
    var head = el('div', 'ask__head');
    var q = el('h2', 'ask__q', t.question);
    q.id = 'ask-q';
    head.appendChild(q);
    /* the words scroll here when the screen is short; the answers below them never do */
    var body = el('div', 'ask__body');
    body.appendChild(el('p', 'ask__what', visitOnly ? t.visit_text : t.text));
    body.appendChild(el('p', 'ask__what', visitOnly ? t.visit_text2 : t.text2));
    /* the second layer opens here, inside the card, so the question waits while it is read */
    var how = el('div', 'ask__how');
    how.id = 'ask-how';
    how.hidden = true;
    [t.how_number, visitOnly ? t.visit_how_sent : t.how_sent, visitOnly ? t.visit_how_account : t.how_account,
      visitOnly ? t.visit_how_age : t.how_age].forEach(function (text) { how.appendChild(el('p', 'ask__why', text)); });
    /* the privacy page opens in this tab: its button takes back a yes only in the tab that holds it */
    var full = on(el('a', 'ask__more ask__full', t.full));
    full.href = t.privacy + '#' + SECTION;
    how.appendChild(full);
    body.appendChild(how);
    var act = el('div', 'ask__act');
    /* the age line stands right above the answers on every card and never scrolls out of sight */
    act.appendChild(el('p', 'ask__age', t.under16));
    var answers = el('div', 'ask__answers');
    var yes = button('ask__btn', t.tell), no = on(button('ask__btn', t.decline), function () { said('no'); });
    answers.appendChild(yes);
    answers.appendChild(no);
    var links = el('div', 'ask__links');
    var more = on(button('ask__more ask__open', t.more), function () {
      var open = how.hidden;
      how.hidden = !open;
      more.setAttribute('aria-expanded', open ? 'true' : 'false');
      /* the second layer's first line at the top of the words */
      if (open) body.scrollTop = Math.max(0, how.offsetTop - body.offsetTop);
      queue();
    });
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', 'ask-how');
    /* Google's page opens in a new tab, so the question waits here while it is read */
    var google = on(el('a', 'ask__more ask__google', t.google));
    google.href = GOOGLE;
    google.target = '_blank';
    google.rel = 'noopener';
    google.appendChild(el('span', 'vh', ' (' + t.newtab + ')'));
    links.appendChild(more);
    links.appendChild(google);
    act.appendChild(answers);
    act.appendChild(links);
    [close, head, body, act].forEach(function (n) { inner.appendChild(n); });

    /* the room the card takes from the foot of the screen, given to the page's end and to focus scrolling */
    var sized = 0;
    function room() {
      sized = 0;
      if (!card.isConnected) return;
      /* from the layout, not the drawn box, which the arrival's rise still moves */
      var gap = parseFloat(win.getComputedStyle(card).bottom) || 0;
      root.style.setProperty('--ask-room', Math.ceil(card.offsetHeight + gap) + 'px');
      /* a body that scrolls is reached by the keyboard too */
      if (body.isConnected && body.scrollHeight > body.clientHeight + 1) body.setAttribute('tabindex', '0');
      else body.removeAttribute('tabindex');
      end();
    }
    function end() {
      body.classList.toggle('is-end', body.scrollTop + body.clientHeight >= body.scrollHeight - 2);
      body.classList.toggle('is-top', body.scrollTop <= 1);
    }
    body.addEventListener('scroll', end, { passive: true });
    function queue() { if (!sized) sized = win.requestAnimationFrame(room); }
    var watch = typeof ResizeObserver === 'function' ? new ResizeObserver(queue) : null;

    /* shown: at least half the card in view for one second, once; without an observer, once it is placed */
    var seen = null, timer = 0, told = false;
    function shown() {
      if (told) return;
      told = true;
      try { doc.dispatchEvent(new CustomEvent('moa:shown')); } catch (e) { /* the count is not told */ }
    }
    function unseen() {
      if (timer) { win.clearTimeout(timer); timer = 0; }
      if (seen) { seen.disconnect(); seen = null; }
    }

    function away() {
      var had = card.contains(doc.activeElement);
      unseen();
      if (watch) watch.disconnect();
      win.removeEventListener('resize', queue);
      if (sized) win.cancelAnimationFrame(sized);
      card.remove();
      root.classList.remove('is-asking');
      root.style.removeProperty('--ask-room');
      var main = doc.getElementById('main');
      if (had && main) {
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        try { main.focus({ preventScroll: true }); } catch (e) { main.focus(); }
      }
    }
    function said(word) {
      gclid = '';
      unseen();
      tell(word);
      away();
    }
    on(yes, function () {
      /* one answer per card: the click id is gone once it is given */
      if (!gclid) return;
      var at = Date.now(), click = gclid, before = visitOnly ? null : held();
      if (!visitOnly && !keep(click)) { said('no'); return; }
      gclid = '';
      unseen();
      tell('yes');
      /* a yes this tab already holds for the same click was counted when it was given */
      if (!before || before.gclid !== click) sendVisit(click, at);
      /* the same place takes the yes back, as long as the walk has not opened */
      inner.textContent = '';
      card.className = 'ask ask--said';
      card.removeAttribute('aria-labelledby');
      card.setAttribute('aria-label', t.kicker);
      var hide = button('ask__close');
      hide.setAttribute('aria-label', t.dismiss);
      var thanks = el('p', 'ask__thanks', visitOnly ? t.visit_told : t.told);
      thanks.id = 'ask-thanks';
      hide.addEventListener('click', away);
      /* nothing is kept where the yes counts the visit alone, so there is nothing to take back */
      if (visitOnly) {
        [hide, thanks].forEach(function (n) { inner.appendChild(n); });
        thanks.setAttribute('role', 'status');
        hide.focus();
        queue();
        return;
      }
      var back = button('ask__btn ask__back', t.undo);
      back.setAttribute('aria-describedby', 'ask-thanks');
      back.addEventListener('click', function () {
        drop();
        thanks.textContent = t.undone;
        thanks.setAttribute('role', 'status');
        back.remove();
        hide.focus();
      });
      [hide, thanks, back].forEach(function (n) { inner.appendChild(n); });
      back.focus();
      queue();
    });

    /* before the page's content in reading order, as before; on the screen it stands at the foot */
    var main = doc.getElementById('main') || doc.querySelector('main');
    if (main && main.parentNode) main.parentNode.insertBefore(card, main);
    else doc.body.appendChild(card);
    root.classList.add('is-asking');
    room();
    if (watch) watch.observe(card);
    win.addEventListener('resize', queue, { passive: true });

    if (typeof IntersectionObserver !== 'function') { shown(); return; }
    seen = new IntersectionObserver(function (entries) {
      var half = entries.some(function (en) { return en.intersectionRatio >= 0.5; });
      if (half && !timer) timer = win.setTimeout(function () { timer = 0; shown(); unseen(); }, 1000);
      else if (!half && timer) { win.clearTimeout(timer); timer = 0; }
    }, { threshold: 0.5 });
    seen.observe(card);
  }

  function start() {
    var mount = doc.querySelector('[data-undo]');
    if (mount) withSheet(function () { control(mount); });
    var gclid = clickId();
    if (!gclid || !worded || !(visitOnly || store())) return;
    /* the card's look arrives while the visitor reads */
    withSheet(function () {});
    wait(function () { withSheet(function () { if (gclid) ask(gclid); }); }, function () { gclid = ''; });
  }
  if (doc.prerendering) doc.addEventListener('prerenderingchange', start, { once: true });
  else start();
})();
