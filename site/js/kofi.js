/* VoidPixlr — Ko-fi widget bootstrap.
 *
 * Runs immediately after the Ko-fi widget script (Widget_2.js), which
 * defines the global kofiwidget2. Kept in its own file so the page can be
 * served under a strict Content-Security-Policy without 'unsafe-inline'.
 *
 * The widget is a nicety. If the script is blocked, the network is down or
 * Ko-fi is having a bad day, the page carries on without it — the canvas
 * does not care, and the canvas is the point.
 *
 * The widget brings its own web font (Quicksand, from Google), which is why
 * the site's CSP names fonts.googleapis.com and fonts.gstatic.com. See
 * ops/nginx/voidpixlr-headers.conf.
 */
(function () {
  'use strict';
  if (!window.kofiwidget2 || !window.kofiwidget2.init) return;
  try {
    kofiwidget2.init('Buy me a Caffeinated Drink', '#4f4fff', 'R5E3224KOP');
    kofiwidget2.draw();
  } catch (e) {
    /* The widget is a nicety — never let it take the page down. */
  }
})();
