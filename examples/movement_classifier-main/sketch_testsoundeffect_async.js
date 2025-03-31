// 音乐资源
const sounds = [
    {
      player: new Tone.Player({
        url: "music/async/ambient_experimental.wav",
        loop: true,
        volume: -8
      }).toDestination(),
      interval: [8000, 12000], // 背景音长循环，无需随机播放
      pitchRange: [-0.5, 0.5],
      rateRange: [0.9, 1.1]
    },
    {
      player: new Tone.Player("music/async/metal-bowl-hit.wav").toDestination(),
      interval: [3000, 10000], // 随机播放间隔0.5~1.5秒
      pitchRange: [-4, 4],
      rateRange: [0.8, 1.5]
    },
    {
      player: new Tone.Player("music/async/piano-hit-2.wav").toDestination(),
      interval: [2000, 4500], // 随机播放间隔1~2.5秒
      pitchRange: [-3, 3],
      rateRange: [0.7, 1.3]
    }

    // {
    //     player: new Tone.Player("music/async/piano_sad01.wav").toDestination(),
    //     interval: [1000, 8000], // 随机播放间隔1~2.5秒
    //     pitchRange: [-3, 8],
    //     rateRange: [0.8, 1.2]
    // }
    
  ];
  
  // 效果器
  const reverb = new Tone.Reverb({ decay: 5, wet: 0.5 }).toDestination();
  const delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.6, wet: 0.4 }).toDestination();
  
  // 声音连接效果器
  sounds.forEach(s => {
    s.player.connect(reverb).connect(delay);
  });
  
  // 播放控制状态
  let isPlaying = false;
  let soundTimeouts = [];
  
  // 单个声音随机播放函数（各自有自己间隔和逻辑）
  function playSoundIndependently(sound) {
    function triggerSound() {
      if (!isPlaying) return;
  
      // 每次随机音高偏移
      const pitch = sound.pitchRange[0] + Math.random() * (sound.pitchRange[1] - sound.pitchRange[0]);
      const pitchShift = new Tone.PitchShift(pitch).toDestination();
  
      sound.player.disconnect();
      sound.player.connect(pitchShift).connect(reverb).connect(delay);
  
      // 每次随机播放速度
      sound.player.playbackRate = sound.rateRange[0] + Math.random() * (sound.rateRange[1] - sound.rateRange[0]);
  
      sound.player.start();
  
      // 下次随机播放时间（明确各自规则）
      const nextTime = sound.interval[0] + Math.random() * (sound.interval[1] - sound.interval[0]);
      const timeoutId = setTimeout(triggerSound, nextTime);
      soundTimeouts.push(timeoutId);
      console.log("sad01" + nextTime);

    }
  
    triggerSound();
  }
  
  // 开始播放函数
  async function startPlaying() {
    if (isPlaying) return;
    isPlaying = true;
  
    await Tone.start();
    await Tone.loaded();
  
    sounds.forEach((sound, index) => {
      if (index === 0) {
        sound.player.start(); // 第一个声音作为背景，循环播放一次即可
      } else {
        playSoundIndependently(sound); // 其他声音各自独立随机播放
      }
    });
  }
  
  // 停止播放函数
  function stopPlaying() {
    if (!isPlaying) return;
    isPlaying = false;
  
    sounds.forEach(s => s.player.stop());
  
    soundTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    soundTimeouts = [];
  }
  
  // 键盘事件监听（2开始、1停止）
  document.addEventListener('keydown', (event) => {
    if (event.key === '2') {
      startPlaying();
    } else if (event.key === '1') {
      stopPlaying();
    }
  });
  