async function setupSadInnerStruggle() {
  await Tone.start();

  // Brown Noise 背景 (Sadness)
  const noise = new Tone.Noise("brown").start();
  const noiseFilter = new Tone.Filter(300, "lowpass");
  const noiseReverb = new Tone.Reverb({ decay: 12, wet: 0.9 });
  noise.chain(noiseFilter, noiseReverb, Tone.Destination);
  noise.volume.value = -20;

  Tone.Transport.scheduleRepeat((time) => {
    noiseFilter.frequency.linearRampTo(200 + Math.random() * 500, 10, time);
  }, 12);

  // 柔和忧伤Pad (C minor)
  // 丰富的Pad (悲伤弦乐质感, AMSynth)
  const padSynth = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 2.5, //较低数值 (~1) 更温暖、稳定；较高 (>2) 会更丰富、更复杂。
    oscillator: { type: "square" }, // square is better than triagle
    envelope: { attack: 4, decay: 4, sustain: 0.5, release: 6 }, // Attack (4秒)：音量从0慢慢上升到峰值，缓慢渐入。
    modulation: { type: "sine" },
    modulationEnvelope: { attack: 1, decay: 2, sustain: 0.5, release: 2 }
  });


  const padReverb = new Tone.Reverb({ decay: 12, wet:0.9 }).toDestination();
  padSynth.connect(padReverb);
  const padGain = new Tone.Gain(0.1).toDestination();  //控制整体音量输出较小（0.1），避免Pad压过其他声音，营造柔和、背景式的声音氛围。
  padSynth.connect(padGain);
  

function playPad(time) {
  padGain.gain.cancelScheduledValues(time);
  padGain.gain.linearRampTo(0.8, 3, time);
  padGain.gain.linearRampTo(0.1, 5, time + 3);

  const chords = [
    ["C3", "Eb3", "G3"],
    ["F3", "Ab3", "C4"],
    ["G3", "Bb3", "D4"],
    ["D3", "F3", "A3"],
  ];

  const durations = ["1n", "2n", "4n", "8n"];
  const chosenChord = chords[Math.floor(Math.random() * chords.length)];
  const chosenDuration = durations[Math.floor(Math.random() * durations.length)];
  const offBeatShift = Math.random() < 0.5 ? "0" : "+8n";

  padSynth.triggerAttackRelease(chosenChord, chosenDuration, time + offBeatShift, 0.5);
}

Tone.Transport.scheduleRepeat(playPad, "2m"); // 每两小节触发一次，节奏更舒展



  function playPad(time) {
    padGain.gain.cancelScheduledValues(time);
    padGain.gain.linearRampTo(0.8, 3, time);
    padGain.gain.linearRampTo(0.1, 5, time + 3);
  
    // 随机选择悲伤和弦 (Minor Chords)
    const chords = [
      ["C3", "Eb3", "G3"],    // C minor
      ["F3", "Ab3", "C4"],    // F minor
      ["G3", "Bb3", "D4"],    // G minor
      ["D3", "F3", "A3"],     // D minor
    ];
  
    const chosenChord = chords[Math.floor(Math.random() * chords.length)];
  
    // 随机时值（偶尔改变节奏）
    const durations = ["1n", "2n", "4n", "8n"];
    const chosenDuration = durations[Math.floor(Math.random() * durations.length)];
  
    // 偶尔在弱拍触发 (off-beat timing)
    const offBeatShift = Math.random() < 0.5 ? "0" : "+8n";
  
    // 更丰富的触发方式
    padSynth.triggerAttackRelease(chosenChord, chosenDuration, time + offBeatShift, 0.5);
  }
  

  // 铜铃声 (FM Synth)
  const bell = new Tone.FMSynth({
    harmonicity: 2,
    modulationIndex: 8,
    envelope: { attack: 0.5, decay: 4, sustain: 0, release: 8 },
    modulation: { type: "sine" }
  });
  const bellReverb = new Tone.Reverb({ decay: 10, wet: 0.9 }).toDestination();
  bell.connect(bellReverb);
  bell.volume.value = -8;

  function randomBell(time) {
    const notes = ["F3", "G3", "Bb3", "C4"];
    const randomNote = notes[Math.floor(Math.random() * notes.length)];
    const randomVelocity = 0.3 + Math.random() * 0.5;
    bell.triggerAttackRelease(randomNote, "4n", time, randomVelocity);
    const nextInterval = Math.random() * 8 + 5;
    Tone.Transport.scheduleOnce(randomBell, time + nextInterval);
  }
  Tone.Transport.scheduleOnce(randomBell, Tone.Transport.seconds + 1);

  // GrainPlayer颗粒音效（官方音频示例）
  const grainPlayer = new Tone.GrainPlayer({
    // url: "https://tonejs.github.io/audio/berklee/gong_1.mp3", // 修正后的官方链接
    // url: "https://tonejs.github.io/audio/drum-samples/breakbeat.mp3", // 修正后的官方链接
    // url:"https://tonejs.github.io/audio/berklee/femalevoices_aa2_A5.mp3", // vocal
    url: "https://tonejs.github.io/audio/salamander/C4.mp3", // piano
    grainSize: 0.2,
    overlap: 0.1,
    playbackRate: 0.5,
    loop: true,
    onload: () => {
      grainPlayer.start();
      console.log("GrainPlayer loaded and started.");
    }
  });

  const grainReverb = new Tone.Reverb({ decay: 12, wet: 0.8 }).toDestination();
  grainPlayer.connect(grainReverb);
  grainPlayer.volume.value = -20;

  // 等待全部音频加载完毕后再启动Transport
  await Tone.loaded();
  Tone.Transport.start();
  console.log("Sad & Inner Struggle soundscape started...");
}

document.addEventListener('click', setupSadInnerStruggle, { once: true });