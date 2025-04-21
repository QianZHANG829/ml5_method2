// =====================
// 🎼 Emotion Music System - Modular Structure
// =====================



// === GLOBAL STATE ===
let video, bodyPose, poses = [], poseHistory = [];
let isPlaying = false;

// === THRESHOLDS (全局阈值一览) ===
const ACCELERATION_THRESHOLD = 80;  // 左手触发钢琴
const FALLING_THRESHOLD      = 60;  // 下坠判定
const EXTENSION_THRESHOLD    = 100; // 腿/脚延伸
const COOLDOWN_TIME          = 1000; // 冷却 (ms)



let lastLeftWrist = null, lastCalculationTime = 0;
let lastShoulderDiff = null;
let shoulderDiffHistory = [];
let lastPianoTriggerTime = 0;
let lastRotationTriggerTime = 0;


// =====================
// 🎵 INIT AUDIO LAYER 1 - Ambient Cello & Brown Noise
// =====================
let celloSampler, ambientPlayer, noise;

function initLayer1() {
  const reverb = new Tone.Reverb({ decay: 6, wet: 0.5 }).toDestination();
  const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.5, wet: 0.3 }).toDestination();

  celloSampler = new Tone.Sampler({
    urls: {
      "A#4": "music/all-samples/violin/violin_As4_long_forte_molto-vibrato.mp3",   // ← 新增

      C3: "music/all-samples/cello/cello_C3_1_pianissimo_arco-normal.mp3",
      G2: "music/all-samples/cello/cello_G2_15_fortissimo_arco-normal.mp3",
      E3: "music/all-samples/cello/cello_E3_1_mezzo-piano_arco-minor-trill.mp3",
      "E3-1": "music/all-samples/cello/cello_E3_phrase_cresc-decresc_arco-normal.mp3",
      D3: "music/all-samples/cello/cello_D3_phrase_mezzo-forte_arco-legato.mp3",
      A3: "music/all-samples/cello/cello_A3_phrase_cresc-decresc_arco-normal.mp3"
    },
    volume: -18
  }).connect(reverb).connect(delay).toDestination();

  ambientPlayer = new Tone.Player({
    url: "music/async/ambient_experimental.wav",
    loop: true,
    autostart: true,
    volume: -28
  }).connect(reverb).connect(delay).toDestination();

  // ---------- 时间轴调度（不重叠） ----------
  const singleNotes  = ["C3", "G2", "D3", "E3"];
  const phraseEvents = [                       // ⏱️ 预设两段短句出现的拍位
    { timeBeats: 0,  note: "A3"   },
    { timeBeats: 8,  note: "E3-1" }
  ];

  const singleIntervals = [4, 6, 12, 18, 16, 24]; // 以“拍”为单位 (m = measures)

  // 递归调度下一个事件
  function scheduleTimeline(nextBeat = 0, phraseIdx = 0) {
    // 1) 还有没有剩余 phrase？
    if (phraseIdx < phraseEvents.length) {
      const nextPhrase = phraseEvents[phraseIdx];

      // a) 如果下一个 phrase 就在当前拍位 ⇒ 直接播 phrase
      if (nextBeat >= nextPhrase.timeBeats) {
        Tone.Transport.scheduleOnce(t => {
          celloSampler.triggerAttack(nextPhrase.note, t);
          console.log(`🎻 Phrase once: ${nextPhrase.note} at ${nextBeat}m`);
          scheduleTimeline(nextBeat, phraseIdx + 1);  // 继续调度
        }, `+${nextBeat}m`);
        return;
      }

      // b) 否则空档期间安排 singleNote，但长度不能跨到 phrase
      const maxGap    = nextPhrase.timeBeats - nextBeat;
      const interval  = singleIntervals
                          .filter(v => v <= maxGap)
                          .sort(() => Math.random() - .5)[0] || maxGap; // 取一个合适的间隔
      const note      = random(singleNotes);

      Tone.Transport.scheduleOnce(t => {
        celloSampler.triggerAttack(note, t);
        console.log(`🎻 Single: ${note} at ${nextBeat}m (gap ${interval}m)`);
        scheduleTimeline(nextBeat + interval, phraseIdx);       // 继续调度
      }, `+${nextBeat}m`);

    } else {
      // 2) phrase 都播完，只剩随机 singleNotes 循环
      const interval = random(singleIntervals);
      const note     = random(singleNotes);
      Tone.Transport.scheduleOnce(t => {
        celloSampler.triggerAttack(note, t);
        console.log(`🎻 Loop‑single: ${note} at ${nextBeat}m`);
        scheduleTimeline(nextBeat + interval, phraseIdx);
      }, `+${nextBeat}m`);
    }
  }

  // 启动时间轴
  scheduleTimeline(0);



  noise = new Tone.Noise("brown").start();
  const noiseFilter = new Tone.Filter(300, "lowpass");
  const noiseReverb = new Tone.Reverb({ decay: 12, wet: 0.9 });
  noise.chain(noiseFilter, noiseReverb, Tone.Destination);
  noise.volume.value = -38;

  Tone.Transport.scheduleRepeat((time) => {
    noiseFilter.frequency.linearRampTo(200 + Math.random() * 500, 10, time);
  }, 12);
}




