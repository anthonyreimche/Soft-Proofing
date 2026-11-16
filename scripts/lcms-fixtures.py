# Writes test/fixtures/lcms.json: Little CMS's answers for the profiles in
# Windows' colour folder, which the tests compare the extension's own colour
# engine with. Needs Python 3 and Pillow (which bundles Little CMS):
#
#   python scripts/lcms-fixtures.py
#
# Only numbers are written; the profiles stay where Windows keeps them, and the
# tests that need one skip where it isn't there.

import json
import os
import sys

from PIL import Image, ImageCms

FOLDER = "C:/Windows/System32/spool/drivers/color"
PROFILES = ["CoatedFOGRA39.icc", "USWebCoatedSWOP.icc", "JapanColor2002Newspaper.icc", "BlackWhite.icc"]
LEVELS = [0, 32, 64, 96, 128, 160, 192, 224, 255]
SAMPLES = [(r, g, b) for r in LEVELS for g in LEVELS for b in LEVELS]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test", "fixtures", "lcms.json")

Flags = ImageCms.Flags
Intent = ImageCms.Intent


def rgb_image():
    image = Image.new("RGB", (len(SAMPLES), 1))
    image.putdata(SAMPLES)
    return image


def run(transform, image):
    # ImageCms.applyTransform also tags the result with the output profile,
    # which fails for some grey profiles; the pixels are all that is wanted.
    image.load()
    result = Image.new(transform.output_mode, image.size)
    transform.transform.apply(image.getim(), result.getim())
    return result


def pixels(image):
    return [list(p) if isinstance(p, tuple) else [p] for p in image.getdata()]


def device_mode(profile):
    return {"CMYK": "CMYK", "GRAY": "L", "RGB": "RGB"}[profile.profile.xcolor_space.strip()]


def main():
    srgb = ImageCms.createProfile("sRGB")
    out = {"levels": LEVELS, "profiles": {}}
    for name in PROFILES:
        path = os.path.join(FOLDER, name)
        if not os.path.exists(path):
            print(f"skipped {name}: not found", file=sys.stderr)
            continue
        target = ImageCms.getOpenProfile(path)
        mode = device_mode(target)
        cases = {}
        for intent in (0, 1, 2, 3):
            for bpc in (False, True):
                if bpc and intent != 1:
                    continue
                flags = Flags.NOOPTIMIZE | (Flags.BLACKPOINTCOMPENSATION if bpc else 0)
                t = ImageCms.buildTransform(srgb, target, "RGB", mode, Intent(intent), flags)
                cases[f"to-device/{intent}/{'bpc' if bpc else 'plain'}"] = pixels(run(t, rgb_image()))
            for proof_intent in (1, 3):
                flags = Flags.NOOPTIMIZE | Flags.SOFTPROOFING
                t = ImageCms.buildProofTransform(srgb, srgb, target, "RGB", "RGB", Intent(intent), Intent(proof_intent), flags)
                proofed = pixels(run(t, rgb_image()))
                cases[f"proof/{intent}/{proof_intent}"] = proofed
                if proof_intent == 1:
                    g = ImageCms.buildProofTransform(
                        srgb, srgb, target, "RGB", "RGB", Intent(intent), Intent(proof_intent), flags | Flags.GAMUTCHECK
                    )
                    checked = pixels(run(g, rgb_image()))
                    cases[f"gamut/{intent}"] = [i for i, (a, b) in enumerate(zip(proofed, checked)) if a != b]
        out["profiles"][name] = cases
        print(f"{name}: {len(cases)} cases", file=sys.stderr)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {os.path.relpath(OUT)}", file=sys.stderr)


main()
