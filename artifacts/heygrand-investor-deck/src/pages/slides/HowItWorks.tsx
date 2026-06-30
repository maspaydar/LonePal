import { Shield } from "@/components/Brand";

export default function HowItWorks() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="relative h-full flex flex-col px-[8vw] py-[6vh]">
        <div className="flex items-center gap-[1vw]">
          <span className="h-[0.4vh] w-[3vw] rounded-full bg-primary" />
          <p className="font-hand text-[2.4vw] text-primary leading-none">How it works</p>
        </div>
        <h2 className="mt-[1.6vh] max-w-[64vw] font-display text-[4.6vw] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
          Two agents. One for company, one for safety.
        </h2>

        <div className="mt-[4.5vh] grid grid-cols-[1fr_0.45fr_1fr] items-center gap-[2vw]">
          <div className="rounded-[1.4vw] bg-accent p-[2.2vw] ring-1 ring-primary/20">
            <p className="font-hand text-[2.2vw] text-primary">Companion agent</p>
            <p className="mt-[1vh] font-display text-[2.8vw] font-bold text-ink leading-tight">
              Talks like family
            </p>
            <p className="mt-[1.4vh] font-body text-[2.3vw] leading-snug text-text/70 text-pretty">
              Warm daily check-ins that ease loneliness — like a grandchild who always calls.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-[1.2vh]">
            <span className="font-body text-[2.3vw] text-muted">shares context</span>
            <div className="text-primary text-[3vw] leading-none">&#8594;</div>
            <span className="font-body text-[2.3vw] text-muted text-center leading-tight">
              never on camera
            </span>
          </div>

          <div className="rounded-[1.4vw] bg-ink p-[2.2vw]">
            <p className="font-hand text-[2.2vw] text-alert">Monitor agent</p>
            <p className="mt-[1vh] font-display text-[2.8vw] font-bold text-bg leading-tight">
              Senses danger, not them
            </p>
            <p className="mt-[1.4vh] font-body text-[2.3vw] leading-snug text-bg/70 text-pretty">
              Reads motion sensors for falls and emergencies. No cameras in the room.
            </p>
          </div>
        </div>

        <div className="mt-[4.5vh] flex items-center justify-center gap-[1.2vw] rounded-[1.2vw] bg-alert/10 py-[2.4vh] px-[2vw] ring-1 ring-alert/30">
          <Shield className="w-[2.4vw] shrink-0 text-alert" />
          <p className="font-display text-[2.6vw] font-bold text-alert leading-tight">
            The instant something looks wrong, staff and family get a red alert.
          </p>
        </div>
      </div>
    </div>
  );
}
