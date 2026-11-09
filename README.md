# VoidPixlr

A pixel-art canvas for 16, 32 and 64 px square art. Pick a palette, draw,
save it as a PNG.

**Nothing is uploaded. Nothing is ever sent anywhere.**

> **This repository is a backup.** The site is served from its own container
> on the LAN — http://192.168.100.100/ — by nginx serving a directory. There
> is no GitHub Pages here, no CI, and no build step: the repository exists so
> the source has a second home off the machine, and nothing else.

> **Working on this project?** [`AGENTS.md`](AGENTS.md) is the handoff
> document: what the project is, where it is deployed, how to deploy it, and
> the gotchas that have bitten before. Read that first.

- **Canvas.** A square, 16, 32 or 64 pixels a side — the size dropdown
  offers exactly those three. Drag-paint with Bresenham interpolation, an
  explicit eraser, mirror symmetry, 50-level undo.
- **Palettes.** The Void Palette (16), Void Expanded (32) and Void Full (64)
  ship built in and are nested, so switching between them never disturbs
  your art. Twelve hue families, each with the same depth in every palette —
  every hue has a ramp to shade with. Build your own at 16, 32 or 64.
- **One menu, on the left.** Palette and colours are two sections that drop
  open, and the colours are a pop-over. Nothing is open until you want it.
- **Import and export.** PNG snapped to the palette, JSON round-trips,
  v1 files still load. A file dropped anywhere on the page comes in as
  artwork.
- **Zoom.** 1× to 64× art-pixel scale, plus `Fit`, with a grid that can be
  switched off when it gets in the way.

## What this project is not

There is no photograph in it. No photo to trace, no source pane, no grid
overlay, no adjustments, no conversion.

Turning a photograph into pixel art is **VoidPixelatr**'s job — a separate
project, on the same desktop, with its own folder, its own specification and
its own tests. The two share the project-file format, so a conversion made
there opens here and an artwork made here opens there. They share nothing
else: not a folder, not a repository, and not a single byte of stored state.

## The promise

Anything you bring in — an image, a project file, a paste — is decoded in
your browser, drawn to a canvas, and read back into memory. There is no
`fetch`, no `XMLHttpRequest`, no `sendBeacon`, no `blob:` URL, no form, and
no endpoint to send anything to. The nginx access log contains the app's own
static files and nothing else.

Your work *is* stored — on your own machine, in `localStorage`. That is a
deliberate, documented exception to the house rule, and **Forget everything**
wipes the lot in one click.

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
node tests/voidpixlr.test.mjs        # 98 logic checks

python3 tools/make-test-images.py /tmp/vp-images
python3 tests/browser/e2e.py          # 66 end-to-end checks in a real Firefox
python3 tests/browser/hostile.py      # 20 hostile-input checks
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
