// =====================
// 🎼 Emotion Music System - Modular Structure
// =====================

// === GLOBAL STATE ===
let video, bodyPose, poses = [], poseHistory = [];
let isPlaying = false;
let lastLeftWrist = null, lastCalculationTime = 0;
const ACCELERATION_THRESHOLD = 80;
const FALLING_THRESHOLD = 60;


// =====================
// 🎵 INIT AUDIO LAYER 1 - Ambient Cello & Brown Noise
// =====================
let celloSampler, ambientPlayer, noise;

function initLayer1() {
  const reverb = new Tone.Reverb({ decay: 6, wet: 0.5 }).toDestination();
  const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.5, wet: 0.3 }).toDestination();

  celloSampler = new Tone.Sampler({
    urls: {
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

  const singleNotes = ["C3", "G2", "D3", "E3"];
  const phraseNotes = ["A3", "E3-1"];
  const singleNoteIntervals = [4, 6, 12, 18, 16, 24];
  const phraseNoteIntervals = [40, 48, 60, 72];

  function scheduleIndividualNote(note, intervals) {
    const interval = intervals[Math.floor(Math.random() * intervals.length)];
    Tone.Transport.scheduleOnce((time) => {
      celloSampler.triggerAttack(note, time);
      scheduleIndividualNote(note, intervals);
      console.log(`🎻 Cello note triggered: ${note}, interval: ${interval}m`);
    }, `+${interval}m`);
  }

  singleNotes.forEach(note => scheduleIndividualNote(note, singleNoteIntervals));
  phraseNotes.forEach(note => scheduleIndividualNote(note, phraseNoteIntervals));

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
    player.volume.value = -20;
    return player;
  });

  window.playMetalSoundRandomly = function () {
    let index;
    do {
      index = Math.floor(Math.random() * pianoPlayers.length);
    } while (index === lastPianoIndex);
    lastPianoIndex = index;

    const player = pianoPlayers[index];
    globalPitchShift.pitch = random(...pianoSettings.pitchRange);
    player.playbackRate = random(...pianoSettings.rateRange);
    player.start();
    console.log(`🎹 Piano sound triggered: index ${index} | pitch ${globalPitchShift.pitch.toFixed(2)} | rate ${player.playbackRate.toFixed(2)}`);

  };
}


// =====================
// 🎹 INIT AUDIO LAYER 3 - random
// =====================

let cagePlayer;

function initLayer4() {
  const cageSounds = [
    "music/async/tibetan-bowl_center-hit.wav",
    "music/async/zymbel.mp3"
  ];

  const cageSoundMap = cageSounds.reduce((acc, url, i) => {
    acc[i] = url;
    return acc;
  }, {});

  cagePlayer = new Tone.Players(cageSoundMap).toDestination();
}

function playCageRandomSound() {
  if (!cagePlayer) {
    console.warn("⚠️ cagePlayer 未初始化");
    return;
  }

  const keys = Object.keys(cagePlayer._players); // 获取 player 的 key 数组
  if (keys.length === 0) {
    console.warn("⚠️ 没有可用的音频 player！");
    return;
  }

  const index = keys[Math.floor(Math.random() * keys.length)];
  cagePlayer.player(index).start();
  console.log(`🎲 John Cage Layer - triggered sound ${index}`);
  setTimeout(playCageRandomSound, random(4000, 12000));
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
  playCageRandomSound(); // layers3
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
  initLayer4(); // 🟡 这必须放在这里才会初始化 cagePlayer

}

function draw() {
  image(video, 0, 0, width, height);
  poses.forEach(p => p.keypoints.forEach(k => {
    fill(0, 255, 0); noStroke(); circle(k.x, k.y, 5);
  }));
}
