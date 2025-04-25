// =====================
// 🎼 Adaptive Drum Loop – Speed-Based with 3 Levels + Cooldown (Modified)


// =====================
let debug = true; // Debug mode

let conflictScore = 0;                 // 0-1 之间
const DECAY = 0.0008;                   // 每帧衰减
const RISE  = 0.05;                    // 每次高强度运动的增量
const HIGH_MOVEMENT = 1000;             // 认定“激烈”的阈值
let movement = 0;                 // 当前运动强度
let avgSpeed = 0;           // 平均速度
let score = 0;            // 运动强度分数

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
    url:"music/async/ambient_tension.wav", loop:true, volume:-12
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

let lastAvgSpeed = 0;
// 🧠 Update Drum Pattern Based on Speed (3 levels + cooldown)
// function updateDrumPatternFromSpeed(avgSpeed){
//     lastAvgSpeed = avgSpeed;   // ← 千万别漏
//     const now = millis();
//     if (now - lastDrumUpdateTime < DRUM_COOLDOWN) return;

//     const {bpm, volume} = avgSpeed < SPEED_THRESHOLD_LOW ? {bpm:BPM_SLOW ,volume:-12} :
//                           avgSpeed < SPEED_THRESHOLD_HIGH? {bpm:BPM_MEDIUM,volume:-6} :
//                                                         {bpm:BPM_FAST ,volume:-2};

//     drumInterval = 60 / bpm;
//     drumVolume   = volume;

//     rebuildDrumPart(drumInterval, conflictScore > 0.7);
//     lastDrumUpdateTime = now;

//     console.log(`🥁 ${avgSpeed.toFixed(1)} → ${bpm} BPM | ${drumInterval.toFixed(2)}s | ${volume} dB`);
// }

/* ----------------- 速度连续映射 40-160 BPM ----------------- */
const SPEED_HIGH = 1000;      // 你的 avgSpeed 满档阈值
function speedToBPM(avg){
  // p5 内建 map() / constrain()
  return constrain( map(avg, 0, SPEED_HIGH, 40, 160), 40, 160 );
}

/* 让鼓根据连续 BPM 更新 */
function updateDrumPatternFromSpeed(avgSpeed){
  const now = millis();
  if (now - lastDrumUpdateTime < DRUM_COOLDOWN) return;

  const bpm     = speedToBPM(avgSpeed);            // 40–160 连续
  const volume  = map(bpm, 40, 160, -14, -2);      // 越快越响

  drumInterval  = 60 / bpm;
  drumVolume    = volume;

  rebuildDrumPart(drumInterval, conflictScore > 0.7);
  lastDrumUpdateTime = now;

  console.log(`🥁 avg=${avgSpeed.toFixed(0)} → ${bpm.toFixed(1)} BPM  vol=${volume.toFixed(1)} dB`);
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
      movement = calculateMovementIntensity(currentPose, previousData.pose);

      speedHistory.push(movement);              // ✨ 永远记录

      if (drumsLive && speedHistory.length >= 4){
        
        speedHistory.shift();   // 只保留最近 4 条
        avgSpeed = speedHistory.reduce((a,b)=>a+b,0) / speedHistory.length;
      }
      
      // 第一次大动作才开鼓
      if (!drumsLive && movement > MOVEMENT_THRESHOLD){
        drumsLive = true;
        drumPart.mute = false;
      }

    }
    lastCalculationTime = currentTime;
  }

  if (movement > HIGH_MOVEMENT) {
    conflictScore = Math.min(1, conflictScore + RISE);
  } else {
    conflictScore = Math.max(0, conflictScore - DECAY);  // 自然回落
  }
  updateLayerVolumes(conflictScore);
}

function updateLayerVolumes(conflictScore){
  // 线性或自定义曲线都行
  ambientPlayer.volume.rampTo(-12 + conflictScore * 6, 0.5);          // -12dB → -6dB
  drums.hard.volume.rampTo(-10 + conflictScore * 8, 0.3);             // -10dB → -2dB
  layer3.volume.rampTo(-60 + conflictScore * 40, 0.3);          // 从静音滑入
  layer4.volume.rampTo(-60 + Math.max(0, conflictScore-0.6)*40, 0.3);
  
  // 加一点失真或滤波扫频
  distortion.wet.value = conflictScore * 0.7;                         // 0 → 0.7
  hiPass.frequency.rampTo(400 + conflictScore*2000, 0.5);             // 400Hz → 2.4kHz
  
}

