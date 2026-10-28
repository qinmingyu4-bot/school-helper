# StudyBridge book-and-bridge identity

Both owner-approved concepts are retained here: [monochrome proof](approved-monochrome.png)
and [indigo/mint proof](approved-color.png). These original concept sheets were generated
with the built-in ImageGen tool. The production SVGs recreate their book-and-bridge
silhouettes with a transparent background, flat fills and small-screen geometry.

## Runtime assets

- `public/brand/book-bridge-monochrome.svg`: default charcoal mark (`#202020`).
- `public/brand/book-bridge-color.svg`: periwinkle pages (`#6668e8`), mint right page
  (`#5bcbb5`) and indigo bridge (`#5357c8`), with softened corners.
- `public/brand/icon-monochrome.svg` and `icon-color.svg`: square reversed marks for browser tabs.
- `public/brand.css`: shared logo display and personalization previews. The monochrome
  sidebar mark reverses to white in dark mode; the colorful mark brightens slightly.

The public homepage and login default to monochrome. Signed-in users choose either
version in **设置 → 个性化 → 品牌 Logo**. Changes preview immediately and save to the
existing account-owned appearance record. `logo: "color"` opts into color; an absent
`logo` (or the explicit `monochrome` input) means monochrome. Existing daytime palettes
and dark-mode choices remain independent, with no account-data migration. Logout
clears the selected logo from the page and resets its favicon.

Concept briefs: combine open book pages and a bridge arch into one economical,
small-scale silhouette with an Inter-like StudyBridge wordmark; first charcoal on
paper gray, then a youthful rounder evolution in indigo and mint. The concept sheets
are design references rather than runtime images; keep their typography editable as
interface text alongside the SVG mark.
