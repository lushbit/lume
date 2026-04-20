"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Library, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useLibrary } from "@/hooks/use-library";
const LUSHBIT = "#1a5d3b";

export default function Home() {
  const router = useRouter();
  const { items, removeItem, clear } = useLibrary();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dissolving, setDissolving] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    document.title = "Lume - Main";
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "https:") {
        throw new Error("Please use a valid https link.");
      }

      setDissolving(true);
      window.setTimeout(() => {
        router.push(`/reader?url=${encodeURIComponent(parsed.toString())}`);
      }, 550);
    } catch {
      setError("Paste a valid HTTPS URL to continue.");
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={dissolving ? "dissolve" : "entry"}
        initial={{ opacity: 0, filter: "blur(8px)" }}
        animate={{ opacity: dissolving ? 0 : 1, filter: dissolving ? "blur(14px)" : "blur(0px)" }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className="grain-animate relative grid h-screen overflow-hidden place-items-center bg-neutral-950 px-6 text-neutral-100 sm:px-10"
      >
        <button
          type="button"
          onClick={() => setLibraryOpen((value) => !value)}
          className="fixed right-4 top-4 z-40 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-4 py-2 text-sm text-white backdrop-blur-md transition hover:scale-[1.02] sm:right-6 sm:top-6"
          style={libraryOpen ? { borderColor: LUSHBIT, color: LUSHBIT } : undefined}
        >
          <Library size={16} />
          Library
          {items.length > 0 ? (
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">{items.length}</span>
          ) : null}
        </button>

        <AnimatePresence>
          {libraryOpen ? (
            <motion.aside
              initial={{ x: 360, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 360, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="fixed right-0 top-0 z-50 h-screen w-[min(360px,88vw)] border-l border-white/15 bg-neutral-900/90 p-5 text-neutral-100 backdrop-blur-2xl"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm uppercase tracking-[0.2em] opacity-70">The Library</h2>
                <button
                  type="button"
                  onClick={() => setLibraryOpen(false)}
                  className="rounded-full border border-current/15 p-1.5 transition hover:bg-black/10"
                >
                  <X size={14} />
                </button>
              </div>

              {items.length === 0 ? (
                <p className="mt-16 text-center text-sm opacity-70">Saved articles will appear here.</p>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <article
                      key={item.url}
                      className="space-y-2 rounded-2xl border border-white/15 bg-neutral-950/70 p-3 backdrop-blur-md"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full border border-white/25 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white">
                          {item.vibe}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(item.url)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-500 bg-rose-600 text-white transition hover:bg-rose-500"
                          aria-label={`Delete ${item.title}`}
                          title="Delete article"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <h3 className="line-clamp-2 text-sm font-medium">{item.title}</h3>
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          href={`/reader?url=${encodeURIComponent(item.url)}&theme=${encodeURIComponent(item.vibe)}`}
                          className="inline-flex items-center rounded-full border border-white/70 bg-white px-3 py-1.5 text-sm font-semibold leading-none text-black antialiased transition hover:bg-zinc-200"
                        >
                          Open
                        </Link>
                        <span className="text-xs opacity-60">{new Date(item.savedAt).toLocaleDateString()}</span>
                      </div>
                    </article>
                  ))}
                  <button
                    type="button"
                    onClick={clear}
                    className="mt-2 w-full rounded-full border border-white/60 bg-white px-3 py-2 text-sm font-semibold leading-none text-black antialiased transition hover:bg-zinc-200"
                  >
                    Clear Library
                  </button>
                </div>
              )}
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <section className="w-full max-w-4xl">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mx-auto text-center text-6xl font-semibold uppercase tracking-[0.2em] text-white sm:text-8xl">LUME</h1>
            <h2 className="mx-auto mt-4 max-w-2xl text-center text-2xl font-semibold leading-tight sm:text-4xl">
              Read the web, not the{" "}
              <span className="noise-mark">
                <span className="noise-bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="noise-text">noise</span>
                <span className="noise-bars noise-bars-right" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-sm text-white/75 sm:text-base">
              Open any article in a calm, ad-free space built for focused reading.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mx-auto mt-10 w-full max-w-3xl">
            <div className="group flex items-center border-b border-white/30 px-1 transition-colors duration-300 focus-within:border-white/80">
              <input
                id="link-input"
                type="url"
                placeholder="Paste an article link"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="h-14 w-full bg-transparent px-1 text-lg text-white outline-none placeholder:text-white/45 sm:text-xl"
                autoComplete="off"
                inputMode="url"
                required
              />
              <button
                type="submit"
                className="mb-1 inline-flex h-10 min-w-10 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200"
                aria-label="Open reader"
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <p className="mt-3 min-h-5 text-sm text-rose-400">{error ?? ""}</p>
          </form>

          <section className="mx-auto mt-12 w-full max-w-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.22em] opacity-60">History</h2>
              {items.length > 0 ? (
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-full border border-white/60 bg-white px-3 py-1.5 text-sm font-semibold leading-none text-black antialiased transition hover:bg-zinc-200"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {items.length === 0 ? (
              <p className="rounded-2xl border border-white/15 bg-neutral-900/50 px-4 py-5 text-sm opacity-70 backdrop-blur-md">
                Your recently saved reads will appear here.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {items.slice(0, 6).map((item) => (
                  <article key={item.url} className="space-y-2 rounded-2xl border border-white/15 bg-neutral-900/60 p-3 backdrop-blur-md">
                    <span className="inline-block rounded-full border border-white/25 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white">
                      {item.vibe}
                    </span>
                    <h3 className="line-clamp-2 text-sm font-medium">{item.title}</h3>
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/reader?url=${encodeURIComponent(item.url)}&theme=${encodeURIComponent(item.vibe)}`}
                        className="inline-flex items-center rounded-full border border-white/70 bg-white px-3 py-1.5 text-sm font-semibold leading-none text-black antialiased transition hover:bg-zinc-200"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.url)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-500 bg-rose-600 text-white transition hover:bg-rose-500"
                        aria-label={`Delete ${item.title}`}
                        title="Delete article"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </motion.main>
    </AnimatePresence>
  );
}
