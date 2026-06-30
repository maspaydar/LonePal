import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BrandMark } from '../Brand';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-bg-muted"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
    >
      <div className="relative z-10 flex flex-col items-center text-center mt-[-5vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
          animate={{ 
            opacity: phase >= 1 ? 1 : 0, 
            scale: phase >= 1 ? 1 : 0.8,
            filter: phase >= 1 ? "blur(0px)" : "blur(10px)"
          }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 scale-[1.5]"
        >
          <BrandMark variant="light" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 20 }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
        >
          <h2 className="text-4xl font-display font-medium text-text-secondary tracking-wide">
            A caring voice that never looks away.
          </h2>
        </motion.div>
      </div>
      
      {/* Decorative Final Pulse */}
      {phase >= 1 && (
        <motion.div
          className="absolute top-1/2 left-1/2 w-[40vw] h-[40vw] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 2, opacity: [0, 0.5, 0] }}
          transition={{ duration: 4, ease: "easeOut", repeat: Infinity, repeatDelay: 1 }}
        />
      )}
    </motion.div>
  );
}