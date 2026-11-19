# Tokiwa Sell Sheets (Figma plugin)

Creates the batches sent from the dashboard's **Sell Sheets** page (`/hrs`): one copy of the
`Sell sheet auto` frame per product, filled in and laid out in a row to the right of the page.

## Install (once, Figma desktop app)

1. Copy this `figma-plugin/` folder to the designer's Mac.
2. In Figma: **Plugins → Development → Import plugin from manifest…** and pick `manifest.json`.
3. Run it (**Plugins → Development → Tokiwa Sell Sheets**), open **Dashboard connection**, enter the
   dashboard address (e.g. `https://match-generator.vercel.app`) and the dashboard password, **Save**.

Development plugins work on every Figma plan. They only run in the desktop app, not the browser.

## Use

Open the TOKIWA file, run the plugin, click **Create** on a batch (or **Create all**). The batch
disappears from the dashboard once it's in Figma. Warnings (text shrunk, text too long, missing
photo) are listed in the plugin.

## The template

The plugin finds the frame named **`Sell sheet auto`** (current page first, then the other pages)
and fills these layers. Rename any you replace, or the plugin will say which one is missing.

| Layer | Field | When blank |
| --- | --- | --- |
| `#name` | Product name | – |
| `#region` | Region line | hidden |
| `#description` | Description (intro + the "From Hombo San" quote) | – |
| `#tasting-title`, `#tasting-arrow`, `#tasting-line`, `#tasting-notes` | Tasting notes (only from an explicit "Tasting Notes" section) | all four hidden, the description uses the space |
| `#abv`, `#size`, `#age`, `#style`, `#adjustments`, `#release`, `#peat`, `#still`, `#bottling`, `#barrels`, `#bottle-count` (+ the matching `…-label`) | Stats | value and label hidden |
| `#distillery-name`, `#distillery-about` | About the distillery | – |
| `#map-label`, `#map-arrow` | Map label | hidden |
| `#photo` | Bottle photo (fit inside the box) | grey box + warning |

The title, region, description and tasting notes flow top to bottom with the template's spacing.
If they run into the stats, the description and tasting notes shrink together (down to 11 pt).
Stats may wrap as many lines as the template's sample text (barrels one more), then shrink.

The template uses **Liberation Serif** and **Liberation Sans**. They must be installed on the Mac
running the plugin (free: https://github.com/liberationfonts/liberation-fonts/releases), or swap the
template to other fonts first. The plugin can't edit text in a missing font.
