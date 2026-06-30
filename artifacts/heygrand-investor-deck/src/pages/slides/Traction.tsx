export default function Traction() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="relative h-full flex flex-col px-[8vw] py-[5vh]">
        <div className="flex items-center gap-[1vw]">
          <span className="h-[0.4vh] w-[3vw] rounded-full bg-primary" />
          <p className="font-hand text-[2.4vw] text-primary leading-none">Traction &amp; roadmap</p>
        </div>
        <h2 className="mt-[1.4vh] max-w-[64vw] font-display text-[4.4vw] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
          Built, shipping, and ready to scale.
        </h2>

        <div className="mt-[3.5vh] grid grid-cols-2 gap-[3vw]">
          <div className="rounded-[1.2vw] bg-accent p-[2.2vw] ring-1 ring-primary/20">
            <p className="font-display text-[2.6vw] font-bold text-primary-deep">Live today</p>
            <div className="mt-[1.8vh] flex flex-col gap-[1.5vh]">
              <p className="font-body text-[2.3vw] leading-snug text-ink">Multi-tenant platform, live</p>
              <p className="font-body text-[2.3vw] leading-snug text-ink">Dual-agent AI companion</p>
              <p className="font-body text-[2.3vw] leading-snug text-ink">Dual hardware support</p>
              <p className="font-body text-[2.3vw] leading-snug text-ink">Stripe billing + lifecycle</p>
              <p className="font-body text-[2.3vw] leading-snug text-ink">Super-admin ops with 2FA</p>
            </div>
          </div>

          <div className="rounded-[1.2vw] bg-bg p-[2.2vw] ring-1 ring-line">
            <div className="flex items-center justify-between">
              <p className="font-display text-[2.6vw] font-bold text-ink">What&apos;s next</p>
              <span className="rounded-full bg-primary/10 px-[1.2vw] py-[0.7vh] font-body text-[2.2vw] font-semibold text-primary">Illustrative</span>
            </div>
            <div className="mt-[1.8vh] flex flex-col gap-[1.8vh]">
              <div className="flex items-baseline gap-[1.4vw]">
                <span className="w-[9vw] shrink-0 font-display text-[2.3vw] font-bold text-primary">2026 H2</span>
                <p className="flex-1 font-body text-[2.3vw] leading-snug text-muted text-pretty">First paying facilities</p>
              </div>
              <div className="flex items-baseline gap-[1.4vw]">
                <span className="w-[9vw] shrink-0 font-display text-[2.3vw] font-bold text-primary">2027 H1</span>
                <p className="flex-1 font-body text-[2.3vw] leading-snug text-muted text-pretty">Regional + integration partners</p>
              </div>
              <div className="flex items-baseline gap-[1.4vw]">
                <span className="w-[9vw] shrink-0 font-display text-[2.3vw] font-bold text-primary">2027 H2</span>
                <p className="flex-1 font-body text-[2.3vw] leading-snug text-muted text-pretty">Clinical validation work</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
