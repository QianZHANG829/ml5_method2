async function setupSoundscape() {
    await Tone.start();
  
    // 背景风声 (Noise + Filter + Reverb)
    const noise = new Tone.Noise("pink").start();
    const noiseFilter = new Tone.Filter(600, "lowpass");
    const noiseReverb = new Tone.Reverb({ decay: 8, wet: 0.8 });
    noise.chain(noiseFilter, noiseReverb, Tone.Destination);
    noise.volume.value = -22;
  
    // 缓慢滤波自动变化（呼吸感）
    Tone.Transport.scheduleRepeat((time) => {
      noiseFilter.frequency.linearRampTo(400 + Math.random() * 800, 8, time);
    }, 12);
  
    // pad音色（柔和起伏）
    const padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 4, decay: 4, sustain: 0.5, release: 6 }
    });
    const padReverb = new Tone.Reverb({ decay: 10, wet: 0.9 }).toDestination();
    padSynth.connect(padReverb);
  
    const padGain = new Tone.Gain(0.1).toDestination();
    padSynth.connect(padGain);
  
    function breathePad(time) {
      padGain.gain.cancelScheduledValues(time);
      padGain.gain.linearRampTo(0.8, 4, time);     // 吸气
      padGain.gain.linearRampTo(0.1, 4, time + 4); // 呼气
      padSynth.triggerAttackRelease(["C4", "G4", "D5"], "8n", time, 0.5);
    }
  
    Tone.Transport.scheduleRepeat(breathePad, 8);
  
    // 铜铃声 (FM Synth，更明显)
    const bell = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 12,
      envelope: { attack: 0.2, decay: 3, sustain:0.6, release: 6 },
      modulation: { type: "sine" }
    });
    const bellReverb = new Tone.Reverb({ decay: 8, wet: 0.9 }).toDestination();
    bell.connect(bellReverb);
  
    // 随机触发铜铃声（正确修复版本）
function randomBell(time) {
    const notes = ["A4", "C5", "E5", "G5"]; // 音符随机选择
    const randomNote = notes[Math.floor(Math.random() * notes.length)];
    const randomVelocity = 0.3 + Math.random() * 0.5; // 随机音量
  
    bell.triggerAttackRelease(randomNote, "2n", time, randomVelocity);
  
    // 再次安排下次随机铜铃（确保使用time参数）
    const nextInterval = Math.random() * 5 + 3; // 3~8秒随机
    Tone.Transport.scheduleOnce(randomBell, time + nextInterval);
  }
  
  // 初始安排铜铃声启动（确保首次触发使用Tone.Transport时间）
  Tone.Transport.scheduleOnce(randomBell, Tone.Transport.seconds + 1);
  
  
    Tone.Transport.start();
    console.log("环境音效与随机铜铃声启动...");
  }
  
  document.addEventListener('click', setupSoundscape, { once: true });