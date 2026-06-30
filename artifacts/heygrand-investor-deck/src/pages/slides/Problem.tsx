import { Shield } from "@/components/Brand";

export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(50vw 50vw at 12% 0%, hsl(0 72% 51% / 0.06), transparent 70%)",
        }}
      />

      <div className="relative h-full flex flex-col px-[8vw] py-[8vh]">
        <div className="flex items-center gap-[1vw]">
          <span className="h-[0.4vh] w-[3vw] rounded-full bg-alert" />
          <p className="font-hand text-[2.4vw] text-alert leading-none">The problem</p>
        </div>
        <h2 className="mt-[2vh] max-w-[62vw] font-display text-[5vw] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
          Living alone carries two deadly risks.
        </h2>

        <div className="mt-auto grid grid-cols-3 gap-[2.5vw]">
          <div className="rounded-[1.2vw] bg-bg shadow-[0_2vh_5vh_-3vh_rgba(15,23,42,0.25)] ring-1 ring-line p-[2.4vw]">
            <p className="font-display text-[2.6vw] font-bold text-alert">Loneliness</p>
            <p className="mt-[1.6vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              Severe loneliness more than doubles the risk of early death and
              raises dementia risk by 50%.
            </p>
          </div>
          <div className="rounded-[1.2vw] bg-bg shadow-[0_2vh_5vh_-3vh_rgba(15,23,42,0.25)] ring-1 ring-line p-[2.4vw]">
            <p className="font-display text-[2.6vw] font-bold text-alert">Falls</p>
            <p className="mt-[1.6vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              Over 1 in 4 seniors fall each year. Half who lie on the floor past
              an hour die within six months.
            </p>
          </div>
          <div className="rounded-[1.2vw] bg-bg shadow-[0_2vh_5vh_-3vh_rgba(15,23,42,0.25)] ring-1 ring-line p-[2.4vw]">
            <p className="font-display text-[2.6vw] font-bold text-ink">Old tools fail</p>
            <p className="mt-[1.6vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              Pendants need a press. Cameras feel like surveillance. Families
              hear only after it is too late.
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[8vw] flex items-center gap-[0.8vw] text-muted">
        <Shield className="w-[1.6vw] text-primary" />
        <span className="font-body text-[2.2vw] font-semibold">02</span>
      </div>
    </div>
  );
}