// =====================
// 🎻 INIT AUDIO LAYER 2 - Violin + Falling Motion
// =====================
let violinSampler, violinPitchMod;

function initLayer2() {
  const reverb = new Tone.Reverb({ decay: 14, wet: 0.8 });
  const delay = new Tone.FeedbackDelay({ delayTime: "4n", feedback: 0.3, wet: 0.5 });

  violinPitchMod = new Tone.PitchShift(0).connect(delay).connect(reverb).toDestination();

  violinSampler = new Tone.Sampler({
    urls: {
      "G#7": "music/all-samples/violin/violin_Gs5_long_forte_molto-vibrato.mp3",
      "E4": "music/all-samples/violin/violin_E4_1_piano_arco-normal.mp3",
      "G3": "music/all-samples/violin/violin_G3_1_mezzo-forte_molto-vibrato.mp3",
      "A3": "music/all-samples/violin/violin_A3_1_pianissimo_arco-normal.mp3",
      "A4": "music/all-samples/violin/violin_A4_1_fortissimo_arco-normal.mp3",
      "A5": "music/all-samples/violin/violin_A4_05_pianissimo_arco-normal.mp3"
    },
    volume: -8
  }).connect(violinPitchMod);
}

const violinCombos = [
  ["G3"], ["A3"], ["E4"],
  ["G3","E4"], ["A3","E4"], ["A4","E4"],
  ["G#7","E4"], ["A4","G3"],
  ["G#7","E4","G3"], ["A4","E4","A3"],
  ["G#7","A4","E4","A3"]
];

function playFallingViolin(accel) {
  const idx = Math.floor(mapRange(accel, 0, 300, 0, violinCombos.length - 1));
  const combo = violinCombos[idx];
  violinPitchMod.pitch = mapRange(accel, 0, 300, -2, 1);
  violinSampler.triggerAttackRelease(combo, "1m", Tone.now(), 0.9);
  console.log(`🎻 Violin combo triggered: [${combo.join(', ')}] | Accel: ${accel.toFixed(1)} | Pitch: ${violinPitchMod.pitch.toFixed(2)}`);

}


// =====================
// 🎹 INIT AUDIO LAYER 2 - Trigger Piano by Hand
// =====================
let pianoPlayers = [], lastPianoIndex = -1;

function initLayer3() {
  const globalPitchShift = new Tone.PitchShift().toDestination();
  const pianoSounds = [
    "music/async/piano-hit-2.wav",
    "music/async/piano-lowhigh-hit.wav",
    "music/async/piano_string_hit_reverb.wav"
  ];

  const pianoSettings = {
    pitchRange: [-3, 3],
    rateRange: [0.8, 1.2]
  };

  pianoPlayers = pianoSounds.map(url => {
    const player = new Tone.Player(url).connect(globalPitchShift);
    player.volume.value = -30;
    return player;
  });

  // 🎹 INIT AUDIO LAYER 2 - Trigger Piano by Hand  ……
  window.playMetalSoundRandomly = function () {
    const now = millis();
    if (now - lastPianoTriggerTime < COOLDOWN_TIME) return;   // ↔️ 冷却判断

    let index;
    do {
      index = Math.floor(Math.random() * pianoPlayers.length);
    } while (index === lastPianoIndex);
    lastPianoIndex = index;

    const player = pianoPlayers[index];
    globalPitchShift.pitch = random(...pianoSettings.pitchRange);
    player.playbackRate   = random(...pianoSettings.rateRange);
    player.start();

    lastPianoTriggerTime = now;                               // ↔️ 记录时间
    console.log(`🎹 Piano hit #${index} | cooldown ok`);
  };
}


// =====================
// 🌀 Detect rotation motion (direction-agnostic)
// =====================
// 🌀 Detect rotation motion (方向无关，带冷却 & 随机混响)
const rotVerb = new Tone.Reverb({ decay: 8, wet: 0.5 }).toDestination();   // 先建一个可复用的 Reverb

function detectRotationFacingFront(pose) {
  // 1) 基本合法性检查
  if (!pose || !pose.keypoints || pose.keypoints.length < 13) return;

  const l = pose.keypoints[11];   // left_shoulder
  const r = pose.keypoints[12];   // right_shoulder
  if (!l || !r || l.x == null || r.x == null) return;

  // 2) 记录肩膀 X 差值
  const diff = r.x - l.x;
  shoulderDiffHistory.push(diff);
  if (shoulderDiffHistory.length > 10) shoulderDiffHistory.shift();  // 只保留最近 10 帧

  // 3) 满足三个条件才触发：
  //    a) 最近 4 帧出现正负翻转 (signFlip)
  //    b) 幅度变化 Δ 大于阈值 0.2
  //    c) 距离上次触发已超过冷却时间
  if (shoulderDiffHistory.length >= 4) {
    const recent = shoulderDiffHistory.slice(-4);
    const signFlip = Math.sign(recent[0]) !== Math.sign(recent[3]);
    const delta    = Math.abs(recent[3] - recent[0]);
    const now      = millis();

    if (signFlip && delta > 0.2 && now - lastRotationTriggerTime > COOLDOWN_TIME) {
      // 4) 设置随机混响并播放 A#4
      rotVerb.decay = random(6, 12);
      rotVerb.wet   = random(0.4, 0.8);

      violinSampler.connect(rotVerb);
      violinSampler.triggerAttackRelease("A#4", "2n");

      lastRotationTriggerTime = now;     // 记录冷却时间
      shoulderDiffHistory = [];          // 清空缓存，防止连续触发
      console.log(`🌀 Spin Δ=${delta.toFixed(2)} → Violin A#4 (cooldown ok)`);
    }
  }
}



