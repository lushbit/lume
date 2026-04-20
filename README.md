# Lume

Read the web, not the noise. 🔊

Lume is a clean reading space for web articles.  
Paste a link, and Lume opens a calmer version of the article so you can focus on the content instead of ads, popups, and visual clutter.

## Why Lume?

Most websites are built to keep your attention.  
Lume is built to protect it. ✨

With Lume, you get:

- A distraction-free article view
- Comfortable reading themes
- Quick controls like larger text and bionic mode
- A personal library of saved articles
- Per-article theme memory, so your saved reads keep their style

## How to Use (Everyone)

1. Open Lume
2. Paste an article URL
3. Read in a cleaner, calmer layout
4. Save articles to your library if you want to revisit them

If you don’t want to self-host, use the public instance:

- **Lume Public URL:** _Add your deployed URL here_

## For Developers & Hosters

### Stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- Mozilla Readability + JSDOM
- DOMPurify sanitization

### Local setup

Requirements:

- Node.js 20+
- npm

Install:

```bash
npm install
```

Run development:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Production:

```bash
npm run build
npm run start
```

### Operational notes

- Lume uses server-side extraction via `/api/extract`.
- If deployed behind a proxy/CDN, ensure client IP forwarding is configured correctly.
