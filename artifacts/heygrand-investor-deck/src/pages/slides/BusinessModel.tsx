export default function BusinessModel() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="relative h-full flex flex-col px-[8vw] py-[8vh]">
        <div className="flex items-center gap-[1vw]">
          <span className="h-[0.4vh] w-[3vw] rounded-full bg-primary" />
          <p className="font-hand text-[2.4vw] text-primary leading-none">Business model</p>
        </div>
        <h2 className="mt-[2vh] max-w-[64vw] font-display text-[5vw] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
          Recurring SaaS, priced per facility.
        </h2>

        <div className="mt-[5vh] grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-[1.4vw]">
          <div className="flex flex-col justify-center rounded-[1.2vw] bg-bg p-[2vw] ring-1 ring-line">
            <p className="font-display text-[2.5vw] font-bold text-ink">Self-serve sign-up</p>
            <p className="mt-[1vh] font-body text-[2.4vw] leading-snug text-muted text-pretty">
              A facility registers and onboards its units in minutes.
            </p>
          </div>
          <div className="flex items-center text-primary text-[3vw] font-bold">&#8594;</div>
          <div className="flex flex-col justify-center rounded-[1.2vw] bg-accent p-[2vw] ring-1 ring-primary/20">
            <p className="font-display text-[2.5vw] font-bold text-ink">30-day free trial</p>
            <p className="mt-[1vh] font-body text-[2.4vw] leading-snug text-text/70 text-pretty">
              Full product access to prove value before any payment.
            </p>
          </div>
          <div className="flex items-center text-primary text-[3vw] font-bold">&#8594;</div>
          <div className="flex flex-col justify-center rounded-[1.2vw] bg-primary p-[2vw]">
            <p className="font-display text-[2.5vw] font-bold text-bg">Paid subscription</p>
            <p className="mt-[1vh] font-body text-[2.4vw] leading-snug text-bg/80 text-pretty">
              Per-facility recurring revenue, billed through Stripe.
            </p>
          </div>
        </div>

        <div className="mt-auto">
          <p className="font-body text-[2.2vw] font-semibold text-muted">Managed lifecycle</p>
          <div className="mt-[1.6vh] flex flex-wrap gap-[1.2vw]">
            <span className="rounded-full bg-bg px-[2vw] py-[1.4vh] font-body text-[2.4vw] font-medium text-ink ring-1 ring-line">Trial</span>
            <span className="rounded-full bg-bg px-[2vw] py-[1.4vh] font-body text-[2.4vw] font-medium text-ink ring-1 ring-line">Active</span>
            <span className="rounded-full bg-bg px-[2vw] py-[1.4vh] font-body text-[2.4vw] font-medium text-ink ring-1 ring-line">Paused</span>
            <span className="rounded-full bg-bg px-[2vw] py-[1.4vh] font-body text-[2.4vw] font-medium text-ink ring-1 ring-line">Cancelled</span>
          </div>
        </div>
      </div>
    </div>
  );
}
