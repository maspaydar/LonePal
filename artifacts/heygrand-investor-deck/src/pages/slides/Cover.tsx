import { BrandMark, PresenceRings } from "@/components/Brand";

export default function Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ink text-bg">
      <div className="absolute -right-[18vw] top-1/2 -translate-y-1/2 w-[60vw] text-primary">
        <PresenceRings className="w-full" />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60vw 60vw at 78% 50%, hsl(174 62% 38% / 0.18), transparent 70%)",
        }}
      />

      <div className="relative h-full flex flex-col justify-between px-[8vw] py-[7vh]">
        <BrandMark variant="dark" />

        <div className="max-w-[64vw]">
          <p className="font-hand text-[2.8vw] text-primary leading-none">
            Quiet vigilance for senior living
          </p>
          <h1 className="mt-[2.5vh] font-display text-[7vw] font-extrabold leading-[0.98] tracking-tight text-bg text-balance">
            A caring voice that never looks away.
          </h1>
          <p className="mt-[3vh] max-w-[46vw] font-body text-[2.5vw] font-light leading-snug text-bg/70 text-pretty">
            An always-on AI companion for seniors — and the moment something
            seems wrong, it tells staff first.
          </p>
        </div>

        <div className="flex items-center gap-[1.5vw] font-body text-[2.2vw] font-medium text-bg/60">
          <span>Investor Pitch</span>
          <span className="h-[2.4vh] w-px bg-bg/25" />
          <span>Seed Round · 2026</span>
        </div>
      </div>
    </div>
  );
}
