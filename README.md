# Soft Proofing

A Safelight extension that shows on the Develop canvas how a photo will look printed on a particular paper, or shown on another screen, from the ICC profile of that printer and paper or that screen.

## Using it

- Open the **Soft Proofing** panel in Develop and turn on **Show soft proof**, or press **Shift+S**. The proof stays on as you move from photo to photo. Change the shortcut in **Preferences ▸ Shortcuts**.
- **Profile**: the output to proof for.
  - **Screens**: sRGB, Display P3 and Adobe RGB (1998) are built in.
  - **Add profile…** adds an `.icc` or `.icm` file: the profile your printer's maker or the paper's maker publishes for a printer and paper, a press profile, or a screen's. It is listed under **Printers and papers** or **Screens**, and every window of Safelight sees it. **Remove** forgets it again; the file itself isn't touched.
  - Windows keeps installed profiles in `C:\Windows\System32\spool\drivers\color`, macOS in `/Library/ColorSync/Profiles` and `~/Library/ColorSync/Profiles`, Linux usually in `/usr/share/color/icc`.
- **Rendering intent**: how colours the output can't reach are brought into range.
  - **Perceptual** compresses the whole range so the relationships between colours survive.
  - **Relative colorimetric** keeps the colours the output can reach exactly and moves the others to the nearest it can.
  - **Saturation** keeps colours vivid at the expense of accuracy; meant for graphics.
  - **Absolute colorimetric** keeps colours exactly, the paper's own tint included; for proofing one press on another.
- **Black point compensation** maps the photo's black to the darkest the output reaches, so shadow detail isn't crushed. Not used with absolute colorimetric.
- **Simulate paper and ink** shows the paper's white and the ink's black as they are: a matte paper looks greyer and flatter, as it will on the wall. Off, they are shown as the screen's white and black.
- **Gamut warning** paints the colours the output can't reproduce in a colour you choose.

## What it shows

- The proof is made from the photo as you've edited it, before Safelight encodes it for your screen, so wide-gamut colour in a RAW file reaches the profile instead of being clipped to sRGB first.
- The conversion follows the ICC specification as Little CMS implements it, including its black point detection for black point compensation and its gamut check, and is tested against Little CMS's own answers for the printer profiles Windows ships.
- Version 2 and 4 profiles are read: LUT-based printer profiles (RGB, CMYK, CMY, grey and up to 15-colour), matrix/TRC screen and colour space profiles, and grey profiles. Device links, abstract and named colour profiles aren't proofing targets and are refused, as are profiles that can only convert one way.
- How the screen itself shows colour is left to Safelight and your system, as for everything else in Develop.
- Safelight's own **Proof** toggle in the status bar (version 3 photos) previews the export colour space. With both on, the photo is proofed twice; the panel says so.

## A view aid only

The proof is drawn only on the Develop canvas. It never appears in exports, thumbnails, the histogram or colour pickers, and it isn't part of the edit: turning it on doesn't mark the photo as edited, and it isn't in the history, presets or copied settings. The profile and settings you choose are yours, not the photo's, and stay the same for every photo.

Choosing a profile or intent prepares the proof in a fraction of a second, without holding up the window. Safelight gets the proof ready in the background while you work in Develop, so it appears as soon as you turn it on.

Needs Safelight 3.2.4 or later.

## Development

- `npm run check`: typecheck, build and the tests.
- `npm run fixtures`: records Little CMS's answers for the comparison tests again (Python 3 with Pillow).
- `npm run test:gpu`: runs the stage on Safelight's real renderer in headless Chromium, from a SafeLight checkout beside this folder (or `SAFELIGHT_CORE`).

## Licence

GPL-3.0-or-later. See `LICENSE`.