// 🥁 Layer 3 – Glitch / Granular Drums
let layer3, layer4, distortion, hiPass;

function initConflictLayers(){
  distortion = new Tone.Distortion(0.4).toDestination();
  hiPass     = new Tone.Filter(400, "highpass").connect(distortion);

  layer3 = new Tone.Player({
    url: "music/async/techno_litched-glitch-synth.wav",
    loop: true,
    volume: -Infinity            // 初始静音
  }).connect(hiPass);

  layer4 = new Tone.Player({
    url: "music/async/techno_210bpm_glitch.wav",
    loop: true,
    volume: -Infinity
  }).connect(hiPass);
}

function rebuildDrumPart(interval, dense=false){
  if (drumPart) drumPart.dispose();
  const steps = dense ? 32 : 16;
  const notes = Array.from({length:steps}, (_,i)=>[i*interval,"C1"]);
  drumPart = new Tone.Part((t)=>{drums.hard.volume.value=drumVolume;drums.hard.start(t);},notes);
  drumPart.loop = true;
  drumPart.loopEnd = `${steps*interval}`;
  drumPart.start(0);
}

// 🎬 Play / Stop
async function startPlaying(){
  if(isPlaying) return;
  isPlaying = true;
  await Tone.start(); await Tone.loaded();
  Tone.Transport.start("+0.1");
  ambientPlayer.start();

  layer3.start(); 

  layer4.start();


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

  initLayer1(); 
  initLayer2();
  initConflictLayers();

  initShardScheduler() // 采样池

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
  console.log("📊 Movement intensity:", movement);

}
function constrain(v,min,max){ return Math.max(min, Math.min(v, max)); }
function millis(){ return performance.now(); }
function random(a,b){ return a + Math.random()*(b-a); }

//////////////////  ====================
// random()  // 随机播放声音，layer

/* 采样池 */
const shards = new Tone.Players({
  cymbal : "music/async/glass-smash.wav",
  glass  : "music/async/glass-smash-bottle-b.wav",
  piano  : "music/async/piano_string_hit_reverb.wav",
  anvil  : "music/async/sci-fi_explosion_2.wav"
})
  .connect(new Tone.Reverb({ decay: 1.2, wet: 0.4 }))
  .toDestination();

/* 播放函数 */
function triggerShard(time){
  const ids = ["glass","cymbal","anvil","piano"];
  const id  = ids[Math.floor(Math.random()*ids.length)];
  const ply = shards.player(id);

  ply.playbackRate = random(0.85, 1.25);
  ply.detune       = random(-300, 150);
  ply.volume.value = random(-14, -6);      // 更明显
  ply.pan          = random(-0.6, 0.6);
  ply.start(time);                         // ← 关键！
}

/* 调度器 */
function initShardScheduler(){
  // 每 4 小节随机触发一次，首触发延迟半小节
  Tone.Transport.scheduleRepeat(
    (time)=>{ triggerShard(time); },
    "4m",
    "+0.5m"
  );
}




if (debug){
  setInterval(()=>{           // 每 1 秒打印一次
    // console.clear();          // 清柜面
    console.table({
      movement          : movement.toFixed(1),
      avgSpeed          : avgSpeed.toFixed(1),
      conflictScore     : conflictScore.toFixed(2),
      drumBPM           : (60/drumInterval).toFixed(0),
      drumSteps         : drumPart ? drumPart.loopEnd : "—",
      layer3_dB         : layer3.volume.value.toFixed(1),
      layer4_dB         : layer4.volume.value.toFixed(1),
      distortionWet     : distortion.wet.value.toFixed(2),
      hiPassFreq        : hiPass.frequency.value.toFixed(0)
    });
  },1000);
}


