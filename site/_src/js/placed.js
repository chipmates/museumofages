/* Museum of Ages, the walk opened under an address we place ourselves (/a/<letter>/w/...). The walk finds its wing
   in its own path, so the prefix comes off the address before the walk's code runs (this script stands first in
   the page's head, put there by functions/a/[x]/[[path]].js). The edge has already set the visit's source word on
   the page. A via part of the fragment goes too, so that word stays first, as the path's prefix would have been. */
(function () {
  'use strict';
  var loc = window.location;
  var m = /^\/a\/[gpfo](\/w\/[^\/]+\/?)$/.exec(loc.pathname);
  if (!m) return;
  var parts = loc.hash.replace(/^#/, '').split('&').filter(function (p) { return p && !/^via=/.test(p); });
  try {
    window.history.replaceState(window.history.state, '', m[1] + loc.search + (parts.length ? '#' + parts.join('&') : ''));
  } catch (e) { /* the walk then opens on its lobby, as for any address it does not know */ }
})();
