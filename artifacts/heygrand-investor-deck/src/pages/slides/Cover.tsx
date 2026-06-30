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
            Companionship and safety for seniors
          </p>
          <h1 className="mt-[2.5vh] font-display text-[7vw] font-extrabold leading-[0.98] tracking-tight text-bg text-balance">
            Family that never leaves their side.
          </h1>
          <p className="mt-[3vh] max-w-[48vw] font-body text-[2.5vw] font-light leading-snug text-bg/70 text-pretty">
            An AI companion that talks with them like a grandchild — and quietly
            senses falls and emergencies, with no cameras.
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
