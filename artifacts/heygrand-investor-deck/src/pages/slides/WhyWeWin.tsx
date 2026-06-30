import { PresenceRings } from "@/components/Brand";

export default function WhyWeWin() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ink text-bg">
      <div className="absolute -left-[16vw] -bottom-[16vw] w-[40vw] text-primary opacity-60">
        <PresenceRings className="w-full" />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(50vw 50vw at 85% 15%, hsl(174 62% 38% / 0.16), transparent 70%)",
        }}
      />

      <div className="relative h-full flex flex-col px-[8vw] py-[5vh]">
        <div className="flex items-center gap-[1vw]">
          <span className="h-[0.4vh] w-[3vw] rounded-full bg-primary" />
          <p className="font-hand text-[2.4vw] text-primary leading-none">Why we win</p>
        </div>
        <h2 className="mt-[1.4vh] max-w-[64vw] font-display text-[4.4vw] font-extrabold leading-[1.02] tracking-tight text-bg text-balance">
          A moat built on privacy and trust.
        </h2>

        <div className="mt-[4vh] flex flex-col gap-[1.8vh]">
          <div className="flex items-baseline gap-[2vw] border-b border-bg/12 pb-[1.8vh]">
            <span className="w-[4vw] shrink-0 font-display text-[2.6vw] font-extrabold text-primary">01</span>
            <p className="w-[28vw] shrink-0 font-display text-[2.5vw] font-bold text-bg">Privacy by design</p>
            <p className="flex-1 font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">Motion sensors, no cameras.</p>
          </div>
          <div className="flex items-baseline gap-[2vw] border-b border-bg/12 pb-[1.8vh]">
            <span className="w-[4vw] shrink-0 font-display text-[2.6vw] font-extrabold text-primary">02</span>
            <p className="w-[28vw] shrink-0 font-display text-[2.5vw] font-bold text-bg">Company + safety in one</p>
            <p className="flex-1 font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">Loneliness and danger, solved together.</p>
          </div>
          <div className="flex items-baseline gap-[2vw] border-b border-bg/12 pb-[1.8vh]">
            <span className="w-[4vw] shrink-0 font-display text-[2.6vw] font-extrabold text-primary">03</span>
            <p className="w-[28vw] shrink-0 font-display text-[2.5vw] font-bold text-bg">Feels like family</p>
            <p className="flex-1 font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">A warm relationship, not a gadget.</p>
          </div>
          <div className="flex items-baseline gap-[2vw] border-b border-bg/12 pb-[1.8vh]">
            <span className="w-[4vw] shrink-0 font-display text-[2.6vw] font-extrabold text-primary">04</span>
            <p className="w-[28vw] shrink-0 font-display text-[2.5vw] font-bold text-bg">Dual-hardware flexibility</p>
            <p className="flex-1 font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">Existing ADT, or our own units.</p>
          </div>
          <div className="flex items-baseline gap-[2vw]">
            <span className="w-[4vw] shrink-0 font-display text-[2.6vw] font-extrabold text-primary">05</span>
            <p className="w-[28vw] shrink-0 font-display text-[2.5vw] font-bold text-bg">Built for operators</p>
            <p className="flex-1 font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">True multi-tenant SaaS with fleet tools.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
