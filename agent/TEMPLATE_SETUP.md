# Template setup (one time, in Illustrator)

The script can't guess which object is which, so we name a few of them. The source file
`template-collage-football-many-matches.ai` has 14 artboards (7 Story 1080×1920 + 7 Portrait 1080×1350)
on one unnamed layer. We turn **one Story artboard** into `template.ai`.

Names are set in the **Layers** panel: expand the layer, double-click an object's name, type the new name.
Names are case-sensitive.

## 1. Make a one-artboard file

1. Open `template-collage-football-many-matches.ai`.
2. **Object → Unlock All** (locked art won't copy).
3. Click the 8-match Story artboard with the Artboard tool (Shift+O) so it's the active one, then switch back to the Selection tool (V).
4. **Select → All on Active Artboard** (⌥⌘A), then **Edit → Copy**.
5. **File → New**: 1080 × 1920 px, RGB. Then **Edit → Paste in Place** (⇧⌘V).
6. Save it as `template.ai` (Illustrator format).

## 2. Mark the rows area

Before deleting any rows, draw a rectangle (M) around **all 8 rows**, from just above row 1's logos to
just below the last divider line, leaving the same small margin at the top and bottom.

- Set its fill and stroke to **None**.
- Name it **`ROWS_AREA`**.

The script splits this area into 8 equal slots (see `templateRowCount` in config) to space the rows. With
fewer matches it centers them in the area; with 9 or 10 it shrinks them slightly to fit.

## 3. Build the one match row

Take **row 1** and group it (select everything → ⌘G): home logo, home name, VS, time, away name,
away logo, **and the divider line under it**. Name the group **`MATCH_ROW`**.

Inside the group, name:

| Object | Name | Notes |
| --- | --- | --- |
| Home team name | `HOME_NAME` | One text object for the whole name (if "NOTRE" and "DAME" are two separate texts, merge them into one with a line break). Must be point text, right-aligned. |
| Away team name | `AWAY_NAME` | Same, left-aligned. |
| Time | `TIME` | |
| Home logo | `HOME_LOGO` | Marks where the logo goes. **Recommended:** delete the logo and draw a square with no fill or stroke in its place, so every logo gets the same box. Naming the existing logo also works. |
| Away logo | `AWAY_LOGO` | Same. |

Leave VS and the divider unnamed.

**Point text vs area text:** if clicking the text shows a box you can drag, it's area text. Convert it with
**Type → Convert to Point Type**, so names can grow to 2–3 lines.

## 4. Finish up

1. Delete rows 2–8.
2. Name the date text (e.g. "SATURDAY, OCTOBER 3") **`DATE`**.
3. Make sure `MATCH_ROW`, `DATE` and `ROWS_AREA` are not locked or hidden. Background art can be locked again.
4. Save.

## 5. Check it

With `template.ai` open: **File → Scripts → Other Script…** and pick `illustrator/check-template.jsx`.
It lists anything missing and saves the full object tree to `Desktop/template-structure.txt`
(send that file over if something doesn't work).
