/**
 * nav-clock.js — live local time in the home page's name badge
 * ("Mahshid Mahmoudian ········ 2:15 PM EDT"). Toronto time, matching the
 * "Currently in Toronto, Canada" line in the Contact panel; the zone label
 * (EDT/EST) follows daylight saving on its own.
 */
(() => {
  const el = document.getElementById('nav-time');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
  const tick = () => { el.textContent = fmt.format(new Date()); };
  tick();
  // update on the minute, not on a drifting 60s interval
  setTimeout(function again() { tick(); setTimeout(again, 60000 - (Date.now() % 60000) + 50); },
             60000 - (Date.now() % 60000) + 50);
})();
