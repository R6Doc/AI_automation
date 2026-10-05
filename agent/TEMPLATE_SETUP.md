# Template setup (one time, in Illustrator)

The script finds things **by name**, so we name a few objects. The template has two versions of the
same graphic, each on its own artboard:

| Artboard | Size | Layer name |
| --- | --- | --- |
| Story (mobile) | 1080 × 1920 | `STORY` |
| Portrait (feed) | 1080 × 1350 | `PORTRAIT` |

Each version goes on **its own layer**, and inside each layer we use the **same names**. One Generate
fills both versions with the same matches.

## Automatic (try this first)

1. Open `~/MatchGenerator/template/template.ai` in Illustrator.
2. **File → Scripts → Other Script…** → pick `agent/illustrator/prepare-template.jsx` from the repo.
3. Click **Yes** to confirm. It saves a backup next to the file, does everything below, saves, and then
   runs the checker.

If it stops with a message, it names the artboard and row that confused it. Nothing is saved in that
case: use **File → Revert**, fix that spot (or do the manual steps below), and run it again.

## Manual

Names are case-sensitive. To rename anything: select it, find its highlighted row in the **Layers**
panel (Window → Layers), double-click the name, type the new one.

## 1. Split the two versions into two layers

1. Open the template (`template-for-agent.ai`). **Object → Unlock All**.
2. In the Layers panel, double-click **Layer 1** and rename it `STORY`.
3. Click the **New Layer** button (＋ at the bottom of the panel) and name the new layer `PORTRAIT`.
4. Press **Shift+O** (Artboard tool), click the **shorter** artboard, then press **V**.
5. **Select → All on Active Artboard** (⌥⌘A).
6. In the Layers panel, click the `PORTRAIT` layer once to make it active, then
   **Object → Arrange → Send to Current Layer**.

Now the tall artboard's art is in `STORY` and the short one's is in `PORTRAIT`.

## 2. Name the pieces, in each layer

Do these steps **twice**: once on the Story artboard, once on the Portrait artboard.

1. **Rows area:** press **M** (Rectangle tool) and draw a box around **all 8 rows**, from just above
   row 1 to just below the last divider line, with the same small margin top and bottom. Set fill and
   stroke to **None**. Name it `ROWS_AREA`. Make sure it lands in the right layer.
2. **Date:** name the "SATURDAY, OCTOBER 3" text `DATE`.
3. **Row 1:** select everything in the first row (both logos, both team names, VS, the time, **and the
   orange line under it**) and press **⌘G** to group. Name the group `MATCH_ROW`.
4. Expand `MATCH_ROW` and name what's inside:

   | Object | Name |
   | --- | --- |
   | Left team name | `HOME_NAME` |
   | Right team name | `AWAY_NAME` |
   | Time | `TIME` |
   | Left logo | `HOME_LOGO` |
   | Right logo | `AWAY_LOGO` |

   - If a team name is two separate text objects ("NOTRE" and "DAME"), merge them into one text object
     with a line break.
   - If clicking a text shows a box you can resize, it's area text: **Type → Convert to Point Type**.
   - For the logos you can name the existing logo, or (more consistent) delete it and draw a square
     with no fill or stroke in its place, so every logo gets the same box.
5. Delete rows 2–8.

## 3. Save it in place

**File → Save As** (Illustrator format). In the save dialog press **⇧⌘G**, paste
`~/MatchGenerator/template`, and save it as `template.ai`.

## 4. Check it

With the file open: **File → Scripts → Other Script…** and pick `agent/illustrator/check-template.jsx`.
It should say **"Template looks good! Versions found: STORY, PORTRAIT."** Otherwise it lists what to
fix. It also saves `template-structure.txt` to the Desktop, which you can send over if something's off.

## Notes

- Both versions are designed with 8 rows (`templateRowCount` in config). With fewer matches the rows
  are centered in `ROWS_AREA`; with 9–10 they shrink slightly to fit.
- Anything not named (background, title, VS, dividers, Cabo Joe's logo) is left exactly as designed.
- Adding another size later = another layer with the same names.
