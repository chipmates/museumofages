(function () {
  var stage = document.getElementById('stage');
  if (/line=linen/.test(location.search)) stage.className = 'linen';
  try {
    /* The same start as on the page: angle 0.6, the line at 40 percent.
       A wide stage sits inside the page and fades at its edges, the phone's square runs to its frame. */
    var api = window.MoaMachine.mount(stage, { angle: 0.6, split: 0.4, fade: window.innerWidth > window.innerHeight ? 1 : 0 });
    if (!api) document.getElementById('err').textContent = 'mount returned null (no webgl2 or a shader error)';
  } catch (e) { document.getElementById('err').textContent = String(e && e.stack || e); }
})();
