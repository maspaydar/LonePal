import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { isResidentAuthenticated } from "@/lib/resident-auth";
import {
  Shield,
  Heart,
  Bell,
  Activity,
  MessageCircle,
  Lock,
  Building2,
  Users,
  Clock,
  ArrowRight,
} from "lucide-react";

type Audience = "senior" | "family" | "facility";

const AUDIENCES: { id: Audience; label: string; icon: typeof Heart }[] = [
  { id: "senior", label: "I'm a senior", icon: Heart },
  { id: "family", label: "I'm a family member", icon: Users },
  { id: "facility", label: "I run a facility", icon: Building2 },
];

interface HeroContent {
  eyebrow: string;
  headline: string;
  subcopy: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

const HERO: Record<Audience, HeroContent> = {
  senior: {
    eyebrow: "For seniors",
    headline: "Imagine your grandkid staying with you all the time. You're never lonely again.",
    subcopy:
      "HeyGrand is a friendly voice that's always here — ready to chat any time of day, and quietly watching over you so help is never far away.",
    primary: { label: "Resident sign in", href: "/resident/login" },
  },
  family: {
    eyebrow: "For families",
    headline: "Be there, even when you can't. Daily check-ins and instant alerts for the people you love.",
    subcopy:
      "HeyGrand keeps your parent or grandparent company with warm daily conversations, and alerts you the moment something seems off — so you always know they're okay.",
    primary: { label: "Register your facility", href: "/register" },
    secondary: { label: "Sign in", href: "/login" },
  },
  facility: {
    eyebrow: "For senior living facilities",
    headline: "Keep every resident safe — without adding to your staff's workload.",
    subcopy:
      "AI-powered safety monitoring across your whole facility: proactive inactivity detection, instant alerts, and personalized check-ins — all from one dashboard.",
    primary: { label: "Register your facility", href: "/register" },
    secondary: { label: "Sign in", href: "/login" },
  },
};

const SERVICE_ICONS = [MessageCircle, Activity, Bell, Lock];

interface ServicesContent {
  heading: string;
  intro: string;
  items: { title: string; description: string }[];
}

const SERVICES: Record<Audience, ServicesContent> = {
  senior: {
    heading: "Always here for you",
    intro: "HeyGrand is built to keep you company and keep you safe, every single day.",
    items: [
      {
        title: "A friendly companion",
        description:
          "A warm voice that chats with you any time of day, remembers your stories, and checks in so you never feel alone.",
      },
      {
        title: "Quietly watching over you",
        description:
          "Gentle sensors keep watch in the background — if something doesn't seem right, help is already on the way.",
      },
      {
        title: "Help when you need it",
        description:
          "If you ever need help, the people who care about you are told right away — day or night.",
      },
      {
        title: "Your privacy respected",
        description:
          "Your conversations and your dignity are always protected. HeyGrand is here for you, on your terms.",
      },
    ],
  },
  family: {
    heading: "Peace of mind, wherever you are",
    intro: "Stay close to the people you love, even when life keeps you apart.",
    items: [
      {
        title: "Daily companionship",
        description:
          "Warm AI conversations keep your parent or grandparent company between your visits and calls.",
      },
      {
        title: "Never miss a moment",
        description:
          "Always-on monitoring watches for unusual stillness, so a fall or quiet emergency is never missed.",
      },
      {
        title: "Alerts on your phone",
        description:
          "Get notified the instant something seems off — wherever you happen to be.",
      },
      {
        title: "Private & secure",
        description:
          "Your family's data stays isolated, encrypted, and protected at all times.",
      },
    ],
  },
  facility: {
    heading: "Care that scales with your facility",
    intro: "Proactive monitoring and AI check-ins across every room — without growing your headcount.",
    items: [
      {
        title: "Automated check-ins",
        description:
          "Personalized AI check-ins for every resident, so caring outreach never depends on staff availability.",
      },
      {
        title: "Inactivity detection",
        description:
          "Proactive monitoring across every room and unit, 24/7, surfacing risks before they become emergencies.",
      },
      {
        title: "Faster response",
        description:
          "Route alerts to the right staff instantly so your team responds in seconds, not minutes.",
      },
      {
        title: "Tenant-isolated & secure",
        description:
          "Multi-tenant isolation keeps each facility's resident data fully separated and compliant.",
      },
    ],
  },
};

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useCompanyAuth();
  const [audience, setAudience] = useState<Audience>("family");

  useEffect(() => {
    if (localStorage.getItem("sa_token")) {
      setLocation("/super-admin/dashboard");
    } else if (isAuthenticated()) {
      setLocation("/dashboard");
    } else if (isResidentAuthenticated()) {
      setLocation("/resident/home");
    }
  }, [isAuthenticated, setLocation]);

  const hero = HERO[audience];
  const services = SERVICES[audience];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2" data-testid="brand-logo">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">HeyGrand</span>
          </div>
          <div className="flex items-center gap-2">
            {hero.secondary && (
              <Button variant="ghost" asChild data-testid="link-nav-secondary">
                <Link to={hero.secondary.href}>{hero.secondary.label}</Link>
              </Button>
            )}
            <Button asChild data-testid="link-nav-primary">
              <Link to={hero.primary.href}>{hero.primary.label}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-16 sm:pt-20">
          <div
            className="mx-auto mb-10 flex w-full max-w-xl flex-col gap-2 rounded-xl border bg-card p-1.5 sm:flex-row"
            role="tablist"
            aria-label="Choose who you are"
            data-testid="toggle-audience"
          >
            {AUDIENCES.map(({ id, label, icon: Icon }) => {
              const active = audience === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setAudience(id)}
                  data-testid={`button-audience-${id}`}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mx-auto max-w-3xl text-center">
            <p
              className="mb-4 text-sm font-semibold uppercase tracking-wide text-primary"
              data-testid="text-hero-eyebrow"
            >
              {hero.eyebrow}
            </p>
            <h1
              className="text-balance text-base font-bold leading-tight"
              data-testid="text-hero-headline"
            >
              {hero.headline}
            </h1>
            <p
              className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
              data-testid="text-hero-subcopy"
            >
              {hero.subcopy}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild data-testid="button-hero-primary">
                <Link to={hero.primary.href}>
                  {hero.primary.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {hero.secondary && (
                <Button size="lg" variant="outline" asChild data-testid="button-hero-secondary">
                  <Link to={hero.secondary.href}>{hero.secondary.label}</Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-bold" data-testid="text-services-title">
                {services.heading}
              </h2>
              <p className="mt-3 text-muted-foreground" data-testid="text-services-intro">
                {services.intro}
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {services.items.map(({ title, description }, i) => {
                const Icon = SERVICE_ICONS[i];
                return (
                  <div
                    key={title}
                    className="rounded-xl border bg-card p-6"
                    data-testid={`card-service-${i}`}
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mb-2 font-semibold">{title}</h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <h2 className="max-w-xl text-3xl font-bold" data-testid="text-cta-title">
              Start a 30-day free trial for your facility
            </h2>
            <p className="max-w-xl text-muted-foreground">
              No credit card required. Set up your facility, invite residents, and see the
              difference proactive care makes.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild data-testid="button-cta-register">
                <Link to="/register">
                  Register your facility
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild data-testid="button-cta-resident">
                <Link to="/resident/login">Resident sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>HeyGrand — caring company, always on watch.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-foreground" data-testid="link-footer-signin">
              Sign in
            </Link>
            <Link to="/register" className="hover:text-foreground" data-testid="link-footer-register">
              Register facility
            </Link>
            <Link to="/resident/login" className="hover:text-foreground" data-testid="link-footer-resident">
              Resident sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
