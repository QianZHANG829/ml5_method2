// =====================
// 🎼 Conflict & Tension ‑ 3‑Layer Music System
// =====================

// === GLOBAL STATE ===
let video, bodyPose, poses = [], prevPose = null, prevTime = 0;
let isPlaying      = false;
let lastDrumTime   = 0;
let drumCooldown   = 400;           // ms (动态调整)

// === THRESHOLDS & LIMITS ===
const MOVEMENT_THRESHOLD     = 6;   // moveIntensity 起触发
const ACCELERATION_THRESHOLD = 25;  // groupAcceleration 起调速
const MAX_MOVE   = 12;              // 练习时测得上界
const MAX_ACCEL  = 50;

// === 关键点 & 权重 (BlazePose 索引)
const KP_CFG = [
  { i:11, w:1.0 }, { i:12, w:1.0 },   // shoulders
  { i:15, w:1.2 }, { i:16, w:1.2 },   // wrists
  { i:23, w:0.8 }, { i:24, w:0.8 },   // hips
  { i:27, w:0.6 }, { i:28, w:0.6 }    // ankles
];

// =====================
// 🎵 LAYER 1 – Ambient Pad
// =====================
let ambientPlayer;
function initLayer1() {
  const reverb = new Tone.Reverb({ decay: 6, wet: 0.5 });
  const delay  = new Tone.FeedbackDelay({ delayTime:"8n", feedback:0.6, wet:0.4 });
  ambientPlayer = new Tone.Player({
    url: "music/async/ambient_tension.wav",
    loop:true,
    volume:-10
  }).chain(reverb, delay, Tone.Destination);
}

// =====================
// 🥁 LAYER 2 – Drum (single‑hit kits)
// =====================
let drums;
function initLayer2() {
  drums = {
    soft : new Tone.Player("music/all-samples/percussion/bass drum/bass-drum__1_pianissimo_struck-singly.mp3").toDestination(),
    mid  : new Tone.Player("music/all-samples/percussion/bass drum/bass-drum__1_mezzo-piano_struck-singly.mp3").toDestination(),
    hard : new Tone.Player("music/all-samples/percussion/bass drum/bass-drum__1_fortissimo_struck-singly.mp3").toDestination()
  };
  Object.values(drums).forEach(p => p.volume.value = -20);
}

// =====================
// 🔔 LAYER 3 – Sparse Ethereal Chimes
// =====================
let afterFX;
function initLayer3() {
  const files = [
    "music/all-samples/french horn/french-horn_B2_1_forte_major-trill.mp3",
    "music/async/metal-bowl-hit.wav.mp3"
  ];
  afterFX = new Tone.Gain(0).toDestination();
  const hpf   = new Tone.Filter(120,"highpass");
  const verb  = new Tone.Reverb({decay:12,wet:0.85});
  const pan   = new Tone.AutoPanner({frequency:0.03}).start();
  hpf.chain(verb, pan, afterFX);

  function playChime() {
    new Tone.Player({
      url: files[Math.floor(Math.random()*files.length)],
      autostart:true,
      volume:-12
    }).connect(hpf);
    setTimeout(playChime, Tone.Time(random(20,30),"s").toMilliseconds());
  }
  // 进入 30 s 后再淡入
  setTimeout(()=>{
    afterFX.gain.linearRampTo(0.6,5);
    playChime();
  }, 30000);
}

// =====================
// 🧠 MOTION HELPERS
// =====================
function calcMove(curr, prev, dt){
  if(!prev||dt<=0) return 0;
  const shoulder = dist(curr.keypoints[11].x,curr.keypoints[11].y,
                         curr.keypoints[12].x,curr.keypoints[12].y)||1;
  let sum=0,sW=0;
  KP_CFG.forEach(({i,w})=>{
    const v = dist(curr.keypoints[i].x-prev.keypoints[i].x,
                   curr.keypoints[i].y-prev.keypoints[i].y) / dt;
    sum += v*w; sW += w;
  });
  return (sum/sW)/shoulder;
}

