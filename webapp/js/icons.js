/** SVG-иконки в стиле SF Symbols (обводка 1.8, скруглённые концы). */

const svg = (paths, { fill = false, size = 24, extra = '' } = {}) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill ? 'currentColor' : 'none'}" ` +
  `stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export const icons = {
  home: svg('<path d="M3.5 10.5 12 3.8l8.5 6.7V19a1.6 1.6 0 0 1-1.6 1.6h-3.3v-6.1H8.4v6.1H5.1A1.6 1.6 0 0 1 3.5 19z"/>'),
  grid: svg('<rect x="3.4" y="3.4" width="7" height="7" rx="2.1"/><rect x="13.6" y="3.4" width="7" height="7" rx="2.1"/><rect x="3.4" y="13.6" width="7" height="7" rx="2.1"/><rect x="13.6" y="13.6" width="7" height="7" rx="2.1"/>'),
  heart: svg('<path d="M12 20.3s-7.6-4.6-7.6-9.7A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.6 2.9c0 5.1-7.6 9.7-7.6 9.7z"/>'),
  heartFill: svg('<path d="M12 20.3s-7.6-4.6-7.6-9.7A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.6 2.9c0 5.1-7.6 9.7-7.6 9.7z"/>', { fill: true }),
  bag: svg('<path d="M5.6 8.2h12.8l1 11.1a1.6 1.6 0 0 1-1.6 1.7H6.2a1.6 1.6 0 0 1-1.6-1.7z"/><path d="M8.7 8.2V6.6a3.3 3.3 0 0 1 6.6 0v1.6"/>'),
  person: svg('<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20.2c.7-3.7 3.7-5.8 7.2-5.8s6.5 2.1 7.2 5.8"/>'),
  chat: svg('<path d="M20.4 11.6c0 4-3.8 7.2-8.4 7.2-.9 0-1.8-.1-2.6-.3l-5 1.7 1.6-4.1a6.7 6.7 0 0 1-2-4.5c0-4 3.8-7.2 8.4-7.2s8 3.2 8 7.2z"/>'),
  search: svg('<circle cx="10.8" cy="10.8" r="6.4"/><path d="m15.5 15.5 4.2 4.2"/>'),
  sliders: svg('<path d="M4 7.5h10M18 7.5h2M4 16.5h4M12 16.5h8"/><circle cx="16" cy="7.5" r="2.1"/><circle cx="10" cy="16.5" r="2.1"/>'),
  plus: svg('<path d="M12 5.5v13M5.5 12h13"/>'),
  minus: svg('<path d="M5.5 12h13"/>'),
  check: svg('<path d="m5 12.8 4.5 4.4L19 6.8"/>'),
  chevron: svg('<path d="m9 5 7 7-7 7"/>', { size: 20 }),
  chevronLeft: svg('<path d="m15 5-7 7 7 7"/>', { size: 22 }),
  send: svg('<path d="M20.3 3.7 3.5 10.4l6.3 2.4m10.5-9.1-5.2 16.6-3.4-6.7m8.6-9.9-8.6 9.9m0 0-.7 5.1 2.9-3.6"/>'),
  card: svg('<rect x="3" y="5.6" width="18" height="12.8" rx="2.6"/><path d="M3 10h18M6.6 14.6h3.2"/>'),
  doc: svg('<path d="M13.4 3.6H7.2a1.8 1.8 0 0 0-1.8 1.8v13.2a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8V8.4z"/><path d="M13.4 3.6v4.8h5.2M8.6 13h6.8M8.6 16.4h4.4"/>'),
  truck: svg('<path d="M3.4 7.2h9.4v9.4H3.4z"/><path d="M12.8 10.4h3.6l3.2 3.2v3h-6.8z"/><circle cx="7.2" cy="18" r="1.8"/><circle cx="16.6" cy="18" r="1.8"/>'),
  shield: svg('<path d="M12 3.4 5.2 6v5.6c0 4.2 2.8 7.5 6.8 9 4-1.5 6.8-4.8 6.8-9V6z"/><path d="m9.2 12 2 2 3.6-3.8"/>'),
  diamond: svg('<path d="m12 3.8 7.4 5.4-7.4 11-7.4-11z"/><path d="M4.6 9.2h14.8M9.4 9.2 12 3.8l2.6 5.4M9.4 9.2 12 20.2l2.6-11"/>'),
  box: svg('<path d="M20.4 8.4v7.2L12 20.2 3.6 15.6V8.4L12 3.8z"/><path d="m3.6 8.4 8.4 4.6 8.4-4.6M12 13v7.2"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3 1.8"/>'),
  info: svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 11v5.4M12 8.1h.01"/>'),
  star: svg('<path d="m12 3.9 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>'),
  trash: svg('<path d="M4.8 6.8h14.4M9.4 6.8V5.2a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.6M7 6.8l.9 12.1a1.6 1.6 0 0 0 1.6 1.5h5a1.6 1.6 0 0 0 1.6-1.5l.9-12.1"/>'),
  close: svg('<path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"/>'),
  phone: svg('<path d="M20.2 16.9v2.4a1.6 1.6 0 0 1-1.8 1.6 16.2 16.2 0 0 1-7-2.5 15.9 15.9 0 0 1-4.9-4.9 16.2 16.2 0 0 1-2.5-7.1 1.6 1.6 0 0 1 1.6-1.8h2.4a1.6 1.6 0 0 1 1.6 1.4c.1.8.3 1.6.6 2.3a1.6 1.6 0 0 1-.4 1.7l-1 1a13 13 0 0 0 4.9 4.9l1-1a1.6 1.6 0 0 1 1.7-.4c.7.3 1.5.5 2.3.6a1.6 1.6 0 0 1 1.5 1.8z"/>'),
  globe: svg('<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4M12 3.8a13 13 0 0 1 0 16.4 13 13 0 0 1 0-16.4z"/>'),
  bell: svg('<path d="M17.6 10.4a5.6 5.6 0 1 0-11.2 0c0 6.1-2.4 7.8-2.4 7.8h16s-2.4-1.7-2.4-7.8z"/><path d="M13.6 20.6a1.9 1.9 0 0 1-3.2 0"/>'),
  refresh: svg('<path d="M20 11.4a8 8 0 1 0-.8 5.2"/><path d="M20 5.6v5.8h-5.6"/>'),
};

/** Иконка-глиф внутри строки. */
export function icon(name, size) {
  const raw = icons[name] || '';
  if (!size) return raw;
  return raw.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
}
