/* The music under the landing's film. It starts only from a press on the film's control (a browser plays sound
   only after a gesture), follows that control's pauses, and fades out when the film gives the frame back to the
   still. Its address and the sound button's words come from the place (data-music, data-sound-on, data-sound-off). */
(function () {
  var fig = document.querySelector('figure[data-press][data-music]');
  if (!fig) return;
  var btn = fig.querySelector('[data-place-toggle]');
  var title = fig.querySelector('.label__title');
  var filmTitle = fig.getAttribute('data-film-title');
  var more = btn ? btn.getAttribute('data-go-more') : null;
  var a = new Audio(fig.getAttribute('data-music'));
  a.preload = 'none';
  var muted = false, fading = null, LOUD = 0.6;

  var sound = document.createElement('button');
  sound.type = 'button';
  sound.className = 'snd';
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  function path(d, cls) {
    var e = document.createElementNS(NS, 'path');
    e.setAttribute('d', d); e.setAttribute('fill', 'none'); e.setAttribute('stroke', 'currentColor');
    e.setAttribute('stroke-width', '1.6'); e.setAttribute('stroke-linejoin', 'round');
    if (cls) e.setAttribute('class', cls);
    svg.appendChild(e);
  }
  path('M4 9.5h3.5L12 6v12l-4.5-3.5H4z');
  path('M15 9.5c1 .8 1.5 1.6 1.5 2.5s-.5 1.7-1.5 2.5M17.5 7c1.8 1.4 2.7 3 2.7 5s-.9 3.6-2.7 5', 'snd__waves');
  path('M15.5 9.5l5 5M20.5 9.5l-5 5', 'snd__mute');
  var text = document.createElement('span');
  text.className = 'snd__t';
  sound.appendChild(svg); sound.appendChild(text);
  var on = fig.getAttribute('data-sound-on') || 'Sound on', off = fig.getAttribute('data-sound-off') || 'Sound off';
  function label() { text.textContent = muted ? on : off; sound.setAttribute('aria-pressed', muted ? 'true' : 'false'); }
  label();
  sound.hidden = true;   // it stands beside the film only while the film is out
  if (btn) btn.insertAdjacentElement('afterend', sound);
  sound.addEventListener('click', function () { muted = !muted; a.muted = muted; label(); });

  function stopFade() { if (fading) { clearInterval(fading); fading = null; } }
  function fadeOut(done) {
    stopFade();
    var v = a.volume;
    fading = setInterval(function () {
      v -= LOUD / 15;
      if (v <= 0.02) { stopFade(); a.pause(); a.volume = LOUD; if (done) done(); } else a.volume = v;
    }, 100);
  }

  if (btn) btn.addEventListener('click', function () {
    var before = (btn.textContent || '').trim();
    var starting = before !== btn.getAttribute('data-stop');
    if (!starting) { stopFade(); a.pause(); return; }
    stopFade();
    sound.hidden = false;
    fig.classList.add('is-film');
    a.volume = LOUD;
    if (more && before.indexOf(more) === 0) a.currentTime = 0;   // the whole film starts from its beginning
    var p = a.play(); if (p && p.catch) p.catch(function () {});
  }, true);

  if (title) new MutationObserver(function () {
    var showing = (title.textContent || '').trim() === filmTitle;
    if (!showing) { sound.hidden = true; fig.classList.remove('is-film'); }
    if (!showing && !a.paused) fadeOut(function () { a.currentTime = 0; });
  }).observe(title, { childList: true, characterData: true, subtree: true });
})();
