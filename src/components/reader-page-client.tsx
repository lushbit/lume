"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BookmarkPlus, Copy, Crosshair, LoaderCircle, Palette, Type, Zap } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "@/hooks/use-library";
import { processReaderHtml } from "@/lib/content-utils";
import { THEME_ORDER, type ThemeName, themeConfig } from "@/lib/vibe";
import { useTheme } from "@/components/theme-context";

type ExtractResponse = {
  title: string;
  byline: string;
  content: string;
  text: string;
  sourceUrl: string;
  error?: string;
  message?: string;
};

const LUSHBIT = "#1a5d3b";

function splitContentBlocks(content: string) {
  if (typeof window === "undefined") {
    return [content];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  const blocks = Array.from(doc.body.childNodes)
    .map((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as Element).outerHTML;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() ?? "";
        return text ? `<p>${text}</p>` : "";
      }
      return "";
    })
    .filter(Boolean);

  return blocks.length > 0 ? blocks : [content];
}

export default function ReaderPage() {
  const searchParams = useSearchParams();
  const inputUrl = searchParams.get("url");
  const inputTheme = searchParams.get("theme");
  const [article, setArticle] = useState<ExtractResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(inputUrl));
  const [progress, setProgress] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fontMorphing, setFontMorphing] = useState(false);
  const [bionicMode, setBionicMode] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [revealedImageKeys, setRevealedImageKeys] = useState<string[]>([]);
  const { activeTheme, setTheme } = useTheme();
  const { saveItem, removeItem, isSaved, getItem, updateItemTheme } = useLibrary();

  const articleContainerRef = useRef<HTMLDivElement | null>(null);
  const themePickerRef = useRef<HTMLDivElement | null>(null);
  const backFadeTimeoutRef = useRef<number | null>(null);
  const fontMorphTimeoutRef = useRef<number | null>(null);
  const previousThemeRef = useRef(activeTheme);
  const processedContent = useMemo(() => processReaderHtml(article?.content ?? "", bionicMode), [article?.content, bionicMode]);
  const blocks = useMemo(() => splitContentBlocks(processedContent), [processedContent]);

  useEffect(() => {
    backFadeTimeoutRef.current = window.setTimeout(() => {
      setShowBack(false);
    }, 1000);

    const onMouseMove = () => {
      setShowBack(true);
      if (backFadeTimeoutRef.current !== null) {
        window.clearTimeout(backFadeTimeoutRef.current);
      }
      backFadeTimeoutRef.current = window.setTimeout(() => setShowBack(false), 1200);
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => {
      if (backFadeTimeoutRef.current !== null) {
        window.clearTimeout(backFadeTimeoutRef.current);
      }
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  useEffect(() => {
    const root = articleContainerRef.current;
    if (!root) {
      return;
    }
    const revealed = new Set(revealedImageKeys);
    const wrappers = Array.from(root.querySelectorAll<HTMLElement>("[data-lume-zen-key]"));
    for (const wrapper of wrappers) {
      const key = wrapper.getAttribute("data-lume-zen-key");
      if (!key) {
        continue;
      }
      const nextState = revealed.has(key) ? "true" : "false";
      if (wrapper.getAttribute("data-revealed") !== nextState) {
        wrapper.setAttribute("data-revealed", nextState);
      }
    }
  });

  useEffect(() => {
    const updateProgress = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const nextProgress = totalHeight <= 0 ? 0 : Math.min(100, (window.scrollY / totalHeight) * 100);
      setProgress(nextProgress);
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);

    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  useEffect(() => {
    if (!inputUrl) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const MAX_ATTEMPTS = 4;
        let attempt = 0;

        while (attempt < MAX_ATTEMPTS) {
          attempt += 1;
          let response: Response;
          try {
            response = await fetch("/api/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: inputUrl }),
              signal: controller.signal,
            });
          } catch (fetchError) {
            if ((fetchError as Error).name === "AbortError") {
              throw fetchError;
            }
            if (attempt >= MAX_ATTEMPTS) {
              throw new Error("Could not reach this website right now. Check the link and try again.");
            }
            await new Promise<void>((resolve) => {
              window.setTimeout(() => resolve(), Math.min(1400, 350 + attempt * 160));
            });
            continue;
          }

          const payload = (await response.json()) as ExtractResponse;
          if (response.ok) {
            setArticle(payload);
            return;
          }

          const terminalError =
            payload.message ??
            (payload.error === "low_content_density"
              ? "This page does not have enough readable article content."
              : payload.error ?? "We could not parse this link.");
          const isTerminal = response.status === 400 || response.status === 422;

          if (isTerminal || attempt >= MAX_ATTEMPTS) {
            throw new Error(terminalError);
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), Math.min(1400, 350 + attempt * 160));
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [inputUrl]);

  useEffect(() => {
    if (!inputTheme) {
      return;
    }
    if (!(inputTheme in themeConfig)) {
      return;
    }
    setTheme(inputTheme as ThemeName);
  }, [inputTheme, setTheme]);

  useEffect(() => {
    if (previousThemeRef.current === activeTheme) {
      return;
    }
    previousThemeRef.current = activeTheme;
    setFontMorphing(true);
    if (fontMorphTimeoutRef.current !== null) {
      window.clearTimeout(fontMorphTimeoutRef.current);
    }
    fontMorphTimeoutRef.current = window.setTimeout(() => {
      setFontMorphing(false);
    }, 520);
  }, [activeTheme]);

  useEffect(() => {
    return () => {
      if (fontMorphTimeoutRef.current !== null) {
        window.clearTimeout(fontMorphTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!themeMenuOpen) {
      return;
    }

    const closeMenu = () => {
      setThemeMenuOpen(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!themePickerRef.current) {
        closeMenu();
        return;
      }
      if (!themePickerRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", closeMenu, { passive: true, capture: true });
    window.addEventListener("wheel", closeMenu, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", closeMenu, { capture: true } as EventListenerOptions);
      window.removeEventListener("wheel", closeMenu);
    };
  }, [themeMenuOpen]);

  const copyCleanLink = async () => {
    if (!article?.sourceUrl) {
      return;
    }
    await navigator.clipboard.writeText(article.sourceUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };

  const revealFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const trigger =
      target.closest("[data-lume-reveal]") ??
      target.closest("[data-lume-reveal-area]") ??
      target.closest(".lume-zen-target");
    if (!trigger) {
      return;
    }
    const wrapper = trigger.closest("[data-lume-zen]");
    if (wrapper instanceof HTMLElement) {
      const key = wrapper.getAttribute("data-lume-zen-key");
      if (!key) {
        return;
      }
      setRevealedImageKeys((current) => {
        if (current.includes(key)) {
          return current.filter((item) => item !== key);
        }
        return [...current, key];
      });
    }
  };

  const toggleSaved = () => {
    if (!article) {
      return;
    }
    if (isSaved(article.sourceUrl)) {
      removeItem(article.sourceUrl);
      return;
    }
    saveItem({
      title: article.title,
      url: article.sourceUrl,
      vibe: activeTheme,
    });
  };

  useEffect(() => {
    if (!article?.sourceUrl) {
      return;
    }
    const savedItem = getItem(article.sourceUrl);
    if (!savedItem) {
      return;
    }
    if (savedItem.vibe !== activeTheme) {
      updateItemTheme(article.sourceUrl, activeTheme);
    }
  }, [article?.sourceUrl, activeTheme, getItem, updateItemTheme]);

  const currentTheme = themeConfig[activeTheme];
  const saved = Boolean(article && isSaved(article.sourceUrl));
  const selectedThemeKey = activeTheme;
  const themeOptions = useMemo(
    () =>
      THEME_ORDER.map((theme) => ({
        key: theme,
        label: theme,
        style: {
          backgroundColor: themeConfig[theme].background,
          color: themeConfig[theme].foreground,
        },
      })),
    [],
  );

  useEffect(() => {
    if (article?.title?.trim()) {
      document.title = `Lume - ${article.title.trim()}`;
      return;
    }
    document.title = loading ? "Lume - Loading" : "Lume - Reader";
  }, [article?.title, loading]);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center px-6 py-10">
        <div className="flex items-center gap-3 text-sm sm:text-base">
          <LoaderCircle className="animate-spin" size={20} />
          <span>Loading...</span>
        </div>
      </main>
    );
  }

  if (!article && !error) {
    return (
      <main className="min-h-screen grid place-items-center px-6 py-10">
        <div className="flex items-center gap-3 text-sm sm:text-base">
          <LoaderCircle className="animate-spin" size={20} />
          <span>Loading...</span>
        </div>
      </main>
    );
  }

  if (error) {
    const fallbackError = inputUrl
      ? "We are having trouble loading this page right now."
      : "Open Lume from the entry page with a valid article link.";

    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="max-w-lg space-y-4 rounded-3xl border border-white/30 bg-white/50 p-8 text-center backdrop-blur-xl">
          <h1 className="text-3xl font-semibold tracking-tight">Website Not Allowed</h1>
          <p className="text-sm sm:text-base opacity-80">{error ?? fallbackError}</p>
          <div className="flex items-center justify-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-current/20 px-4 py-2 text-sm transition hover:scale-[1.02]"
            >
              <ArrowLeft size={16} />
              Return to Entry
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!article) {
    return null;
  }

  return (
    <main
      className={`relative min-h-screen pb-28 transition-[background-color,color,border-color,box-shadow] duration-[1350ms] ease-in-out ${currentTheme.proseClassName}`}
    >
      <div className="fixed left-0 top-0 z-40 h-[2px] w-full bg-black/10">
        <motion.div
          className="h-full origin-left bg-current"
          animate={{ scaleX: Math.max(0, progress / 100) }}
          transition={{ duration: 0.15, ease: "linear" }}
        />
      </div>

      <AnimatePresence>
        {showBack ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed left-4 top-4 z-40 sm:left-6 sm:top-6"
          >
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-current/25 bg-black/5 px-2.5 py-1.5 text-sm backdrop-blur-md"
            >
              <ArrowLeft size={17} />
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <article
        ref={articleContainerRef}
        onClick={(event) => {
          revealFromTarget(event.target);
        }}
        className={`mx-auto w-full max-w-2xl px-6 pt-20 transition-[opacity,filter] duration-[520ms] ease-out sm:px-10 sm:pt-24 ${fontMorphing ? "opacity-90 blur-[0.5px]" : "opacity-100 blur-0"}`}
      >
        <header className="mb-12 space-y-3">
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm underline underline-offset-4 opacity-70 transition hover:opacity-100"
          >
            Open original page
          </a>
          <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">{article.title}</h1>
          {article.byline ? <p className="text-sm opacity-70">{article.byline}</p> : null}
        </header>

        <div className={`space-y-6 ${largeText ? "text-xl leading-9 sm:text-2xl sm:leading-10" : "text-lg leading-8"}`}>
          {blocks.map((block, index) => (
            <motion.div
              key={`${index}-${block.slice(0, 12)}`}
              initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.65, ease: "easeOut" }}
              dangerouslySetInnerHTML={{ __html: block }}
              className="selection:bg-current/20 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-current/35 [&_blockquote]:pl-4 [&_h2]:mt-8 [&_h2]:text-3xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:text-2xl [&_h3]:font-semibold [&_h4]:mt-7 [&_h4]:text-xl [&_h4]:font-semibold [&_h5]:mt-6 [&_h5]:text-lg [&_h5]:font-semibold [&_h6]:mt-6 [&_h6]:text-base [&_h6]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:opacity-95 [&_p>strong:first-child]:mt-7 [&_p>strong:first-child]:mb-2 [&_p>strong:first-child]:block [&_p>strong:first-child]:text-[1.15em] [&_p>strong:first-child]:font-semibold [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-current/20 [&_pre]:p-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-6"
            />
          ))}
        </div>
      </article>

      <motion.nav
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className={`fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-2 shadow-lg backdrop-blur-xl transition-[background-color,color,border-color,box-shadow] duration-[1350ms] ease-in-out sm:bottom-6 sm:gap-2.5 ${currentTheme.dockClassName}`}
      >
        <button
          type="button"
          onClick={() => setBionicMode((value) => !value)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition hover:bg-black/10"
          style={bionicMode ? { backgroundColor: LUSHBIT, color: "#fff" } : undefined}
        >
          <Zap size={15} />
          {bionicMode ? "Bionic On" : "Bionic"}
        </button>
        <button
          type="button"
          onClick={() => setLargeText((value) => !value)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition hover:bg-black/10"
        >
          <Type size={15} />
          {largeText ? "Default" : "Larger"}
        </button>
        <button
          type="button"
          onClick={toggleSaved}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition hover:bg-black/10"
          style={saved ? { backgroundColor: LUSHBIT, color: "#fff" } : undefined}
        >
          <BookmarkPlus size={15} />
          {saved ? "Unsave" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            void copyCleanLink();
          }}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition hover:bg-black/10"
        >
          <Copy size={15} />
          {copied ? "Copied" : "Copy Link"}
        </button>
        <div ref={themePickerRef} className="inline-flex items-center">
          <button
            type="button"
            onClick={() => setThemeMenuOpen((value) => !value)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-current/20 transition hover:bg-black/10"
            aria-label="Theme picker"
            aria-expanded={themeMenuOpen}
          >
            <Palette size={15} />
          </button>
          <div
            className={`ml-2 inline-flex items-center gap-1 transition-all duration-300 ${themeMenuOpen ? "max-w-[420px] overflow-visible opacity-100" : "pointer-events-none max-w-0 overflow-hidden opacity-0"}`}
          >
            {themeOptions.map((option) => {
              const isActive = selectedThemeKey === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setTheme(option.key as ThemeName);
                    setThemeMenuOpen(false);
                  }}
                  className="group/theme relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/20 transition hover:scale-105"
                  style={{
                    ...option.style,
                    boxShadow: isActive ? `0 0 0 2px ${currentTheme.accent}` : "none",
                  }}
                  aria-label={`Use ${option.label} theme`}
                  title={option.label}
                >
                  {option.key === "Focus" ? <Crosshair size={12} /> : null}
                  {option.key !== "Focus" ? (
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-black/20"
                      style={{ backgroundColor: themeConfig[option.key].foreground }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-current/20 bg-black/75 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover/theme:opacity-100">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.nav>
    </main>
  );
}

