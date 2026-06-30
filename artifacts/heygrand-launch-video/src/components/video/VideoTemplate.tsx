import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { PresenceRings } from './Brand';

export const SCENE_DURATIONS = {
  problem: 5000,
  solution: 6000,
  howItWorks: 6000,
  staffAlerts: 4500,
  close: 5000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  problem: Scene1,
  solution: Scene2,
  howItWorks: Scene3,
  staffAlerts: Scene4,
  close: Scene5,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div className="relative w-full h-screen overflow-hidden text-text-primary" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
      {/* Persistent background layers */}
      <div className="absolute inset-0 z-0">
        <motion.div
          className="absolute inset-0"
          animate={{
            background: [
              'linear-gradient(to bottom right, var(--color-bg-muted), var(--color-bg-light))',
              'linear-gradient(to bottom right, var(--color-bg-light), var(--color-accent))',
              'linear-gradient(to bottom right, var(--color-bg-muted), var(--color-bg-light))',
              'linear-gradient(to top left, var(--color-bg-light), var(--color-bg-muted))',
              'linear-gradient(to bottom right, var(--color-bg-muted), var(--color-bg-light))',
            ][sceneIndex % 5]
          }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
      </div>

      {/* Persistent motifs - Presence Rings */}
      <motion.div
        className="absolute w-[80vw] h-[80vw] opacity-10 -translate-x-1/2 -translate-y-1/2 z-0"
        style={{ color: 'var(--color-primary)' }}
        animate={{
          left: ['50%', '80%', '20%', '50%', '50%'][sceneIndex],
          top: ['50%', '20%', '80%', '50%', '50%'][sceneIndex],
          scale: [1, 0.8, 1.2, 0.6, 1.5][sceneIndex],
          opacity: [0.2, 0.15, 0.25, 0.1, 0.3][sceneIndex]
        }}
        transition={{ duration: 2, ease: "easeInOut" }}
      >
        <PresenceRings className="w-full h-full animate-[spin_30s_linear_infinite]" />
      </motion.div>

      {/* Foreground Content */}
      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
