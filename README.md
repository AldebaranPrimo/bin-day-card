# Bin Day Card

A Home Assistant dashboard card that answers one question at a glance: **which bins do I put out tonight?**

![Bin Day Card](images/example-en.png)

- A big banner on top: *Put out tonight: Organic and Plastic*, in the colour of the bin. On collection day it switches
  to *Collection today* until the pickup time, then to the next collection.
- One tile per bin with the days left. The bins you need now are in full colour; the others are dimmed, so your eye
  goes straight to what matters.
- A strip with the next 14 days, today outlined. Two collections on the same day share the square diagonally.
- No animations, works at phone width, follows your light or dark theme.

| Collection tomorrow | On a phone |
|---|---|
| ![Italian, put out tonight](images/example-it.png) | ![Phone width](images/example-phone.png) |

## Requirements

- Home Assistant 2024.8 or newer.
- Collection dates in Home Assistant. The easiest source is the
  [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule) integration, which supports
  hundreds of collection services: the card reads its calendar. Any other calendar works too, as long as each event
  title names the waste type.

## Installation

### Marketplace (Home Assistant 2026.11 and newer)

Until the card is in the default catalogue, add it by link: open **Settings → Marketplace**, choose
**Add from link**, paste `https://github.com/AldebaranPrimo/bin-day-card`, then install **Bin Day Card**. The dashboard
resource is added for you. Reload the page in the browser afterwards.

### HACS (before 2026.11)

HACS → three dots → **Custom repositories** → add `https://github.com/AldebaranPrimo/bin-day-card` with type **Dashboard**,
then download **Bin Day Card**.

### Manual

Copy `bin-day-card.js` to `/config/www/`, then add a dashboard resource (Settings → Dashboards → three dots →
Resources) with URL `/local/bin-day-card.js` and type **JavaScript module**.

## Configuration

The shortest configuration has no options at all. The card finds the first `calendar.waste_collection_schedule…`
entity, creates one bin per event title and guesses colours and icons from the names:

```yaml
type: custom:bin-day-card
```

Usually you will want your own names, colours and order:

```yaml
type: custom:bin-day-card
calendar: calendar.waste_collection_schedule_my_town
bins:
  - name: Organic
    color: "#6e3a1a"
    icon: mdi:food-apple-outline
  - name: Plastic & cans
    match: Packaging          # the event title in the calendar, if different from the name
    color: "#1e6fd9"
  - name: Paper
    color: "#ffd500"
  - name: Garden
    match: [Green waste, Garden waste]
  - name: General waste
    color: "#4a4e55"
```

### Card options

| Option | Default | Description |
|---|---|---|
| `calendar` | first `calendar.waste_collection_schedule…` | Calendar entity to read, or a list of calendars. `""` or `[]` reads no calendar (sensors only, see `entity`). |
| `bins` | one per event title | List of bins, see below. The order is the order of the legend and of bins due on the same day. |
| `title` | *Waste collection*, translated | Card title. `""` hides the title row. |
| `days` | `14` | Days shown in the strip. |
| `lookahead_days` | `60` | How far ahead the card looks for the next date of each bin. |
| `day_switch_time` | `10` | Hour (0-23) after which today's collection counts as done, like `day_switch_time` in Waste Collection Schedule. |
| `language` | Home Assistant language | `en`, `it` or `de`; other languages fall back to English. |
| `show_legend` | `true` | Colour legend under the strip. |
| `highlight_sunday` | `true` | Sunday labels in red. |
| `tap_entity` | the calendar | Entity whose details open when the card is tapped. `""` disables the tap. |

### Bin options

| Option | Default | Description |
|---|---|---|
| `name` | required | Name shown on the card. |
| `match` | `name` | Event title (or list of titles) of this bin in the calendar. Case does not matter. |
| `color` | guessed from the name, or a palette colour | Bin colour, as `#rrggbb`. |
| `text_color` | black or white, whichever reads better | Text colour on the full-colour tile and banner. |
| `icon` | guessed from the name, or `mdi:trash-can-outline` | Any `mdi:` icon. |
| `entity` | none | Optional sensor whose attribute names are `YYYY-MM-DD` dates, all for this bin: for example a Waste Collection Schedule sensor with `details_format: upcoming` and `types:` limited to this one waste type. Its dates are added to the ones found in the calendar. |

Guessed colours and icons: paper yellow, plastic and packaging blue, glass green, organic brown, garden ochre,
general waste dark grey. They recognise a few words in English, Italian, German, French, Spanish and Dutch; set
`color` and `icon` when the guess is wrong.

## Translations

Texts live in the `STRINGS` object at the top of `bin-day-card.js`. Pull requests with new languages are welcome.

## Credits

The idea for the layout came from the waste bins in a dashboard shared on Reddit by u/Vegetable-Volume-161
([post](https://www.reddit.com/r/homeassistant/comments/1xppcvd/our_dashboard_from_germany_energy_carousel_waste/)).
Thanks for the inspiration: the design and the code of this card were developed independently from that starting point.

## More cards

Other cards in the same style:

- [Battery Check Card](https://github.com/AldebaranPrimo/battery-check-card): finds every battery in your home and shows which ones to replace now.
- [Appliance Energy Card](https://github.com/AldebaranPrimo/appliance-energy-card): what is running on your smart plugs, with power and energy per day.
- [Tractive Pet Card](https://github.com/AldebaranPrimo/tractive-pet-card): your pet's activity goal, collar and history from the Tractive integration.

## Licence

[MIT](LICENSE)
