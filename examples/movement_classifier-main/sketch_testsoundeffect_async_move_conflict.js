// =====================
// 🎼 Adaptive Drum Loop – Speed-Based with 3 Levels + Cooldown (Modified)
// =====================

const MOVEMENT_THRESHOLD = 600;
const SPEED_MIN = 0, SPEED_MAX = 800;
const CALCULATION_INTERVAL = 100; // ms

// 🎯 三档速度的阈值与BPM设置
const SPEED_THRESHOLD_LOW = 500;
const SPEED_THRESHOLD_HIGH = 1000;
const BPM_SLOW = 60;
const BPM_MEDIUM = 100;
const BPM_FAST = 140;

let video, bodyPose, poses = [], poseHistory = [], prevTime = 0;
let isPlaying = false;
let drumsLive = false;
let currN = 0.3;

let drums = {}, drumPart;
let drumInterval = 0.5;
let drumVolume = -10;
let speedHistory = [];

let lastDrumUpdateTime = 0;
const DRUM_COOLDOWN = 4000;
let lastCalculationTime = 0;

// 🎵 Layer 1 – Ambient Pad
let ambientPlayer;
function initLayer1(){
  const reverb = new Tone.Reverb({decay:6, wet:0.5});
  const delay  = new Tone.FeedbackDelay({delayTime:"8n", feedback:0.6, wet:0.4});
  ambientPlayer = new Tone.Player({
    url:"music/async/ambient_tension.wav", loop:true, volume:-8
  }).chain(reverb, delay, Tone.Destination);
}

// 🥁 Layer 2 – Drums with Adaptive Loop
function initLayer2(){
  const reverb = new Tone.Reverb({ decay: 4, preDelay: 0.01, wet: 0.6 });
  const echo   = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.5, wet: 0.4 });

  drums = {
    hard : new Tone.Player("music/all-samples/percussion/bass-drum/bass-drum__1_fortissimo_struck-singly.mp3")
              .chain(reverb, echo, Tone.Destination)
  };
  drums.hard.volume.value = drumVolume;

  let notes = Array(16).fill(0).map((_, i) => [i * drumInterval, "C1"]);
  drumPart = new Tone.Part((time, note) => {
    drums.hard.volume.value = drumVolume;
    drums.hard.start(time);
  }, notes).start(0);

  drumPart.loop = true;
  drumPart.loopEnd = `${16 * drumInterval}`;
  drumPart.mute = true;
}

// 🧠 Update Drum Pattern Based on Speed (3 levels + cooldown)
function updateDrumPatternFromSpeed(avgSpeed){
  const now = millis();
  if (now - lastDrumUpdateTime < DRUM_COOLDOWN) {
    console.log("⏳ Drum update on cooldown...");
    return;
  }

  let bpm, volume;
  if (avgSpeed < SPEED_THRESHOLD_LOW) {
    bpm = BPM_SLOW; volume = -12;
  } else if (avgSpeed < SPEED_THRESHOLD_HIGH) {
    bpm = BPM_MEDIUM; volume = -6;
  } else {
    bpm = BPM_FAST; volume = -2;
  }

  drumInterval = 60 / bpm;
  drumVolume = volume;

  // 💥 关键：完全重建 drumPart，清除旧的节奏调度
  if (drumPart) {
    drumPart.dispose();
  }

  const notes = Array(16).fill(0).map((_, i) => [i * drumInterval, "C1"]);
  drumPart = new Tone.Part((time, note) => {
    drums.hard.volume.value = drumVolume;
    drums.hard.start(time);
  }, notes).start(0);

  drumPart.loop = true;
  drumPart.loopEnd = `${16 * drumInterval}`;
  drumPart.mute = false;

  lastDrumUpdateTime = now;
  console.log(`🥁 avgSpeed: ${avgSpeed.toFixed(1)} → ${bpm} BPM | interval: ${drumInterval.toFixed(2)}s | volume: ${volume} dB`);
}


// 🔄 Pose callback with history + average speed
function gotPoses(results) {
  poses = results;
  if (!isPlaying || results.length === 0) return;

  const currentPose = results[0];
  const currentTime = millis();

  poseHistory.push({ pose: currentPose, timestamp: currentTime });
  poseHistory = poseHistory.filter(p => currentTime - p.timestamp <= 1000);

  if (currentTime - lastCalculationTime >= CALCULATION_INTERVAL) {
    let previousData = poseHistory.find(p => currentTime - p.timestamp >= 950);
    if (previousData) {
      const movement = calculateMovementIntensity(currentPose, previousData.pose);

      if (drumsLive) {
        speedHistory.push(movement);
        if (speedHistory.length >= 4) {
          const avgSpeed = speedHistory.reduce((a,b)=>a+b,0)/speedHistory.length;
          updateDrumPatternFromSpeed(avgSpeed);
          speedHistory = [];
        }
      } else if (movement > MOVEMENT_THRESHOLD) {
        drumsLive = true;
        drumPart.mute = false;
        speedHistory.push(movement);
      }

      console.log("📊 Movement intensity:", movement);
    }
    lastCalculationTime = currentTime;
  }
}

// 🎬 Play / Stop
async function startPlaying(){
  if(isPlaying) return;
  isPlaying = true;
  await Tone.start(); await Tone.loaded();
  Tone.Transport.start("+0.1");
  ambientPlayer.start();
  console.log("▶️ Start");
}
function stopPlaying(){
  if(!isPlaying) return;
  isPlaying = false;
  ambientPlayer.stop();
  drums.hard.stop();
  Tone.Transport.stop();
  drumPart.mute = true;
  drumsLive = false;
  speedHistory = [];
  console.log("⏹ Stop");
}

// 📷 p5 setup / draw
function preload(){ bodyPose=ml5.bodyPose('BlazePose'); }
function setup(){
  createCanvas(640,480);
  video=createCapture(VIDEO); video.size(640,480); video.hide();
  bodyPose.detectStart(video, gotPoses);
  initLayer1(); initLayer2();
}
function draw(){
  image(video,0,0,width,height);
  poses.forEach(p=>p.keypoints.forEach(k=>{
    fill(0,255,0); noStroke(); circle(k.x,k.y,6);
  }));
}
function keyPressed(){
  if(key==='2') startPlaying();
  else if(key==='1') stopPlaying();
}

// 🧮 helpers
function calculateMovementIntensity(curr, prev){
  if (!prev) return 0;
  const selectedKeypointsIndices = [11, 12, 13, 14, 15, 16, 23, 24];
  let total = 0;
  selectedKeypointsIndices.forEach(i => {
    const c = curr.keypoints[i];
    const p = prev.keypoints[i];
    if (!c || !p || !isFinite(c.x) || !isFinite(p.x)) return;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    total += dist(0, 0, dx, dy);
  });
  return total;
}
function constrain(v,min,max){ return Math.max(min, Math.min(v, max)); }
function millis(){ return performance.now(); }
function random(a,b){ return a + Math.random()*(b-a); }

