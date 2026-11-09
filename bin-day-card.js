/*
 * Bin Day Card — a Home Assistant Lovelace card that tells you which bins to put out tonight
 * and shows the collection calendar for the next days.
 *
 * Data: the calendar of the Waste Collection Schedule integration (or any calendar whose event
 * titles name the waste type), or sensors whose attributes are YYYY-MM-DD dates.
 * https://github.com/AldebaranPrimo/bin-day-card — MIT licence.
 */
const VERSION = "1.0.1";

const STRINGS = {
  en: {
    title: "Waste collection",
    today: (bins) => `Collection today: ${bins}`,
    todaySub: "Pickup is in the morning: if the bin is not out yet, take it out now.",
    tonight: (bins) => `Put out tonight: ${bins}`,
    tonightSub: (day) => `Pickup tomorrow, ${day}.`,
    nothing: "Nothing to put out tonight",
    nextSub: (bins, day, n) => `Next: ${bins}, ${day} (in ${n} days).`,
    empty: "No collections scheduled",
    emptySub: "The calendar has no future dates: check the integration.",
    chipToday: "Today", chipTomorrow: "Tomorrow", chipDays: (n) => `${n} days`,
    noDate: "no date", and: "and", none: "no collection",
  },
  it: {
    title: "Raccolta rifiuti",
    today: (bins) => `Oggi passa ${bins}`,
    todaySub: "Il ritiro è in mattinata: se non è fuori, portalo adesso.",
    tonight: (bins) => `Stasera esponi ${bins}`,
    tonightSub: (day) => `Ritiro domani, ${day}.`,
    nothing: "Stasera niente da esporre",
    nextSub: (bins, day, n) => `Prossimo: ${bins}, ${day} (tra ${n} giorni).`,
    empty: "Nessuna raccolta in calendario",
    emptySub: "Il calendario non ha date future: controlla l'integrazione.",
    chipToday: "Oggi", chipTomorrow: "Domani", chipDays: (n) => `${n} giorni`,
    noDate: "nessuna data", and: "e", none: "nessuna raccolta",
  },
  de: {
    title: "Abfallabholung",
    today: (bins) => `Abholung heute: ${bins}`,
    todaySub: "Abholung ist morgens - falls noch nicht erledigt, jetzt rausstellen.",
    tonight: (bins) => `Heute Abend rausstellen: ${bins}`,
    tonightSub: (day) => `Abholung morgen, ${day}.`,
    nothing: "Heute Abend nichts herauszustellen",
    nextSub: (bins, day, n) => `Nächste Abholung: ${bins}, ${day} (in ${n} ${n === 1 ? 'Tag' : 'Tagen'})`,
    empty: "Keine Abholung geplant",
    emptySub: "Der Kalender hat keine zukünftigen Termine: prüfe die Integration!",
    chipToday: "Heute", chipTomorrow: "Morgen", chipDays: (n) => `${n} Tage`,
    noDate: "kein Datum", and: "und", none: "keine Abholung",
  },
};

// Used when a bin has no colour or icon of its own: guessed from its name (several languages).
const GUESSES = [
  { words: ["paper", "carta", "papier", "cardboard", "karton", "papel", "pmd"], color: "#ffd500", icon: "mdi:newspaper-variant-outline" },
  { words: ["plastic", "plastica", "vpl", "plastik", "gelbe", "packaging", "verpackung", "emballage", "recycl"], color: "#1e6fd9", icon: "mdi:bottle-soda-classic-outline" },
  { words: ["glass", "vetro", "glas", "verre", "vidrio"], color: "#2e9e5b", icon: "mdi:bottle-wine-outline" },
  { words: ["organic", "umido", "food", "bio", "compost", "organico", "gft"], color: "#6e3a1a", icon: "mdi:food-apple-outline" },
  { words: ["garden", "green", "vegetale", "verde", "grün", "sfalci", "yard"], color: "#c9a66b", icon: "mdi:leaf" },
  { words: ["residual", "general", "rest", "secco", "indifferenziat", "landfill", "refuse", "ordures"], color: "#4a4e55", icon: "mdi:trash-can-outline" },
];
const PALETTE = ["#1e6fd9", "#ffd500", "#6e3a1a", "#c9a66b", "#4a4e55", "#2e9e5b", "#d6453d", "#8a6bd1"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diff = (a, b) => Math.round((day0(b) - day0(a)) / 86400000);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").trim().toLowerCase();

// black or white text, whichever reads better on the colour
function textFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16), lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.4 ? "#1d1d1d" : "#ffffff";
}
function guess(name) {
  const n = norm(name);
  return GUESSES.find((g) => g.words.some((w) => n.includes(w)));
}

