export type ThemeName =
  | "Ethereal"
  | "Midnight"
  | "Organic"
  | "Focus"
  | "Evergreen"
  | "Vellum"
  | "Nord"
  | "Dusk";

type ThemeConfig = {
  label: ThemeName;
  background: string;
  foreground: string;
  fontFamily: string;
  proseClassName: string;
  dockClassName: string;
  accent: string;
  quoteBackground: string;
};

export const THEME_ORDER: ThemeName[] = ["Ethereal", "Midnight", "Organic", "Focus", "Evergreen", "Vellum", "Nord", "Dusk"];

export const themeConfig: Record<ThemeName, ThemeConfig> = {
  Ethereal: {
    label: "Ethereal",
    background: "#fdf4ff",
    foreground: "#3b0764",
    fontFamily: "var(--font-playfair)",
    proseClassName: "bg-gradient-to-br from-rose-50 to-indigo-50 text-violet-950",
    dockClassName: "border-white/40 bg-white/55 text-violet-900",
    accent: "#1a5d3b",
    quoteBackground: "linear-gradient(145deg, #fff1f2 0%, #eef2ff 100%)",
  },
  Midnight: {
    label: "Midnight",
    background: "#0a0a0a",
    foreground: "#d4d4d8",
    fontFamily: "var(--font-ibm-plex-mono)",
    proseClassName: "bg-neutral-950 text-neutral-300",
    dockClassName: "border-neutral-700/80 bg-neutral-900/65 text-neutral-100",
    accent: "#1a5d3b",
    quoteBackground: "linear-gradient(140deg, #050505 0%, #1f2937 100%)",
  },
  Organic: {
    label: "Organic",
    background: "#f5f5f4",
    foreground: "#1c1917",
    fontFamily: "var(--font-quicksand)",
    proseClassName: "bg-stone-100 text-stone-900",
    dockClassName: "border-white/45 bg-white/60 text-stone-900",
    accent: "#1a5d3b",
    quoteBackground: "linear-gradient(140deg, #ecfdf5 0%, #dcfce7 100%)",
  },
  Focus: {
    label: "Focus",
    background: "#ffffff",
    foreground: "#09090b",
    fontFamily: "var(--font-space-grotesk)",
    proseClassName: "bg-white text-black",
    dockClassName: "border-zinc-300/70 bg-white/75 text-zinc-900",
    accent: "#1a5d3b",
    quoteBackground: "linear-gradient(145deg, #ffffff 0%, #f3f4f6 100%)",
  },
  Evergreen: {
    label: "Evergreen",
    background: "#E3E8E2",
    foreground: "#292524",
    fontFamily: "var(--font-source-serif)",
    proseClassName: "bg-[#E3E8E2] text-stone-800",
    dockClassName: "border-stone-400/55 bg-[#e7ece7]/80 text-stone-800",
    accent: "#1a5d3b",
    quoteBackground: "linear-gradient(145deg, #dfe6de 0%, #edf2ec 100%)",
  },
  Vellum: {
    label: "Vellum",
    background: "#F4F1EA",
    foreground: "#3C3C3C",
    fontFamily: "var(--font-cardo)",
    proseClassName: "bg-[#F4F1EA] text-[#3C3C3C]",
    dockClassName: "border-[#c7bca8]/65 bg-[#f6f2ea]/85 text-[#3c3c3c]",
    accent: "#1a5d3b",
    quoteBackground: "linear-gradient(145deg, #f7f3ec 0%, #ece4d4 100%)",
  },
  Nord: {
    label: "Nord",
    background: "#2E3440",
    foreground: "#D8DEE9",
    fontFamily: "var(--font-jetbrains-mono)",
    proseClassName: "bg-[#2E3440] text-[#D8DEE9]",
    dockClassName: "border-[#4f5b70]/70 bg-[#353d4b]/80 text-[#d8dee9]",
    accent: "#88C0D0",
    quoteBackground: "linear-gradient(140deg, #2b303b 0%, #3b4252 100%)",
  },
  Dusk: {
    label: "Dusk",
    background: "#1A1B26",
    foreground: "#cbd5e1",
    fontFamily: "var(--font-manrope)",
    proseClassName: "bg-[#1A1B26] text-slate-300",
    dockClassName: "border-[#39405a]/70 bg-[#212334]/80 text-slate-300",
    accent: "#7aa2f7",
    quoteBackground: "linear-gradient(145deg, #1A1B26 0%, #26293a 100%)",
  },
};
