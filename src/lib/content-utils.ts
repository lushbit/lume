function walkTextNodes(root: Node, callback: (node: Text) => void) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  for (const node of nodes) {
    callback(node);
  }
}

export function applyBionic(html: string) {
  if (typeof window === "undefined" || !html) {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const skipTags = new Set(["CODE", "PRE", "SCRIPT", "STYLE"]);

  walkTextNodes(doc.body, (textNode) => {
    const parentTag = textNode.parentElement?.tagName ?? "";
    if (skipTags.has(parentTag)) {
      return;
    }

    const text = textNode.nodeValue ?? "";
    if (!text.trim()) {
      return;
    }

    const regex = /\b(\w+)\b/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    const fragment = doc.createDocumentFragment();
    let changed = false;

    while ((match = regex.exec(text)) !== null) {
      const [word] = match;
      const start = match.index;
      const half = Math.max(1, Math.ceil(word.length * 0.5));

      if (start > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, start)));
      }

      const strong = doc.createElement("b");
      strong.textContent = word.slice(0, half);
      fragment.appendChild(strong);
      fragment.appendChild(doc.createTextNode(word.slice(half)));

      lastIndex = start + word.length;
      changed = true;
    }

    if (!changed) {
      return;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }

    textNode.replaceWith(fragment);
  });

  return doc.body.innerHTML;
}

export function applyZenImages(html: string) {
  if (typeof window === "undefined" || !html) {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));
  const seenSources = new Set<string>();
  for (const image of images) {
    if (image.closest("[data-lume-zen='true']")) {
      continue;
    }

    const candidateSrc =
      image.getAttribute("src") ??
      image.getAttribute("data-src") ??
      image.getAttribute("data-original") ??
      image.getAttribute("data-lazy-src") ??
      "";

    if (!image.getAttribute("src") && candidateSrc) {
      image.setAttribute("src", candidateSrc);
    }

    const resolvedSrc = (image.getAttribute("src") ?? "").trim();
    if (!resolvedSrc) {
      image.remove();
      continue;
    }

    const sourceKey = resolvedSrc.toLowerCase();
    if (!sourceKey.startsWith("data:") && seenSources.has(sourceKey)) {
      const removable = image.parentElement?.tagName === "PICTURE" ? image.parentElement : image;
      removable?.remove();
      continue;
    }
    if (!sourceKey.startsWith("data:")) {
      seenSources.add(sourceKey);
    }

    const wrapper = doc.createElement("div");
    wrapper.className = "lume-zen-image group relative overflow-hidden rounded-2xl border border-current/15";
    wrapper.setAttribute("data-lume-zen", "true");
    wrapper.setAttribute("data-lume-zen-key", sourceKey);

    image.classList.add("lume-zen-target", "w-full", "h-auto", "transition-all", "duration-700", "ease-out");
    image.setAttribute("loading", "lazy");

    const overlay = doc.createElement("div");
    overlay.className =
      "lume-zen-overlay absolute inset-0 flex items-center justify-center bg-black/15 transition-all duration-700";
    overlay.setAttribute("data-lume-reveal-area", "true");
    overlay.setAttribute("aria-label", "Reveal visual");

    const label = doc.createElement("span");
    label.className =
      "pointer-events-none text-xs uppercase tracking-[0.22em] text-white";
    label.textContent = "Reveal Visual";

    const mediaElement = image.parentElement?.tagName === "PICTURE" ? image.parentElement : image;

    overlay.appendChild(label);
    mediaElement.replaceWith(wrapper);
    wrapper.appendChild(mediaElement);
    wrapper.appendChild(overlay);
  }

  return doc.body.innerHTML;
}

export function processReaderHtml(html: string, bionic: boolean) {
  const withImages = applyZenImages(html);
  if (!bionic) {
    return withImages;
  }
  return applyBionic(withImages);
}
