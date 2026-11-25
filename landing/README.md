# Institutional EA — Landing Page

Standalone static marketing and download landing page for **Institutional EA**. Built with plain HTML, CSS, and vanilla JavaScript (no framework, no build step, no `npm install`).

## Structure

```text
landing/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
│   ├── favicon.svg
│   ├── logo.svg
│   ├── mockup-desktop.svg
│   ├── mockup-desktop-alt.svg
│   ├── mockup-phone-main.svg
│   └── mockup-phone-alt.svg
└── README.md
```

## Updating Download Links (including iOS)

All external and download URLs are centralized in the `LINKS` object at the top of `landing/js/main.js`.

When an iOS release becomes available, paste the URL into `LINKS.ios` in `landing/js/main.js`:

```js
const LINKS = {
  // ...
  ios: "https://github.com/gackstone/Institutional-EA/releases/latest/download/...",
};
```

Every iOS button across the navigation menu, hero section, and downloads section will automatically enable and wire up with `target="_blank" rel="noopener noreferrer"`.

## Local Preview

Run any static file server from the `landing/` directory:

### Option 1: Python

```bash
cd landing
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

### Option 2: Node.js (`npx serve`)

```bash
npx serve landing
```

## Static Deployment

Because there is no build step, set the project root/publish directory to `landing`:

- **Vercel**: Import the repository, set **Root Directory** to `landing`, **Framework Preset** to `Other`, and leave Build Command empty.
- **GitHub Pages**: Deploy the `landing/` folder via a GitHub Actions workflow using `actions/upload-pages-artifact` with `path: landing`, or publish the `landing/` contents to your Pages branch.
- **Netlify / Cloudflare Pages**: Set **Publish directory** (or **Build output directory**) to `landing` with no build command.
