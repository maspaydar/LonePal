import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import nurseImg from '@/assets/images/nurse.png';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center bg-bg-light"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-[45%] h-full relative overflow-hidden">
        <motion.div
          className="absolute inset-0"
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 4, ease: "easeOut" }}
        >
          <img src={nurseImg} alt="Nurse" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-primary/20 mix-blend-multiply" />
        </motion.div>
      </div>

      <div className="w-[55%] h-full relative z-10 flex flex-col justify-center px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-6 font-accent text-3xl text-error"
        >
          When seconds matter...
        </motion.div>
        
        <motion.h2 
          className="text-5xl md:text-6xl font-bold font-display tracking-tight leading-tight text-text-primary mb-12"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, x: phase >= 2 ? 0 : -30 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Staff are notified <span className="text-primary">instantly.</span>
          <br/>
          <span className="text-text-secondary text-4xl">Not hours later.</span>
        </motion.h2>

        {/* Floating UI Elements */}
        <div className="space-y-4">
          <motion.div 
            className="bg-bg-light shadow-xl border border-border rounded-2xl p-6 flex items-start gap-4 max-w-lg"
            initial={{ opacity: 0, y: 20, rotateX: 20 }}
            animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20, rotateX: phase >= 3 ? 0 : 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <path d="M12 9v4"/>
                <path d="M12 17h.01"/>
              </svg>
            </div>
            <div>
              <h4 className="font-display font-bold text-xl text-text-primary">Potential Fall Detected</h4>
              <p className="text-text-secondary font-body mt-1">Room 204 • Martha Stewart • 10 sec ago</p>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}