# VoidPixlr

A pixel-art canvas for 16 to 512 px art, square or not — and a
photo-to-pixel-art pipeline that runs entirely in your browser.

**A photo in, a sprite out. Nothing is uploaded. Nothing is ever sent
anywhere.**

> **This repository is a backup.** The site is served from its own container
> on the LAN — http://192.168.100.100/ — by nginx serving a directory. There
> is no GitHub Pages here, no CI, and no build step: the repository exists so
> the source has a second home off the machine, and nothing else.

> **Working on this project?** [`AGENTS.md`](AGENTS.md) is the handoff
> document: what the project is, where it is deployed, how to deploy it, and
> the gotchas that have bitten before. Read that first.

- **Canvas.** An X and a Y, each 16, 32, 64, 128, 256 or 512 — a rectangle
  is as ordinary as a square, and a lock button ties the two together when
  you want one. Drag-paint with Bresenham interpolation, an explicit eraser,
  mirror symmetry, 50-level undo.
- **Palettes.** The Void Palette (16), Void Expanded (32) and Void Full (64)
  ship built in and are nested, so switching between them never disturbs
  your art. Twelve hue families, each with the same depth in every palette —
  every hue has a ramp to shade with. Build your own at 16, 32 or 64.
- **Reference images.** Drop a photo on the canvas and trace it under a grid
  overlay, in `Under` or `Over` mode, at any opacity.
- **The pipeline.** Frame a photo under a fixed grid by panning and zooming,
  adjust its levels and saturation, pull a 16/32/64 palette out of it, tune
  that palette for sprites, and convert it to pixel art with cell averaging
  and four matching methods. Every control re-renders the result while you
  drag it — on the canvas itself, in the same canvas you draw in, with the
  photo and the artwork side by side and each on its own zoom.
- **Import and export.** PNG snapped to the palette, JSON round-trips,
  v1 files still load.

## The promise

Your photo is decoded in your browser, drawn to a canvas, and read back into
memory. There is no `fetch`, no `XMLHttpRequest`, no `sendBeacon`, no
`blob:` URL, no form, and no endpoint to send anything to. The nginx access
log for a full pipeline run contains the app's own static files and nothing
else.

Your work *is* stored — on your own machine, in `localStorage` and
IndexedDB. That is a deliberate, documented exception to the house rule,
and **Forget everything** wipes the lot in one click.

## Running it

```bash
./serve.sh          # http://127.0.0.1:8790
```

No build step. No dependencies. Open `index.html` and it works.

## Deploying it

LAN only: its own Proxmox LXC at `192.168.100.100`, nginx serving a
directory, no runtime, no domain, no tunnel.

```bash
./deploy.sh 192.168.100.100
```

`ops/PROVISION.md` is the checklist for standing the container up — cloning
the template, reserving the address, regenerating the SSH host keys and
registering the host. Two of those steps need Proxmox and router credentials
that are deliberately not stored in this repo, so they are done by hand.

The vhost in `ops/nginx/voidpixlr.conf` names `192.0.2.0` — the RFC 5737
documentation address — as a placeholder. `deploy.sh` substitutes the real
address when it installs the file, so a checked-in config can never point at
a machine that is already serving something else.

The deploy script finds the shared nginx snippet and the shared deploy key in
the umbrella repository, which is a **sibling** of this folder. Run it from
inside this folder.

## Testing

```bash
node tests/voidpixlr.test.mjs        # 148 logic checks

python3 tools/make-test-images.py /tmp/vp-images
python3 tests/browser/e2e.py          # 94 end-to-end checks in a real Firefox
python3 tests/browser/hostile.py      # 31 hostile-input checks
```

The browser tests drive a real Firefox over Marionette — a minimal client in
`tests/browser/marionette.py`, no geckodriver, no npm.

### Testing under the real CSP

`python3 -m http.server` sends no `Content-Security-Policy`, so a suite run
against it cannot show that the app works under the shared CSP. The
`csp_server.py` test server fixes that: it parses the umbrella's real
`ops/nginx-snippets/security-headers.conf` and sends exactly those headers.

```bash
python3 tests/browser/csp_server.py --port 8791 &
python3 tests/browser/e2e.py --base http://127.0.0.1:8791
python3 tests/browser/hostile.py --base http://127.0.0.1:8791
```

Both suites pass either way. That is the point — the app has no inline
script and no inline event handler, so `script-src 'self'` allows it.

## The specification

`project.md` is the single source of truth: the architecture, every
decision, the walkthroughs and the acceptance criteria. `project-v1.0.md`
is the archived v1.0.

## Licence and identity

A standalone Void* project. TheVoidCo keeps a registry row that points at this
folder; it holds no copy of the source. Local-first, no accounts, no tracking,
no telemetry.
