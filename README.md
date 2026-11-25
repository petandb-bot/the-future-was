# The Future Was Small

A pocket video camera inspired by obsolete imaging systems.

[Open the app](https://petandb-bot.github.io/the-future-was/)

## Use

The app opens with a moving test scene. Choose a device and aspect, open the camera or import a file, and adjust the image. All aspects fill the frame by centre-cropping; output dimensions are even and fixed ratios are exact. Record video or save a PNG. Open Last take to preview, download or share the latest capture. On iPhone, open in Safari and choose Add to Home Screen.

Nine devices, live preview, portrait capture, Randomize, presets and local processing. WebGL 1 is preferred; Canvas 2D is a reduced-fidelity fallback.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Camera access requires HTTPS or localhost.

## Limits

Recording is real-time, up to 120 seconds. MP4 availability depends on the browser; Auto may use WebM. Save the last take before reloading. Offline caching is disabled.

## Development

- `main`: stable release (v0.1.9).
- `archive/v0.1.5`: preserved baseline.
- `develop/experimental-devices`: independent experimental edition.

GitHub Pages serves `main` from the repository root. Check `version.json` after deployment.

Browser and iPhone hardware validation is required before claiming recording or GPU recovery reliability.
