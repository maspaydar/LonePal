import { Shield } from "@/components/Brand";

const base = import.meta.env.BASE_URL;

export default function Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="relative h-full grid grid-cols-[42%_58%]">
        <div className="relative h-full overflow-hidden">
          <img
            src={`${base}hero-home.png`}
            crossOrigin="anonymous"
            alt="An older adult's hands holding a warm mug of tea by a sunlit window"
            className="h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, transparent 60%, hsl(210 20% 98%) 100%)",
            }}
          />
        </div>

        <div className="flex flex-col justify-center px-[6vw] py-[6vh]">
          <div className="flex items-center gap-[1vw]">
            <span className="h-[0.4vh] w-[3vw] rounded-full bg-primary" />
            <p className="font-hand text-[2.4vw] text-primary leading-none">The solution</p>
          </div>
          <h2 className="mt-[1.6vh] font-display text-[4.4vw] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
            Always-on care that never has to be asked.
          </h2>

          <div className="mt-[3.5vh] flex flex-col gap-[2.6vh]">
            <div className="flex items-start gap-[1.6vw]">
              <div className="mt-[0.4vh] flex aspect-square w-[3vw] items-center justify-center rounded-[0.7vw] bg-accent">
                <Shield className="w-[1.7vw] text-primary" />
              </div>
              <div>
                <p className="font-display text-[2.7vw] font-bold text-ink">Passive monitoring</p>
                <p className="font-body text-[2.2vw] leading-snug text-muted text-pretty">
                  Presence sensing watches for inactivity. No wearable, no button to press.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-[1.6vw]">
              <div className="mt-[0.4vh] flex aspect-square w-[3vw] items-center justify-center rounded-[0.7vw] bg-accent">
                <Shield className="w-[1.7vw] text-primary" />
              </div>
              <div>
                <p className="font-display text-[2.7vw] font-bold text-ink">AI companion</p>
                <p className="font-body text-[2.2vw] leading-snug text-muted text-pretty">
                  Warm daily conversations that residents actually look forward to.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-[1.6vw]">
              <div className="mt-[0.4vh] flex aspect-square w-[3vw] items-center justify-center rounded-[0.7vw] bg-accent">
                <Shield className="w-[1.7vw] text-primary" />
              </div>
              <div>
                <p className="font-display text-[2.7vw] font-bold text-ink">Real-time alerts</p>
                <p className="font-body text-[2.2vw] leading-snug text-muted text-pretty">
                  When risk is detected, staff are notified instantly — not hours later.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
