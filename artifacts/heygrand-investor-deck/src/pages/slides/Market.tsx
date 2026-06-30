export default function Market() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="relative h-full grid grid-cols-[52%_48%]">
        <div className="flex flex-col justify-center px-[8vw] py-[8vh]">
          <div className="flex items-center gap-[1vw]">
            <span className="h-[0.4vh] w-[3vw] rounded-full bg-primary" />
            <p className="font-hand text-[2.4vw] text-primary leading-none">Market opportunity</p>
          </div>
          <h2 className="mt-[2vh] font-display text-[5vw] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
            A dual crisis, a fast-growing market.
          </h2>
          <p className="mt-[3vh] max-w-[40vw] font-body text-[2.3vw] leading-snug text-muted text-pretty">
            Half of US adults report loneliness and more than 1 in 4 seniors
            fall each year — as the 65+ population grows faster than ever.
          </p>
          <p className="mt-[4vh] max-w-[40vw] font-body text-[2.2vw] italic text-muted">
            TAM and SAM from 2026 North American market research. SOM is our
            3-year target.
          </p>
        </div>

        <div className="relative flex flex-col items-center justify-center gap-[2.2vh] bg-accent px-[5vw]">
          <div className="flex w-full flex-col items-center justify-center rounded-[1.2vw] bg-primary-deep py-[3.2vh] text-bg">
            <span className="font-body text-[2.2vw] font-semibold tracking-wide text-bg/70">TAM</span>
            <span className="font-display text-[4vw] font-extrabold leading-none">$10.7B</span>
            <span className="font-body text-[2.2vw] text-bg/70">AI companions + monitoring, N.A.</span>
          </div>
          <div className="flex w-[82%] flex-col items-center justify-center rounded-[1.2vw] bg-primary py-[2.8vh] text-bg">
            <span className="font-body text-[2.2vw] font-semibold tracking-wide text-bg/80">SAM</span>
            <span className="font-display text-[3.4vw] font-extrabold leading-none">$1.55B</span>
            <span className="font-body text-[2.2vw] text-bg/80">N.A. healthcare AI companions</span>
          </div>
          <div className="flex w-[64%] flex-col items-center justify-center rounded-[1.2vw] bg-bg py-[2.4vh] text-ink ring-1 ring-primary/30">
            <span className="font-body text-[2.2vw] font-semibold tracking-wide text-primary">SOM</span>
            <span className="font-display text-[3vw] font-extrabold leading-none text-primary">$150M</span>
            <span className="font-body text-[2.2vw] text-muted">Our 3-year reachable target</span>
          </div>
        </div>
      </div>
    </div>
  );
}
