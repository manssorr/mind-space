"use client"

import Link from "next/link"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import {
  StickyNote,
  CheckSquare,
  Timer,
  Clock,
  Calendar,
  Target,
  Link as LinkIcon,
  Type,
  Calculator,
  ArrowRight,
  Sparkles,
  LayoutGrid,
  Layers,
  Palette,
  Undo2,
  Move,
} from "lucide-react"

const widgets = [
  { icon: StickyNote, label: "Notes", desc: "Free-form rich text" },
  { icon: CheckSquare, label: "Todos", desc: "Track progress with states" },
  { icon: Timer, label: "Timer", desc: "Countdown & stopwatch" },
  { icon: Clock, label: "Stopwatch", desc: "Lap timing" },
  { icon: Calendar, label: "Calendar", desc: "Monthly notes" },
  { icon: Target, label: "Habits", desc: "Streak tracking" },
  { icon: LinkIcon, label: "Quick Links", desc: "Bookmark with favicon" },
  { icon: Type, label: "Labels", desc: "Inline editable text" },
  { icon: Calculator, label: "Counter", desc: "Configurable increments" },
]

const features = [
  {
    icon: LayoutGrid,
    title: "Infinite Canvas",
    desc: "Pan, zoom, and snap. An endless space for your thoughts.",
  },
  {
    icon: Layers,
    title: "Sheets",
    desc: "Multiple named canvases. Organize by project or topic.",
  },
  {
    icon: Palette,
    title: "12 Color Themes",
    desc: "Personalize every widget with a palette of accents.",
  },
  {
    icon: Undo2,
    title: "Undo / Redo",
    desc: "50-step history stack. Mistakes are temporary.",
  },
  {
    icon: Move,
    title: "Drag & Resize",
    desc: "Free-form positioning with 8 resize handles.",
  },
  {
    icon: Sparkles,
    title: "Keyboard Shortcuts",
    desc: "Space to pan, Ctrl+Z to undo, Ctrl+D to duplicate.",
  },
]

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-dvh">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 h-14 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-foreground flex items-center justify-center">
              <Sparkles className="size-4 text-background" />
            </div>
            <span className="font-semibold tracking-tight">Mind Space</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
            >
              Launch App
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 size-96 rounded-full bg-foreground/3 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 size-96 rounded-full bg-foreground/3 blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted-foreground mb-8">
            <Sparkles className="size-3" />
            v0.1.0 &mdash; your mind, mapped
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
            A canvas for
            <br />
            <span className="bg-gradient-to-r from-foreground via-foreground/80 to-foreground/50 bg-clip-text text-transparent">
              everything on your mind
            </span>
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Mind Space is a freestyle dashboard where notes, todos, timers,
            habits, and links live together on an infinite canvas — organized
            into sheets, styled your way, and kept entirely on your machine.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Enter Mind Space
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <button
              onClick={() => {
                document.getElementById("widgets")?.scrollIntoView({ behavior: "smooth" })
              }}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
            >
              Explore Widgets
            </button>
          </div>
        </div>
      </section>

      {/* Widgets Showcase */}
      <section id="widgets" className="px-6 py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              9 widgets, endless combinations
            </h2>
            <p className="mt-2 text-muted-foreground">
              Mix and match to build your perfect dashboard.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {widgets.map((w) => (
              <div
                key={w.label}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border border-border hover:border-foreground/20 transition-colors text-center"
              >
                <w.icon className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">{w.label}</span>
                <span className="text-xs text-muted-foreground">{w.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Built for flow
            </h2>
            <p className="mt-2 text-muted-foreground">
              Everything you need to capture, organize, and track.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex gap-4 p-5 rounded-xl border border-border hover:bg-accent/50 transition-colors"
              >
                <f.icon className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-sm">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 border-t border-border/50 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Start mapping your mind
          </h2>
          <p className="mt-3 text-muted-foreground">
            No sign-up. No servers. Just you and your canvas.
          </p>
          <Link
            href="/app"
            className="group mt-8 inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Get Started
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <span>Mind Space &mdash; a personal mind organizer</span>
          <span>v0.1.0</span>
        </div>
      </footer>
    </div>
  )
}
