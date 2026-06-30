import { BrandMark, PresenceRings } from "@/components/Brand";

export default function TheAsk() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ink text-bg">
      <div className="absolute -right-[14vw] -top-[14vw] w-[44vw] text-primary opacity-70">
        <PresenceRings className="w-full" />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55vw 55vw at 20% 90%, hsl(174 62% 38% / 0.16), transparent 70%)",
        }}
      />

      <div className="relative h-full flex flex-col justify-between px-[8vw] py-[6vh]">
        <BrandMark variant="dark" />

        <div>
          <div className="flex items-center gap-[1.4vw]">
            <p className="font-hand text-[2.6vw] text-primary leading-none">The ask</p>
            <span className="rounded-full bg-bg/10 px-[1.2vw] py-[0.7vh] font-body text-[2.2vw] font-semibold text-bg/70">Illustrative</span>
          </div>
          <h2 className="mt-[1.6vh] max-w-[68vw] font-display text-[5vw] font-extrabold leading-[1.02] tracking-tight text-bg text-balance">
            Raising $3M to bring HeyGrand to more homes.
          </h2>

          <div className="mt-[4vh] grid grid-cols-4 gap-[1.6vw]">
            <div className="rounded-[1vw] bg-bg/8 p-[1.8vw] ring-1 ring-bg/12">
              <p className="font-display text-[2.2vw] font-bold text-primary">Go-to-market</p>
              <p className="mt-[0.8vh] font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">Sales into senior-living operators.</p>
            </div>
            <div className="rounded-[1vw] bg-bg/8 p-[1.8vw] ring-1 ring-bg/12">
              <p className="font-display text-[2.2vw] font-bold text-primary">Hardware &amp; supply</p>
              <p className="mt-[0.8vh] font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">Scale the purpose-built sensor line.</p>
            </div>
            <div className="rounded-[1vw] bg-bg/8 p-[1.8vw] ring-1 ring-bg/12">
              <p className="font-display text-[2.2vw] font-bold text-primary">AI &amp; platform</p>
              <p className="mt-[0.8vh] font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">Deepen detection and reliability.</p>
            </div>
            <div className="rounded-[1vw] bg-bg/8 p-[1.8vw] ring-1 ring-bg/12">
              <p className="font-display text-[2.2vw] font-bold text-primary">Clinical partners</p>
              <p className="mt-[0.8vh] font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">Validation and reimbursement paths.</p>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <p className="font-hand text-[2.6vw] text-primary">A caring company, always on watch.</p>
          <p className="font-body text-[2.3vw] font-medium text-bg/60">hello@heygrand.com</p>
        </div>
      </div>
    </div>
  );
}
