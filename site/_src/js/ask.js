/* Museum of Ages, the question for visitors from our Google Ad Grants ads, and the privacy page's button that takes
   a yes back. The edge puts this script on every page under the grant's prefix (/a/g/) but the walk, by the path
   alone (functions/_entry/rules.js): this script, not the server, tests the address for the ad's click id (gclid)
   and the browser for Global Privacy Control. The privacy page carries it for its button. On any other page it
   does nothing, and it reads nothing after the question mark unless the page stands under the grant's prefix.
   Before the answer the click id lives in this page's memory only, and it leaves the address bar at once. A yes
   keeps one entry for this tab (sessionStorage, moa_entry: the click id and the time of the yes), which the walk
   sends once when a wing opens and then deletes (museum/src/core/museum-entry.ts). A no, or closing the card,
   keeps nothing. No cookie, nothing in localStorage. The count hears the answer as a word (the moa:answer event,
   count.js), never the click id. The build puts every built language's words in WORDS. */
(function () {
  'use strict';
  var doc = document, win = window, root = doc.documentElement, loc = win.location;
  if (root.hasAttribute('data-ask')) return;
  root.setAttribute('data-ask', '');
  var HOSTS = ['museumofages.org', 'www.museumofages.org', '127.0.0.1', 'localhost'];
  var GRANT = '/a/g/', WALK = '/a/g/w/';
  var CLICK = /^[A-Za-z0-9_-]{20,200}$/;
  var ENTRY_KEY = 'moa_entry';
  var YES_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  var SECTION = 'question';
  /* Google's own page on how it uses data from sites like ours */
  var GOOGLE = 'https://business.safety.google/privacy';
  var WORDS = {/*words*/};
  if (HOSTS.indexOf(loc.hostname) < 0) return;
  var t = WORDS[root.getAttribute('lang')];
  if (!t) return;
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

  /* the question: a band in the page's flow under the header, so it covers nothing and does not follow the reader */
  function ask(gclid) {
    var card = el('aside', 'ask');
    card.setAttribute('aria-labelledby', 'ask-q');
    var inner = el('div', 'wrap ask__in');
    card.appendChild(inner);
    var close = button('ask__close');
    close.setAttribute('aria-label', t.close);
    var head = el('div', 'ask__head');
    head.appendChild(el('p', 'ask__kicker', t.kicker));
    var q = el('h2', 'ask__q', t.q);
    q.id = 'ask-q';
    head.appendChild(q);
    var body = el('div', 'ask__body');
    body.appendChild(el('p', 'ask__why', t.why));
    body.appendChild(el('p', 'ask__what', t.what));
    body.appendChild(el('p', 'ask__what', t.whom));
    body.appendChild(el('p', 'ask__age', t.age));
    var act = el('div', 'ask__act');
    var answers = el('div', 'ask__answers');
    var yes = button('ask__btn', t.yes), no = button('ask__btn', t.no);
    answers.appendChild(yes);
    answers.appendChild(no);
    /* both open a new tab, so the question waits here while the details are read */
    function newTab(cls, text, href) {
      var a = el('a', 'ask__more ' + cls, text);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.appendChild(el('span', 'vh', ' (' + t.newtab + ')'));
      return a;
    }
    var links = el('div', 'ask__links');
    links.appendChild(newTab('ask__ours', t.more, t.privacy + '#' + SECTION));
    links.appendChild(newTab('ask__google', t.google, GOOGLE));
    act.appendChild(answers);
    act.appendChild(links);
    [close, head, body, act].forEach(function (n) { inner.appendChild(n); });

    function away() {
      var had = card.contains(doc.activeElement);
      card.remove();
      var main = doc.getElementById('main');
      if (had && main) {
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        try { main.focus({ preventScroll: true }); } catch (e) { main.focus(); }
      }
    }
    function said(word) {
      gclid = '';
      tell(word);
      away();
    }
    no.addEventListener('click', function () { said('no'); });
    close.addEventListener('click', function () { said('no'); });
    yes.addEventListener('click', function () {
      if (!keep(gclid)) { said('no'); return; }
      gclid = '';
      tell('yes');
      /* the same place takes the yes back, as long as the walk has not opened */
      inner.textContent = '';
      card.className = 'ask ask--said';
      card.removeAttribute('aria-labelledby');
      card.setAttribute('aria-label', t.kicker);
      var hide = button('ask__close');
      hide.setAttribute('aria-label', t.dismiss);
      var thanks = el('p', 'ask__thanks', t.thanks);
      thanks.id = 'ask-thanks';
      var back = button('ask__btn ask__back', t.undo);
      back.setAttribute('aria-describedby', 'ask-thanks');
      hide.addEventListener('click', away);
      back.addEventListener('click', function () {
        drop();
        thanks.textContent = t.undone;
        thanks.setAttribute('role', 'status');
        back.remove();
        hide.focus();
      });
      [hide, thanks, back].forEach(function (n) { inner.appendChild(n); });
      back.focus();
    });

    /* between the header and the page's content, which keeps its own space above it */
    var main = doc.getElementById('main') || doc.querySelector('main');
    if (!main || !main.parentNode) { doc.body.appendChild(card); return; }
    /* a reader already scrolled down keeps the line being read where it was */
    var scrolled = (win.scrollY || 0) > 0, before = main.getBoundingClientRect().top;
    main.parentNode.insertBefore(card, main);
    var moved = main.getBoundingClientRect().top - before;
    if (scrolled && moved > 0.5) win.scrollBy(0, moved);
  }

  function start() {
    var mount = doc.querySelector('[data-undo]');
    if (mount) withSheet(function () { control(mount); });
    var gclid = clickId();
    if (gclid && store()) withSheet(function () { ask(gclid); });
  }
  if (doc.prerendering) doc.addEventListener('prerenderingchange', start, { once: true });
  else start();
})();
