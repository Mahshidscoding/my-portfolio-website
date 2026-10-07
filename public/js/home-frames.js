/**
 * home-frames.js — the scroll "frames" for the home page, index.html (read by js/home-scales.js).
 *
 * The grid is fixed at `cols` × `rows`. Row 0 holds the name badge (left) and
 * the nav (right); cells are counted from 0, top-left.
 *
 * blocks: rectangles of cells — c, r = top-left cell, w, h = size in cells.
 *         Optional `html` is shown inside the block once its tiles have flipped
 *         away; `cls` styles it (see "scroll frames" in css/pages/home-scales.css).
 * frames: one per scroll step.
 *         open — block ids. Tiles under an open block flip away; tiles no longer
 *                covered flip back. A block that stays open from one frame to
 *                the next keeps its text without re-animating.
 *         fly  — optional images that grow out of the centre of the `flyFrom`
 *                block and slide off to the sides as you scroll, spaced evenly
 *                through the frame. From the first frame with `fly` to the end,
 *                scrolling is continuous (scrubbing) instead of one step per
 *                gesture.
 *
 * After the last image, more scrolling slides the grid away and brings in the
 * Work / Contact section (.outro in index.html; its timing is the
 * data-outro attributes there).
 */
window.HOME_FRAMES = {
  cols: 10,
  rows: 5,

  blocks: {
    // frame 1 — middle row
    role:  { c: 0, r: 2, w: 2, h: 1, cls: 'fr-small fr-left',
             html: 'Senior Experience Designer,<br>Currently at Konrad Group' },
    photo: { c: 4, r: 2, w: 1, h: 1, cls: 'fr-photo',
             html: '<div class="fr-photo__img" role="img" aria-label="Portrait of Mahshid Mahmoudian"></div>' },
    name:  { c: 5, r: 2, w: 1, h: 1, cls: 'fr-name',
             html: '<span>Mahshid</span><span>Mahmoudian</span>' },
    next:  { c: 8, r: 2, w: 2, h: 1, cls: 'fr-small fr-right',
             html: 'Working on what digital<br>interaction becomes next' },

    // frame 2 — the centre block
    bio:   { c: 2, r: 1, w: 6, h: 3, cls: 'fr-para',
             // hand-set line breaks; the first line is right-aligned so it ends with the others
             html: '<p><span class="fr-para__first">I’m a designer and an artist.</span>' +
                   'I’ve led branding and visual direction on<br>' +
                   'the products I’ve worked on, and created<br>' +
                   'full identities from scratch. I work in XR,<br>' +
                   'make music, and play with sound design.<br>' +
                   'The mix is what lets me think in layers.</p>' },

    // frames 3–5 — bottom two rows clear, one line at a time
    below: { c: 0, r: 3, w: 10, h: 2 },
    line1: { c: 1, r: 1, w: 2, h: 1, cls: 'fr-line', html: 'I don’t think in straight lines,' },
    line2: { c: 4, r: 1, w: 2, h: 1, cls: 'fr-line', html: 'I experiment until it clicks,' },
    line3: { c: 7, r: 1, w: 2, h: 1, cls: 'fr-line', html: 'and iterate until it’s right.' },
  },

  flyFrom: 'below',

  frames: [
    { open: ['role', 'photo', 'name', 'next'] },
    { open: ['bio'] },
    { open: ['below', 'line1'],
      fly: ['images/home-fly/tembo-popout.jpg', 'images/home-fly/arch.jpg'] },
    { open: ['below', 'line1', 'line2'],
      fly: ['images/home-fly/sqlite.jpg', 'images/home-fly/bm.jpg', 'images/home-fly/arch.jpg'] },
    { open: ['below', 'line1', 'line2', 'line3'],
      fly: ['images/home-fly/descript.jpg', 'images/home-fly/commandfreak.jpg', 'images/home-fly/tembo.jpg'] },
  ],
};
