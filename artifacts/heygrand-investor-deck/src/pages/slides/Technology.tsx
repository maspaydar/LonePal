export default function Technology() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="relative h-full flex flex-col px-[8vw] py-[5vh]">
        <div className="flex items-center gap-[1vw]">
          <span className="h-[0.4vh] w-[3vw] rounded-full bg-primary" />
          <p className="font-hand text-[2.4vw] text-primary leading-none">Technology &amp; privacy</p>
        </div>
        <h2 className="mt-[1.4vh] max-w-[64vw] font-display text-[4.2vw] font-extrabold leading-[1.02] tracking-tight text-ink text-balance">
          Always sensing. Never watching.
        </h2>

        <div className="mt-[3.5vh] grid grid-cols-2 gap-[2.5vw]">
          <div className="rounded-[1.2vw] bg-accent p-[1.9vw] ring-1 ring-primary/20">
            <p className="font-hand text-[2.2vw] text-primary">Option A · Retrofit</p>
            <p className="mt-[0.8vh] font-display text-[2.5vw] font-bold text-ink leading-tight">
              ADT sensors via Google Home
            </p>
            <p className="mt-[1vh] font-body text-[2.2vw] leading-snug text-text/70 text-pretty">
              Use the motion sensors a facility already owns.
            </p>
          </div>
          <div className="rounded-[1.2vw] bg-ink p-[1.9vw]">
            <p className="font-hand text-[2.2vw] text-primary">Option B · Purpose-built</p>
            <p className="mt-[0.8vh] font-display text-[2.5vw] font-bold text-bg leading-tight">
              ESP32 + mmWave presence
            </p>
            <p className="mt-[1vh] font-body text-[2.2vw] leading-snug text-bg/70 text-pretty">
              Radar units sense movement and falls — never images.
            </p>
          </div>
        </div>

        <div className="mt-[3vh] grid grid-cols-3 gap-[2vw]">
          <div className="rounded-[1vw] p-[1.6vw] ring-1 ring-line bg-bg">
            <p className="font-display text-[2.3vw] font-bold text-ink leading-tight">Privacy by design</p>
            <p className="mt-[0.8vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              Motion and presence only. No cameras in the room.
            </p>
          </div>
          <div className="rounded-[1vw] p-[1.6vw] ring-1 ring-line bg-bg">
            <p className="font-display text-[2.3vw] font-bold text-ink leading-tight">Video on their terms</p>
            <p className="mt-[0.8vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              Calls only when a senior dials a saved contact.
            </p>
          </div>
          <div className="rounded-[1vw] p-[1.6vw] ring-1 ring-line bg-bg">
            <p className="font-display text-[2.3vw] font-bold text-ink leading-tight">Secure by default</p>
            <p className="mt-[0.8vh] font-body text-[2.2vw] leading-snug text-muted text-pretty">
              HMAC-signed devices, per-facility isolation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
