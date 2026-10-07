/**
 * text-roll.js — "slot machine" hover on buttons: each letter slides up out of
 * view while a copy rolls in from below, one letter just after another.
 *
 * Wraps the text of every element matching SELECTOR (icons / arrows inside
 * them are left alone). Each letter becomes
 *   <span class="roll__ch" style="--i:n"><span class="roll__in"><span>a</span><span>a</span></span></span>
 * and css (.roll in css/pages/home-scales.css) moves .roll__in up on hover.
 * Screen readers get the plain label via aria-label.
 */
(() => {
  const SELECTOR = '.nav-info__links > a, .nav-info__contact, .outro-btn, .outro-links a';

  for (const el of document.querySelectorAll(SELECTOR)) {
    const textNodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    if (!textNodes.length) continue;
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' '));
    el.classList.add('has-roll');
    let i = 0;
    for (const node of textNodes) {
      const text = node.textContent.replace(/\s+$/, '');
      const trail = node.textContent.slice(text.length);   // keep the space before an arrow etc.
      const roll = document.createElement('span');
      roll.className = 'roll';
      roll.setAttribute('aria-hidden', 'true');
      for (const ch of text.replace(/^\s+/, '')) {
        const c = ch === ' ' ? ' ' : ch;
        const wrap = document.createElement('span');
        wrap.className = 'roll__ch';
        wrap.style.setProperty('--i', i++);
        wrap.innerHTML = '<span class="roll__in"><span></span><span></span></span>';
        wrap.querySelectorAll('.roll__in > span').forEach(s => { s.textContent = c; });
        roll.appendChild(wrap);
      }
      node.replaceWith(roll, ...(trail ? [document.createTextNode(trail)] : []));
    }
  }
})();
