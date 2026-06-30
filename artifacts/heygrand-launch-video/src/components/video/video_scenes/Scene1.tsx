import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import seniorAloneImg from '@/assets/images/senior-alone.png';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      {/* Background Image */}
      <motion.div 
        className="absolute inset-0 z-0"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: phase >= 1 ? 0.4 : 0 }}
        transition={{ duration: 4, ease: "easeOut" }}
      >
        <img src={seniorAloneImg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg-dark/80 to-bg-dark/40" />
      </motion.div>

      <div className="relative z-10 max-w-4xl mx-auto text-center text-text-inverse px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-6 font-accent text-3xl text-accent"
        >
          When an emergency happens...
        </motion.div>
        
        <motion.h1 
          className="text-6xl md:text-7xl font-bold font-display tracking-tight leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 30 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          Hours can pass in silence.
        </motion.h1>

        <motion.p
          className="mt-8 text-2xl text-text-inverse/70 max-w-2xl mx-auto font-body"
          initial={{ opacity: 0, filter: "blur(10px)" }}
          animate={{ opacity: phase >= 3 ? 1 : 0, filter: phase >= 3 ? "blur(0px)" : "blur(10px)" }}
          transition={{ duration: 0.8 }}
        >
          Pendants are reactive. Staff are stretched thin. Families are in the dark.
        </motion.p>
      </div>
    </motion.div>
  );
}