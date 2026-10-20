// Train card faces: our own small drawings (one wagon shape per colour, a locomotive for the wild card).
(function (root) {
  'use strict';
  const FILL = {
    pink: ['#e79be1', '#b85cb0'], white: ['#ffffff', '#c9cdd8'], blue: ['#7aaef7', '#2f6fd6'], yellow: ['#f7dc6e', '#d9ac1f'],
    orange: ['#f6ad65', '#d8701c'], black: ['#4a5060', '#1d2029'], red: ['#ee7a76', '#c23531'], green: ['#79d690', '#2f9a4c'],
    loco: ['#c9b8ff', '#7c63e0'],
  };
  const INK = { white: '#2b2f3a', yellow: '#2b2f3a' };
  // wagon bodies drawn in a 50x30 box, wheels added below
  const BODY = {
    pink: '<rect x="4" y="6" width="42" height="16" rx="3"/><rect x="8" y="9" width="6" height="5" rx="1" class="w"/><rect x="17" y="9" width="6" height="5" rx="1" class="w"/><rect x="26" y="9" width="6" height="5" rx="1" class="w"/><rect x="35" y="9" width="6" height="5" rx="1" class="w"/>',
    white: '<rect x="4" y="5" width="42" height="17" rx="2"/><path d="M14 5v17M25 5v17M36 5v17" class="l"/>',
    blue: '<rect x="4" y="5" width="42" height="17" rx="2"/><rect x="20" y="8" width="10" height="12" class="w"/>',
    yellow: '<rect x="4" y="8" width="42" height="14" rx="7"/><rect x="22" y="4" width="6" height="5" rx="1"/>',
    orange: '<path d="M4 9h42l-5 13H9z"/><path d="M8 9l5-4h24l5 4" class="l"/>',
    black: '<path d="M5 8h40l-4 14H9z"/><path d="M10 8c3-4 7-4 10 0c3-4 7-4 10 0c3-4 7-4 10 0" class="l"/>',
    red: '<rect x="8" y="9" width="34" height="13" rx="2"/><rect x="18" y="3" width="14" height="7" rx="1"/><rect x="21" y="5" width="8" height="4" class="w"/>',
    green: '<rect x="4" y="6" width="42" height="16" rx="2"/><path d="M4 12h42M4 16h42" class="l"/>',
    loco: '<path d="M6 22V11h8V6h9v5h9l10 6v5z"/><rect x="34" y="5" width="5" height="7" rx="1"/><rect x="16" y="8" width="5" height="4" class="w"/><path d="M42 22l4 2" class="l"/>',
  };

  function svg(color) {
    const [a, b] = FILL[color] || FILL.loco;
    const ink = INK[color] || '#ffffff';
    const id = 'g' + color;
    const stripe = color === 'loco'
      ? '<g opacity=".55"><rect x="0" y="0" width="50" height="4" fill="#e2504c"/><rect x="0" y="4" width="50" height="4" fill="#f2cf45"/><rect x="0" y="8" width="50" height="4" fill="#4fbf6a"/><rect x="0" y="12" width="50" height="4" fill="#4f8ff0"/></g>'
      : '';
    return `<svg viewBox="0 0 50 74" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="50" height="74" fill="url(#${id})"/>${stripe}
<g transform="translate(0,22)" fill="${ink}" fill-opacity=".9" stroke="none">
<style>.w{fill:${a};fill-opacity:1}.l{fill:none;stroke:${a};stroke-width:1.6}</style>
${BODY[color] || BODY.loco}
<circle cx="13" cy="24" r="3.2"/><circle cx="37" cy="24" r="3.2"/>
</g>
<path d="M4 50h42" stroke="${ink}" stroke-opacity=".35" stroke-width="1.2"/>
</svg>`;
  }

  root.Cards = { svg, FILL };
})(window);
