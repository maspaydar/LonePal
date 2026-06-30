export default function Product() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="relative h-full flex flex-col px-[8vw] py-[5vh]">
        <div className="flex items-center gap-[1vw]">
          <span className="h-[0.4vh] w-[3vw] rounded-full bg-primary" />
          <p className="font-hand text-[2.4vw] text-primary leading-none">The product</p>
        </div>
        <h2 className="mt-[1.4vh] max-w-[64vw] font-display text-[4.4vw] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
          One platform, built for every role.
        </h2>

        <div className="mt-[4vh] grid grid-cols-4 gap-[2vw]">
          <div className="flex flex-col rounded-[1.2vw] bg-bg p-[1.8vw] shadow-[0_2vh_5vh_-3vh_rgba(15,23,42,0.25)] ring-1 ring-line">
            <span className="font-display text-[3vw] font-extrabold text-primary">01</span>
            <p className="mt-[1.2vh] font-display text-[2.4vw] font-bold text-ink leading-tight">Staff Nexus</p>
            <p className="mt-[1vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              Dashboards for residents, units, and live alerts.
            </p>
          </div>
          <div className="flex flex-col rounded-[1.2vw] bg-bg p-[1.8vw] shadow-[0_2vh_5vh_-3vh_rgba(15,23,42,0.25)] ring-1 ring-line">
            <span className="font-display text-[3vw] font-extrabold text-primary">02</span>
            <p className="mt-[1.2vh] font-display text-[2.4vw] font-bold text-ink leading-tight">Super-Admin hub</p>
            <p className="mt-[1vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              Multi-facility fleet ops with mandatory 2FA.
            </p>
          </div>
          <div className="flex flex-col rounded-[1.2vw] bg-bg p-[1.8vw] shadow-[0_2vh_5vh_-3vh_rgba(15,23,42,0.25)] ring-1 ring-line">
            <span className="font-display text-[3vw] font-extrabold text-primary">03</span>
            <p className="mt-[1.2vh] font-display text-[2.4vw] font-bold text-ink leading-tight">Resident companion</p>
            <p className="mt-[1vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              A voice-first companion that talks like family.
            </p>
          </div>
          <div className="flex flex-col rounded-[1.2vw] bg-primary p-[1.8vw] shadow-[0_2vh_5vh_-3vh_rgba(15,23,42,0.25)]">
            <span className="font-display text-[3vw] font-extrabold text-bg/80">04</span>
            <p className="mt-[1.2vh] font-display text-[2.4vw] font-bold text-bg leading-tight">Resident web</p>
            <p className="mt-[1vh] font-body text-[2.2vw] leading-snug text-bg/80 text-pretty">
              Senior-started video calls to saved family or doctor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