// =====================
// 🎹 INIT AUDIO LAYER 3 - random
// =====================
// =====================
let cageFiles = [
  "music/async/tibetan-bowl_center-hit.wav",
  "music/async/zymbel.mp3"
];

// 空灵效果链：高通 ➜ 淡混响 ➜ 轻微立体声漂移
afterCageFX = new Tone.Gain(0).toDestination(); // 主音量由 fadeIn 控制
const cageHPF   = new Tone.Filter(120, "highpass");
const cageVerb  = new Tone.Reverb({ decay: 12, wet: 0.8 });
const cagePan   = new Tone.AutoPanner({ frequency: 0.03 }).start(); // 慢速漂移
cageHPF.connect(cageVerb).connect(cagePan).connect(afterCageFX);

function startCageLoop() {
  afterCageFX.gain.setValueAtTime(0, Tone.now());      // 先静音
  afterCageFX.gain.linearRampTo(0.6, 5);               // 5 秒淡入，若想更远可拉长
  playCageOnce();
  console.log("✅ Cage loop started (ethereal)");
}

function playCageOnce() {
  const url = random(cageFiles);
  const player = new Tone.Player({
    url,
    autostart: true,
    onload:   () => console.log(`🎲 Cage play ${url}`),
    onerror:  e  => console.error("Cage load err", e)
  });
  player.volume.value = -12;           // 轻一点
  player.connect(cageHPF);             // 过高通 ➜ 混响 ➜ 漂移 ➜ Gain ➜ Out

  setTimeout(playCageOnce, random(20000, 30000)); // 再触发，更稀疏
}



// =====================
// 🧠 POSE + MOTION LOGIC
// =====================
function gotPoses(results) {
  poses = results;
  if (!isPlaying || !results.length) return;

  const now = millis();
  const pose = results[0];
  poseHistory.push({ pose, t: now });
  poseHistory = poseHistory.filter(p => now - p.t <= 1000);

  detectRotationFacingFront(pose); // ← 需要手动调用


  if (now - lastCalculationTime >= 500) {
    const prev = poseHistory.find(p => now - p.t >= 950);
    if (prev) detectFalling(pose, prev.pose);
    lastCalculationTime = now;
  }

  const wrist = pose.keypoints.find(k => k.name === 'left_wrist');
  if (wrist && lastLeftWrist) {
    const accel = calculateAcceleration(wrist, lastLeftWrist);
    if (accel > ACCELERATION_THRESHOLD) playMetalSoundRandomly();
  }
  lastLeftWrist = wrist;
}

function detectFalling(curr, prev) {
  const idx = [12, 11, 24, 23];
  const avgY = p => idx.reduce((s, i) => s + p.keypoints[i].y, 0) / idx.length;
  const deltaY = avgY(curr) - avgY(prev);
  if (deltaY > FALLING_THRESHOLD) playFallingViolin(deltaY);
}

function calculateAcceleration(curr, prev) {
  if (!prev) return 0;
  return dist(0, 0, curr.x - prev.x, curr.y - prev.y);
}

function mapRange(v, in0, in1, out0, out1) {
  return Math.min(out1, Math.max(out0, out0 + (v - in0) / (in1 - in0) * (out1 - out0)));
}


// =====================
// 🎬 PLAYBACK + UI
// =====================
async function startPlaying() {
  if (isPlaying) return;
  isPlaying = true;
  await Tone.start();
  await Tone.loaded();
  Tone.Transport.start();
  console.log("🎵 Playback started");
}

function stopPlaying() {
  if (!isPlaying) return;
  isPlaying = false;
  Tone.Transport.stop();
  console.log("🛑 Playback stopped");
}

function keyPressed() {
  if (key === '2') startPlaying();
  else if (key === '1') stopPlaying();
}


// =====================
// 🧱 P5 SETUP + DRAW
// =====================
function preload() {
  bodyPose = ml5.bodyPose('BlazePose');
}

function setup() {
  createCanvas(640, 480);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  bodyPose.detectStart(video, gotPoses);

  initLayer1();
  initLayer2();
  initLayer3();

  setTimeout(startCageLoop, 30000);  // 10 000 ms 后启动

}

function draw() {
  image(video, 0, 0, width, height);
  poses.forEach(p => p.keypoints.forEach(k => {
    fill(0, 255, 0); noStroke(); circle(k.x, k.y, 5);
  }));
}