function calcAccel(curr, prev, dt){
  if(!prev||dt<=0) return 0;
  let aSum=0, wSum=0;
  KP_CFG.forEach(({i,w})=>{
    const vx  = (curr.keypoints[i].x-prev.keypoints[i].x)/dt;
    const vy  = (curr.keypoints[i].y-prev.keypoints[i].y)/dt;
    const pvx = (prev.keypoints[i].x-prev.prevX[i])/dt || 0;
    const pvy = (prev.keypoints[i].y-prev.prevY[i])/dt || 0;
    const ax  = (vx-pvx)/dt, ay=(vy-pvy)/dt;
    aSum += dist(0,0,ax,ay)*w; wSum+=w;
  });
  return aSum/wSum;
}

function playDrum(intensity){        // intensity 0‑1
  const kit = intensity<0.33 ? "soft" : intensity<0.66 ? "mid" : "hard";
  drums[kit].volume.value = -20 + intensity*18;                 // 音量
  drums[kit].playbackRate = Math.pow(2,(intensity*6-3)/12);     // ±3 半音
  drums[kit].start();
  lastDrumTime = millis();
}

// =====================
// 🔄 POSE CALLBACK
// =====================

function gotPoses(res){

  poses = res;

  if(!isPlaying || !res.length) return;
  const curr = res[0];
  const now  = millis();

  if(prevPose){
    const dt = (now - prevTime)/1000;
    const move  = calcMove(curr, prevPose, dt);
    const accel = calcAccel(curr, prevPose, dt);

    // ——① 强度 → 直接敲击
    if(move > MOVEMENT_THRESHOLD){
      const n = constrain((move-MOVEMENT_THRESHOLD)/(MAX_MOVE-MOVEMENT_THRESHOLD),0,1);
      playDrum(n);
    }

    // ——② 加速度 → 动态间隔
    if(accel > ACCELERATION_THRESHOLD){
      const nA = constrain((accel-ACCELERATION_THRESHOLD)/(MAX_ACCEL-ACCELERATION_THRESHOLD),0,1);
      drumCooldown = lerp(600,120,nA);   // 120‑600 ms
    }

    // ——③ 没有动作也保持心跳
    if(now - lastDrumTime >= drumCooldown){
      playDrum(0.3);
    }
  }

  // 存上一帧
  prevPose = curr;
  prevPose.prevX = curr.keypoints.map(k=>k.x);
  prevPose.prevY = curr.keypoints.map(k=>k.y);
  prevTime = now;
}

// =====================
// 🎬 PLAY / STOP
// =====================
async function startPlaying(){
  if(isPlaying) return;
  isPlaying = true;
  await Tone.start(); await Tone.loaded();
  ambientPlayer.start();                              // Layer 1
  console.log("🎵 Start");

  // 15 s 后淡入 Layer 3 (已在 initLayer3 设置)
}

function stopPlaying(){
  if(!isPlaying) return;
  isPlaying=false;
  ambientPlayer.stop();
  Object.values(drums).forEach(p=>p.stop());
  console.log("🛑 Stop");
}

// =====================
// 🖼️  P5 SETUP
// =====================
function preload(){ 
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
}

function draw() {
  image(video, 0, 0, width, height);

  // Draw all detected keypoints
  for (let i = 0; i < poses.length; i++) {
    let pose = poses[i];
    for (let j = 0; j < pose.keypoints.length; j++) {
      let keypoint = pose.keypoints[j];
      fill(0, 255, 0);
      noStroke();
      circle(keypoint.x, keypoint.y, 8);
    }
  }
}

function keyPressed(){
  if(key==='2') startPlaying();
  else if(key==='1') stopPlaying();
}

// ============  UTILS  ============
function random(a,b){ return a + Math.random()*(b-a); }


