# Match Generator

The designer picks the matches on a web dashboard, clicks **Generate**, and Illustrator opens a finished college football or NBA graphic ready for polishing. Both sports use the same template.

```text
Vercel dashboard (Chrome)  ──POST match list──▶  Agent on the designer's Mac (127.0.0.1:3030)
  web/                                             agent/
  · teams from data/<sport>.json                   · downloads logos from the dashboard
  · logos from public/logos/<sport>/              · runs illustrator/generate.jsx in Illustrator
  · shared password                                · saves to ~/Documents/Match Graphics and opens it
```

Nothing is stored on a server: the team lists are read-only data in the repo, and each job goes straight to the Mac.

| Folder | What it is |
| --- | --- |
| `web/` | Next.js dashboard, deployed to Vercel |
| `agent/` | Local Node service + Illustrator scripts, installed on the designer's Mac |
| `agent/TEMPLATE_SETUP.md` | One-time prep of the `.ai` template, Story + Portrait versions (**do this first**) |
| `agent/test/` | `node agent/test/prepare.test.js` and `generate.test.js` check the Illustrator scripts without Illustrator |

## 1. Deploy the dashboard (Vercel)

1. Push this repo to GitHub, then **Import** it in Vercel.
2. Set **Root Directory** to `web`.
3. Add the environment variable `DASHBOARD_PASSWORD` (any username works at the login prompt, only the password is checked).
4. Deploy. Note the URL, e.g. `https://match-generator.vercel.app`.

Local development: `cd web && npm install && npm run dev` (no password when `DASHBOARD_PASSWORD` is unset).

## 2. Prepare the template

Run `agent/illustrator/prepare-template.jsx` in Illustrator with the template open (it does the setup automatically), or follow [`agent/TEMPLATE_SETUP.md`](agent/TEMPLATE_SETUP.md) by hand.

## 3. Set up the designer's Mac (once)

1. Install **Node.js LTS** from nodejs.org.
2. Make sure the template fonts are installed: **GLACH**, **Azo Sans Uber**, **Alfarn**.
3. Copy the `agent/` folder to the Mac and run:
   ```bash
   cd agent
   ./install.sh https://match-generator.vercel.app ~/path/to/template.ai
   ```
   The agent now starts automatically at every login. Logs: `~/Library/Logs/MatchGenerator.log`.
4. In **Chrome**, open the dashboard, log in, and click **Allow** when Chrome asks to access devices on the local network.
5. Click **Generate** once. macOS asks whether "node" may control Adobe Illustrator: click **OK**.

After this the designer only ever opens the dashboard bookmark.

If Illustrator is installed under another name (e.g. `Adobe Illustrator (Beta)`), set `illustratorApp` in `~/MatchGenerator/config.json` and re-run `install.sh`.

## Everyday maintenance

- **Sports:** College Football (`web/data/college-football.json`, 138 FBS teams) and NBA (`web/data/nba.json`, 30 teams). The dashboard has a switch at the top. Each sport keeps its own draft, and the output file is named `<date>-<sport>.ai`.
- **Logos:** `cd web && node scripts/fetch-logos.mjs` downloads missing logos: college football from ESPN (500×500 PNG), NBA from nba.com (vector SVG). Add a sport name to do just one (`... fetch-logos.mjs nba`), `--force` to refresh, and `--dark` for ESPN's dark-background versions. To use your own logo instead, save it as `web/public/logos/<sport>/<team-id>.svg` (an SVG wins over the PNG) and push.
- **Add a team:** add `{ "id": "...", "name": "...", "espnId": 123 }` to `web/data/college-football.json` (the ESPN id is the number in the team's ESPN URL), or `{ "id": "...", "name": "...", "nbaId": 1610612738 }` to `web/data/nba.json`, then run the logo script. Names break one word per line by default. To override, add `"lines": ["Golden State", "Warriors"]`. `aliases` are other spellings a pasted schedule might use (cities, nicknames, abbreviations).
- **Team not in the list:** the designer can type any name. It's placed without a logo.
- **Update the template:** replace `~/MatchGenerator/template/template.ai` on the Mac.
- **Update the agent:** re-run `install.sh` (it keeps the existing config and template).
