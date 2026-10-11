# Bundled UI Fonts

Font assets are self-hosted; StudyBridge does not make third-party font requests.

- `inter-variable-4.1.woff2`: unmodified normal variable webfont from
  https://rsms.me/inter/font-files/InterVariable.woff2?v=4.1
  (Inter 4.1, https://github.com/rsms/inter/releases/tag/v4.1).
  License: `inter-OFL.txt`.
- `noto-sans-sc-gb2312-v2.004.woff2`: Noto Sans SC 2.004 variable TTF from
  https://github.com/notofonts/noto-cjk/blob/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf,
  subset and converted to WOFF2 with FontTools 4.66.1. Covers all 6,763 GB2312
  Chinese ideographs plus Latin U+0020-024F, punctuation U+2000-206F and
  U+3000-303F, and fullwidth forms U+FF00-FFEF. Existing font metadata,
  variable weights, and layout features are retained. Characters outside this
  subset fall back to platform CJK sans-serif fonts.
  License: `noto-sans-OFL.txt`; copyright and author notices remain in
  the font's name table.

For the Chinese build, form a Unicode list from GB2312 rows B0-F7 and columns
A1-FE (excluding D7FA-D7FE), plus the ranges above, then run:

```text
fonttools subset NotoSansSC-VF.ttf --unicodes=<Unicode list> --flavor=woff2 --output-file=noto-sans-sc-gb2312-v2.004.woff2 --layout-features=* --name-IDs=* --name-languages=*
```

Both fonts use SIL Open Font License 1.1. Include the supplied licenses with
distributions. FontTools is needed only to regenerate the Chinese asset,
not to install, build, or run StudyBridge.

Font filenames include upstream versions and are cached as immutable assets.
Change the filename and font-face/preload references whenever font bytes change.
