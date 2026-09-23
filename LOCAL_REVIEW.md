# Local video review for Codex

This fork adds a review page for rendered MP4 videos. Reviewers can step through frames, draw with the upstream annotation tools, and attach written notes to a frame. The page saves a JSON sidecar beside the video so a local Codex task can read the feedback directly.

## Build once

Use Node.js 18 or newer and pnpm. From the repository root:

```sh
pnpm install --ignore-scripts
cd packages/embed
../../node_modules/.bin/vite build --mode bundle
cd ../../apps/demo
../../node_modules/.bin/tailwindcss -i src/index.css -o review-annotator.css -c tailwind.review.config.cjs --minify
```

The last two commands use `.CMD` instead of the extensionless binary on Windows. The generated annotation bundle is ignored by Git; the checked-in CSS supports the review page without a CDN.

## Review a render

```sh
node scripts/review-server.mjs /absolute/path/to/render.mp4 30
```

The optional second argument is the render's frame rate; it defaults to 24 fps. Open `http://127.0.0.1:4173/` in Codex's browser panel. Set `REVIEW_PORT` if another review is already using port 4173. The server binds to loopback, so remote worker access requires a tunnel or an authenticated reverse proxy.

Click a frame control to step through the video, draw arrows or other marks, type a note, and choose **Add note**. Drawings and notes save automatically. **Save now** forces an immediate write. Reloading the page restores them.

Feedback is written to `<video>.feedback.json` in the same directory as the video. It contains the video filename, fps, frame-indexed text notes, and upstream vector annotations. Keep the video and sidecar together when moving a review between machines. Codex can read the sidecar and seek to the marked frames in the source video.

The browser must support the video's codec. H.264 MP4 is the practical default for Blender and game-engine review renders.