class BinDayCard extends HTMLElement {
  static getStubConfig(hass) {
    const cal = Object.keys(hass?.states || {}).find((e) => e.startsWith("calendar.waste_collection_schedule"));
    return cal ? { calendar: cal } : {};
  }

  setConfig(config) {
    if (config.bins && !Array.isArray(config.bins)) throw new Error("bins must be a list");
    for (const b of config.bins || []) if (!b.name) throw new Error("every bin needs a name");
    this._config = { days: 14, lookahead_days: 60, day_switch_time: 10, show_legend: true, highlight_sunday: true, ...config };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._sig = null;
    this._events = null;
    this._fetchedAt = 0;
    if (this._hass) this._load().then(() => this._render());
  }

  set hass(hass) {
    this._hass = hass;
    const c = this._config, now = this._now();
    const ids = [...this._calendars(), ...(c.bins || []).map((b) => b.entity).filter(Boolean)];
    const sig = ids.map((id) => hass.states[id]?.last_updated).join("|") + "|" + key(now) + now.getHours() + "|" + (hass.locale?.language || hass.language);
    if (sig === this._sig) return;
    this._sig = sig;
    this._load().then(() => this._render());
  }

  getCardSize() { return 5; }

  _now() { return this._config.now ? new Date(this._config.now) : new Date(); }
  _t() {
    const lang = norm(this._config.language || this._hass?.locale?.language || this._hass?.language || "en").slice(0, 2);
    return { s: STRINGS[lang] || STRINGS.en, lang: STRINGS[lang] ? lang : "en", locale: this._config.language || this._hass?.locale?.language || this._hass?.language || "en" };
  }
  _calendars() {
    const c = this._config;
    if (c.calendar !== undefined) return [].concat(c.calendar).filter(Boolean);
    const auto = Object.keys(this._hass?.states || {}).find((e) => e.startsWith("calendar.waste_collection_schedule"));
    return auto ? [auto] : [];
  }

  // calendar events: [{ title, date: "YYYY-MM-DD" }], refreshed at most every 30 minutes
  async _load() {
    const cals = this._calendars();
    if (!cals.length || !this._hass?.callApi) { this._events = []; return; }
    if (this._events && Date.now() - this._fetchedAt < 1800000 && this._eventsDay === key(this._now())) return;
    const start = day0(this._now()), end = new Date(start.getTime() + (this._config.lookahead_days + 1) * 86400000);
    try {
      const lists = await Promise.all(cals.map((cal) => this._hass.callApi("GET", `calendars/${cal}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`)));
      this._events = lists.flat().map((e) => ({ title: e.summary, date: e.start?.date || (e.start?.dateTime ? key(new Date(e.start.dateTime)) : null) })).filter((e) => e.date);
      this._error = null;
    } catch (err) {
      this._events = [];
      this._error = err?.message || String(err);
    }
    this._fetchedAt = Date.now();
    this._eventsDay = key(this._now());
  }

