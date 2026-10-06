/* A stand-in piece, test only: it shows that a place keeps its contract. It walks through the three beats over
   the still (the caption changes, the grades appear at the third beat), then rests. If its place names a clip,
   the clip plays over the still from the second beat until the rest. A real piece is made the same way: it
   registers under its name and gets the place's box and its calls. */
(function () {
  'use strict';
  window.MoaPieces = window.MoaPieces || {};
  window.MoaPieces['stand-in'] = {
    mount: function (box, place) {
      var beat = 0, timer = 0, running = false, film = null;
      if (place.clip) {
        film = document.createElement('video');
        film.className = 'piece';
        film.muted = true; film.playsInline = true; film.preload = 'auto'; film.hidden = true;
        film.src = place.clip;
        box.appendChild(film);
      }
      function rest() {
        beat = 0; running = false;
        if (film) { film.pause(); film.hidden = true; }
        place.beat(0); place.grades(false); place.done();
      }
      function step() {
        if (!running) return;
        beat += 1;
        if (beat > 3) { rest(); return; }
        place.beat(beat);
        place.grades(beat === 3);
        if (film && beat === 2) { film.hidden = false; film.currentTime = 0; film.play().catch(function () {}); }
        timer = window.setTimeout(step, 2600);
      }
      return {
        play: function () { if (running || !place.moving()) return; running = true; timer = window.setTimeout(step, 400); },
        pause: function () { running = false; window.clearTimeout(timer); if (film) film.pause(); }
      };
    }
  };
})();
