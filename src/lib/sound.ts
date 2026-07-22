export function beep(times = 1) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    let time = ctx.currentTime;

    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      
      gain.gain.setValueAtTime(0.08, time);
      gain.gain.setValueAtTime(0, time + 0.08); // beep for 80ms
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + 0.08);
      
      time += 0.2; // 200ms interval
    }
    
    setTimeout(() => {
      ctx.close();
    }, times * 250);
  } catch {
    /* ignore */
  }
}

export function vibrate() {
  try {
    navigator.vibrate?.(50);
  } catch {
    /* ignore */
  }
}