  // bins with their dates: configured ones, or one per event title found in the calendar
  _bins() {
    const c = this._config, events = this._events || [];
    let bins = c.bins;
    if (!bins?.length) bins = [...new Set(events.map((e) => e.title))].sort().map((t) => ({ name: t }));
    return bins.map((b, i) => {
      const g = guess(b.name) || guess(b.match);
      const color = b.color || g?.color || PALETTE[i % PALETTE.length];
      const matches = [].concat(b.match ?? b.name).map(norm);
      const dates = new Set(events.filter((e) => matches.includes(norm(e.title))).map((e) => e.date));
      const st = b.entity && this._hass?.states[b.entity];
      if (st) Object.keys(st.attributes).filter((k) => DATE_RE.test(k)).forEach((k) => dates.add(k));
      return { ...b, i, color, text: b.text_color || textFor(color), icon: b.icon || g?.icon || "mdi:trash-can-outline", dates };
    });
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const c = this._config, { s, lang, locale } = this._t();
    const now = this._now(), today = day0(now), todayValid = now.getHours() < c.day_switch_time;
    const list = (names) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${s.and} ${names[names.length - 1]}`;
    const weekday = (d, style) => d.toLocaleDateString(locale, { weekday: style });
    const dayText = (d) => lang === "it" ? `${weekday(d, "long")} ${d.getDate()}/${d.getMonth() + 1}` : d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" });
    const shortDay = (d) => lang === "it" ? `${weekday(d, "short")} ${d.getDate()}/${d.getMonth() + 1}` : d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });

    const bins = this._bins().map((b) => {
      const next = [...b.dates].sort().find((k) => { const d = diff(today, new Date(k + "T00:00:00")); return d > 0 || (d === 0 && todayValid); });
      const date = next ? new Date(next + "T00:00:00") : null;
      return { ...b, next: date, inDays: date ? diff(today, date) : null };
    });
    const dated = bins.filter((b) => b.next).sort((a, b) => a.inDays - b.inDays || a.i - b.i);
    const undated = bins.filter((b) => !b.next);

    const todayBins = dated.filter((b) => b.inDays === 0), tomorrow = dated.filter((b) => b.inDays === 1);
    let focus = [], head, sub;
    if (todayBins.length) { focus = todayBins; head = s.today(list(todayBins.map((b) => b.name))); sub = s.todaySub; }
    else if (tomorrow.length) { focus = tomorrow; head = s.tonight(list(tomorrow.map((b) => b.name))); sub = s.tonightSub(dayText(tomorrow[0].next)); }
    else if (dated.length) {
      const first = dated.filter((b) => b.inDays === dated[0].inDays);
      head = s.nothing; sub = s.nextSub(list(first.map((b) => b.name)), dayText(first[0].next), first[0].inDays);
    } else { head = s.empty; sub = this._error || s.emptySub; }
    const focusIdx = new Set(focus.map((b) => b.i));
    const chip = (b) => b.inDays === 0 ? s.chipToday : b.inDays === 1 ? s.chipTomorrow : s.chipDays(b.inDays);

    const tiles = [...dated, ...undated].map((b) => `
      <div class="tile ${focusIdx.has(b.i) ? "focus" : ""} ${b.next ? "" : "empty"}" style="--c:${b.color};--t:${b.text}" title="${esc(b.name)}${b.next ? ": " + esc(dayText(b.next)) : ""}">
        <ha-icon icon="${esc(b.icon)}"></ha-icon>
        <div class="name">${esc(b.name)}</div>
        <div class="chip" style="--len:${(b.next ? chip(b) : "—").length}">${b.next ? esc(chip(b)) : "—"}</div>
        <div class="when">${b.next ? esc(shortDay(b.next)) : s.noDate}</div>
      </div>`).join("");

    const cells = [];
    for (let i = 0; i < c.days; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const here = bins.filter((b) => b.dates.has(key(d)));
      let bg = "", fg = "";
      if (here.length === 1) { bg = here[0].color; fg = here[0].text; }
      if (here.length > 1) {
        const step = 100 / here.length;
        bg = `linear-gradient(135deg, ${here.map((b, j) => `${b.color} ${j * step}% ${(j + 1) * step}%`).join(", ")})`;
        fg = "#ffffff";
      }
      cells.push(`
        <div class="day ${i === 0 ? "today" : ""} ${c.highlight_sunday && d.getDay() === 0 ? "sunday" : ""}" title="${esc(here.map((b) => b.name).join(" + ") || s.none)}">
          <span class="wd">${esc(weekday(d, "short"))}</span>
          <span class="num ${here.length ? "full" : ""} ${here.length > 1 ? "multi" : ""}" style="${here.length ? `background:${bg};color:${fg}` : ""}">${d.getDate()}</span>
        </div>`);
    }

    const title = c.title === undefined ? s.title : c.title;
    const banner = focus.length > 1 ? `--ac-bg:linear-gradient(90deg, ${focus.map((b, j) => `${b.color} ${j * 100 / focus.length}% ${(j + 1) * 100 / focus.length}%`).join(", ")});--at:#fff` : focus.length ? `--ac:${focus[0].color};--at:${focus[0].text}` : "";
    const bannerIcon = (focus[0] || dated[0])?.icon || "mdi:trash-can-outline";
    const tapEntity = c.tap_entity ?? this._calendars()[0];

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; container: bdc / inline-size; }
        ha-card { display: block; padding: 16px; }
        .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .head h2 { margin: 0; font-size: 1rem; font-weight: 600; }
        .head .date { font-size: .8rem; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
        .banner { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; margin-bottom: 16px;
          background: var(--ac-bg, var(--ac)); color: var(--at, #fff); }
        .banner.calm { background: color-mix(in srgb, var(--secondary-text-color) 8%, transparent); color: inherit;
          border: 1px solid color-mix(in srgb, var(--secondary-text-color) 20%, transparent); }
        .banner.multi { text-shadow: 0 1px 2px rgba(0,0,0,.45); }
        .banner ha-icon { --mdc-icon-size: 30px; flex: none; }
        .banner.calm ha-icon { color: var(--secondary-text-color); }
        .banner b { display: block; font-size: 1.12rem; line-height: 1.25; text-wrap: balance; }
        .banner span { display: block; font-size: .85rem; opacity: .85; margin-top: 2px; }
        .banner.calm span { color: var(--secondary-text-color); opacity: 1; }
        .tiles { display: grid; grid-template-columns: repeat(${Math.min(Math.max(bins.length, 1), 6)}, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
        .tile { container-type: inline-size; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 4px 10px; border-radius: 14px; text-align: center; min-width: 0;
          background: color-mix(in srgb, var(--c) 28%, var(--ha-card-background, var(--card-background-color, #1f2125)));
          border: 1px solid color-mix(in srgb, var(--c) 60%, transparent); opacity: .8; }
        .tiles.has-focus .tile:not(.focus) { opacity: .5; }
        .tile.empty { opacity: .35; }
        .tile ha-icon { --mdc-icon-size: 30px; color: var(--c); filter: brightness(1.25) saturate(1.2); }
        .tile .name { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--secondary-text-color);
          overflow: hidden; max-width: 100%; line-height: 1.2; overflow-wrap: anywhere;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        /* the text always fits whole: its size follows the tile width and the length of the text (--len characters) */
        .tile .chip { font-size: clamp(.5rem, calc((100cqi - 12px) / (var(--len, 8) * .64)), .78rem); font-weight: 700; padding: 3px 5px; border-radius: 999px;
          background: var(--c); color: var(--t); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .tile .when { font-size: .7rem; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .tile.focus { opacity: 1; background: var(--c); border: 2px solid var(--c);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent), 0 0 18px color-mix(in srgb, var(--c) 55%, transparent); }
        .tile.focus .name, .tile.focus .when { color: var(--t); opacity: .9; }
        .tile.focus ha-icon { color: var(--t); filter: none; }
        .tile.focus .chip { background: var(--t); color: var(--c); }
        .strip { display: grid; grid-template-columns: repeat(${c.days}, minmax(0, 1fr)); gap: 3px; }
        .day { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
        .wd { font-size: .62rem; color: var(--secondary-text-color); text-transform: capitalize; white-space: nowrap; overflow: hidden; max-width: 100%; }
        .sunday .wd { color: color-mix(in srgb, var(--error-color, #db4437) 70%, var(--secondary-text-color)); }
        .num { width: 100%; max-width: 34px; aspect-ratio: 1 / 1.15; display: grid; place-items: center; border-radius: 8px;
          font-size: .78rem; font-weight: 600; font-variant-numeric: tabular-nums;
          background: color-mix(in srgb, var(--secondary-text-color) 10%, transparent); color: var(--secondary-text-color); }
        .num.full { font-weight: 800; }
        .num.multi { text-shadow: 0 1px 2px rgba(0,0,0,.6); }
        .today .num { outline: 2px solid var(--primary-text-color); outline-offset: 1px; }
        .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; font-size: .72rem; color: var(--secondary-text-color); }
        .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
        @container bdc (max-width: 420px) {
          ha-card { padding: 12px; }
          .tiles { gap: 6px; }
          .tile { padding: 10px 2px 8px; }
          .tile ha-icon { --mdc-icon-size: 24px; }
          .tile .name { font-size: .62rem; letter-spacing: .04em; }
          .tile .chip { padding: 2px 4px; }
          .tiles.many { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .tile .when { font-size: .6rem; }
          .strip { gap: 2px; }
          .wd { font-size: .52rem; }
          .num { font-size: .66rem; border-radius: 6px; }
        }
      </style>
      <ha-card>
        ${title ? `<div class="head"><h2>${esc(title)}</h2><span class="date">${esc(dayText(now))}</span></div>` : ""}
        <div class="banner ${focus.length ? "" : "calm"} ${focus.length > 1 ? "multi" : ""}" style="${banner}">
          <ha-icon icon="${esc(bannerIcon)}"></ha-icon>
          <div><b>${esc(head)}</b><span>${esc(sub)}</span></div>
        </div>
        ${bins.length ? `<div class="tiles ${focus.length ? "has-focus" : ""} ${bins.length > 5 ? "many" : ""}">${tiles}</div>` : ""}
        <div class="strip">${cells.join("")}</div>
        ${c.show_legend && bins.length ? `<div class="legend">${bins.map((b) => `<span><i style="background:${b.color}"></i>${esc(b.name)}</span>`).join("")}</div>` : ""}
      </ha-card>`;
    const card = this.shadowRoot.querySelector("ha-card");
    card.style.cursor = tapEntity ? "pointer" : "";
    card.onclick = tapEntity ? () => this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: tapEntity } })) : null;
  }
}

if (!customElements.get("bin-day-card")) customElements.define("bin-day-card", BinDayCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((x) => x.type === "bin-day-card")) {
  window.customCards.push({ type: "bin-day-card", name: "Bin Day Card", preview: true,
    description: "Which bins to put out tonight, plus a calendar of the next collections (Waste Collection Schedule)." });
}
console.info(`%c BIN-DAY-CARD %c ${VERSION} `, "color:#fff;background:#1e6fd9;font-weight:700", "color:#1e6fd9;background:#fff");
