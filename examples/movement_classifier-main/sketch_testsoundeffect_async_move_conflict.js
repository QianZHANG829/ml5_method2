// =====================
// 🎼 Conflict & Tension – Full Sketch
// =====================

// ——— 全局常量 ———
const MOVEMENT_THRESHOLD = 6;    // px/s 触发
const MAX_SPEED          = 12;   // px/s 正常上界 (排练后可调)
const SPEED_MIN = 0,  SPEED_MAX = 800;   // 映射区间
const INT_MIN   = 1,  INT_MAX   = 0.25;  // s (1s → 0.25s)

let video, bodyPose, poses = [], prevPose = null, prevTime = 0;
let isPlaying = false;               // 键 2 / 1 控制
let drumsLive = false;               // 是否已开鼓
let currN     = 0.3;                 // 强度 0‑1
let drumLoop;                        // Tone.Loop ref

// =====================
// 🎵 Layer 1 – Ambient Pad
// =====================
let ambientPlayer;
function initLayer1(){
  const reverb = new Tone.Reverb({decay:6, wet:0.5});
  const delay  = new Tone.FeedbackDelay({delayTime:"8n", feedback:0.6, wet:0.4});
  ambientPlayer = new Tone.Player({
    url:"music/async/ambient_tension.wav", loop:true, volume:-8
  }).chain(reverb, delay, Tone.Destination);
}

// =====================
// 🥁 Layer 2 – Drums
// =====================
let drums = {};
function initLayer2(){
  drums = {
    soft : new Tone.Player("music/all-samples/percussion/bass-drum/bass-drum__1_pianissimo_struck-singly.mp3").toDestination(),
    mid  : new Tone.Player("music/all-samples/percussion/bass-drum/bass-drum__1_mezzo-piano_struck-singly.mp3").toDestination(),
    hard : new Tone.Player("music/all-samples/percussion/bass-drum/bass-drum__1_fortissimo_struck-singly.mp3").toDestination()
  };
  Object.values(drums).forEach(p=>p.volume.value=-20);

  // 持续 Loop：先静音、间隔 1 s
  drumLoop = new Tone.Loop(t=>playDrumAtTime(currN,t), 1).start(0);
  drumLoop.mute = true;
}
function playDrumAtTime(intensity,t){
  const kit = intensity<0.33 ? "soft": intensity<0.66 ? "mid":"hard";
  drums[kit].volume.value = -20 + intensity*18;  // -20 → -2 dB
  drums[kit].start(t);
}

// =====================
// 🔔 Layer 3 – Sparse Chimes
// =====================
let afterFX;
function initLayer3(){
  const files = [
    "music/all-samples/french horn/french-horn_B2_1_forte_major-trill.mp3",
    "music/async/metal-bowl-hit.wav.mp3"
  ];
  afterFX = new Tone.Gain(0).toDestination();
  const hpf  = new Tone.Filter(120,"highpass");
  const verb = new Tone.Reverb({decay:12,wet:0.85});
  const pan  = new Tone.AutoPanner({frequency:0.03}).start();
  hpf.chain(verb, pan, afterFX);

  function playChime(){
    new Tone.Player({url:files[int(random(files.length))],autostart:true,volume:-12})
      .connect(hpf);
    setTimeout(playChime, random(20000,30000));   // 20–30 s
  }
  setTimeout(()=>{
    afterFX.gain.linearRampTo(0.6,5);
    playChime();
  }, 30000);   // 30 s 后淡入
}

// =================================
// 🧠 Motion – helpers
// =================================
function calculateMovementIntensity(curr, prev){
  const idx = [11,12,13,14,15,16,23,24];
  let total = 0;
  idx.forEach(i=>{
    const c=curr.keypoints[i], p=prev.keypoints[i];
    if(!c||!p||!isFinite(c.x)||!isFinite(p.x)) return;
    total += dist(0,0, c.x-p.x, c.y-p.y);
  });
  return total;
}
function mapVal(v,in0,in1,out0,out1){
  return out0 + (v-in0)*(out1-out0)/(in1-in0);
}

// =====================
// 🔄 Pose callback
// =====================
function gotPoses(res){
  poses = res;
  if(!isPlaying||!res.length) return;

  const curr = res[0];
  if(!prevPose){
    prevPose = curr; prevTime = millis();
    return;
  }

  const now = millis();
  const dt  = Math.max((now-prevTime)/1000, 0.001);
  const disp  = calculateMovementIntensity(curr, prevPose);  // px
  const speed = disp/dt;                                     // px/s

  // 强度 n 用速度归一化
  currN = constrain((speed-MOVEMENT_THRESHOLD)/(MAX_SPEED-MOVEMENT_THRESHOLD),0,1);

  // 第一次超阈值 → 打开鼓
  if(!drumsLive && speed> MOVEMENT_THRESHOLD){
    drumLoop.mute=false; drumsLive=true;
  }

  // 鼓已响 → 用速度映射间隔
  if(drumsLive){
    const newInt = mapVal(constrain(speed,SPEED_MIN,SPEED_MAX),
                          SPEED_MIN, SPEED_MAX, INT_MIN, INT_MAX);
    drumLoop.interval = newInt;   // 立即生效
  }

  // 调试输出
  if(frameCount%10===0) console.log(`spd:${speed.toFixed(1)}  n:${currN.toFixed(2)}  int:${drumLoop.interval.toFixed(2)}s`);

  prevPose = curr; prevTime=now;
}

// =====================
// 🎬 Play / Stop
// =====================
async function startPlaying(){
  if(isPlaying) return;
  isPlaying=true;
  await Tone.start(); await Tone.loaded();
  Tone.Transport.start("+0.1");
  ambientPlayer.start();
  console.log("▶️ Start");
}
function stopPlaying(){
  if(!isPlaying) return;
  isPlaying=false;
  ambientPlayer.stop();
  Object.values(drums).forEach(p=>p.stop());
  Tone.Transport.stop();
  drumLoop.mute=true; drumsLive=false;
  console.log("⏹ Stop");
}

// =====================
// 🖼️ p5 setup / draw
// =====================
function preload(){ bodyPose=ml5.bodyPose('BlazePose'); }
function setup(){
  createCanvas(640,480);
  video=createCapture(VIDEO); video.size(640,480); video.hide();
  bodyPose.detectStart(video, gotPoses);

  initLayer1(); initLayer2(); initLayer3();
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

// utils
function random(a,b){return a+Math.random()*(b-a);}
