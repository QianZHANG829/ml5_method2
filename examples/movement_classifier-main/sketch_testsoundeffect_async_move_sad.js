// =====================
// 🎼 Emotion Music System - Modular Structure
// =====================



// === GLOBAL STATE ===
let video, bodyPose, poses = [], poseHistory = [];
let latestPose = null; 
let isPlaying = false, audioReady = false;
let hitBD, cymPlayer;

// === THRESHOLDS (全局阈值一览) ===
const SHAKE_THRESHOLD   = 500;  // deg/s
const RELEASE_THRESHOLD = 400;
const CONTRACT_ON       = 0.30; 
const CONTRACT_OFF      = 0.15;
const HEAD_DROP_RATIO   = 0.05; // 躯干 8 %

const ACCEL_THRESHOLD   = 80;   // 手触发钢琴

let prevTheta = null, prevTime = null, shaking = false, lastNote = null;
let shoulderDiffHist = [];
let baseRatio = null;   // (shoulderDist / torsoLen) 基准

lastContractTime = 0;
let lastSpikeTime = 0;


const ACCELERATION_THRESHOLD = 80;  // 左手触发钢琴
const FALLING_THRESHOLD      = 80;  // 下坠判定
const EXTENSION_THRESHOLD    = 100; // 腿/脚延伸
const COOLDOWN_TIME          = 1000; // 冷却 (ms)
const SPIN_THRESHOLD        = 60; //旋转
let lastRotationTrig = 0;  


let lastLeftWrist = null, lastCalculationTime = 0;
let lastShoulderDiff = null;
let shoulderDiffHistory = [];
let lastPianoTriggerTime = 0;
let lastRotationTriggerTime = 0;

let lastPianoTrig = 0; // 钢琴冷却计时器


// ─────────── Tone.js 初始化 ────────────
/* ───────── Tone.js ───────── */
const pan = new Tone.Panner().toDestination();      // 立体声位置
const verb = new Tone.Reverb({decay:1.2, wet:0.3}).toDestination();

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
    volume: -20
  }).chain(delay, reverb, Tone.Destination); ;

  ambientPlayer = new Tone.Player({
    url: "music/async/ambient_experimental.wav",
    loop: true,
    autostart: true,
    volume: -28
  }).chain(delay,verb);


  // ---------- 时间轴调度（不重叠） ----------
  const singleNotes  = ["C3", "G2", "D3", "E3"];
  const phraseEvents=[{t:0,n:"A3"},{t:8,n:"E3-1"}];
  const singleIntervals = [4, 6, 12, 18, 16, 24]; // 以“拍”为单位 (m = measures)

  function sched(next=0,idx=0){
    if(idx<phraseEvents.length){
      const p=phraseEvents[idx];
      if(next>=p.t){
        Tone.Transport.scheduleOnce(t=>{
          celloSampler.triggerAttack(p.n,t);
          sched(next,idx+1);
        },`+${next}m`);return;
      }
      const maxGap=p.t-next;
      const int=singleIntervals.filter(v=>v<=maxGap).sort(()=>Math.random()-.5)[0]||maxGap;
      
      const note=random(singleNotes);
      Tone.Transport.scheduleOnce(t=>{
        celloSampler.triggerAttack(note,t);
        sched(next+int,idx);
      },`+${next}m`);
    }else{
      const int=random(singleIntervals);
      const note=random(singleNotes);
      Tone.Transport.scheduleOnce(t=>{
        celloSampler.triggerAttack(note,t);
        sched(next+int,idx);
      },`+${next}m`);
    }
  }
  sched(0);

  // Brown-noise pad
  noise=new Tone.Noise("brown").start();
  const nFilt=new Tone.Filter(300,"lowpass");
  const nVerb=new Tone.Reverb({decay:12,wet:0.9});
  noise.chain(nFilt,nVerb,Tone.Destination);
  noise.volume.value=-38;
  Tone.Transport.scheduleRepeat(time=>{
    nFilt.frequency.linearRampTo(200+Math.random()*500,10,time);
  },12);
}



// =====================
// 🎻 INIT AUDIO LAYER 2 -  (Falling / Spin / Shake) + Bass Drum (Contract)
// =====================
let violinSampler, violinShift;

const PONT_NOTES = ["D4","F4","A4","C5","E5"];  // D minor 五声音阶

function initLayer2(){
  const vVerb=new Tone.Reverb({decay:14,wet:0.8});
  const vDelay=new Tone.FeedbackDelay({delayTime:"4n",feedback:0.3,wet:0.5});
  violinShift=new Tone.PitchShift(0).chain(vDelay,vVerb,Tone.Destination);

  violinSampler=new Tone.Sampler({
    urls:{
      "G#7":"music/all-samples/violin/violin_Gs5_long_forte_molto-vibrato.mp3",
      "E4":"music/all-samples/violin/violin_E4_1_piano_arco-normal.mp3",
      "G3":"music/all-samples/violin/violin_G3_1_mezzo-forte_molto-vibrato.mp3",
      "A3":"music/all-samples/violin/violin_A3_1_pianissimo_arco-normal.mp3",
      "A4":"music/all-samples/violin/violin_A4_1_fortissimo_arco-normal.mp3",
      "A5":"music/all-samples/violin/violin_A4_05_pianissimo_arco-normal.mp3"
    },
    volume:-8
  }).connect(violinShift);

  hitBD = new Tone.Player(
    "music/all-samples/percussion/bass-drum/bass-drum__1_fortissimo_struck-singly.mp3"
  );                                 // ← 先只 new，不马上接到输出

  // ① 创建 Player ➜ 接自己的 Reverb ➜ Destination
  const drumVerb = new Tone.Reverb({ decay: 0.8, wet: 0.15 }).toDestination();
  hitBD = new Tone.Player(
          "music/all-samples/percussion/bass-drum/bass-drum__1_fortissimo_struck-singly.mp3"
        ).connect(drumVerb);   // 直接 chain，根本用不到 disconnect()


  cymPlayer = new Tone.Player(
  "music/all-samples/percussion/suspended-cymbal/suspended-cymbal__1_forte_scraped.mp3"
  ).connect(drumVerb);

}



// ① 一次性建一个 Players（Tone.js 的「多 Player」容器）
const glissFiles = {
  "As5": "music/all-samples/violin/violin_As5_phrase_mezzo-forte_arco-glissando.mp3",
  "B4" : "music/all-samples/violin/violin_B4_phrase_mezzo-forte_arco-glissando.mp3",
  "D4" : "music/all-samples/violin/violin_D4_phrase_mezzo-forte_arco-glissando.mp3",
  "D4p": "music/all-samples/violin/violin_D4_phrase_mezzo-piano_arco-glissando.mp3",
  "D5" : "music/all-samples/violin/violin_D5_phrase_mezzo-forte_arco-glissando.mp3",
  "G3" : "music/all-samples/violin/violin_G3_phrase_mezzo-forte_arco-glissando.mp3",
  "G4" : "music/all-samples/violin/violin_G4_phrase_mezzo-forte_arco-glissando.mp3",
  "G4p": "music/all-samples/violin/violin_G4_phrase_mezzo-piano_arco-glissando.mp3",
};

const glissPlayers = new Tone.Players(glissFiles, () => {
  console.log("🎻 gliss samples ready");
}).toDestination();                // 也可接 Reverb

function fallIntensity(curr, prev){
  // 1️⃣ 取肩 + 髋 4 点平均 y
  const core = [11,12,23,24];
  const avgY = p => core.reduce((s,i)=>s + p.keypoints[i].y,0) / core.length;

  const dy   = avgY(curr) - avgY(prev);          // ↓ 为正
  if (dy <= 0) return 0;                         // 只关心下坠

  // 2️⃣ 取当前 torso 长作为“比例尺”
  const lS = curr.keypoints[11], rS = curr.keypoints[12];
  const neckY   = (lS.y + rS.y) / 2;
  const torso   = Math.abs(neckY - curr.keypoints[24].y); // neck-to-rightHip
  if (torso < 1) return 0;

  // 3️⃣ 相对强度：占躯干百分比
  return dy / torso;        // 0.0 ~ >1.0
}

const FALL_TH_ON  = 0.25;   // 25% 躯干 → 触发
const FALL_TH_OFF = 0.15;   // 回到 15% 以下 → 释放

let falling = false;

function detectFallingRelative(curr){
  const past = poseHistory.find(p => millis() - p.t >= 250);
  if(!past) return;

  const intens = fallIntensity(curr, past.pose);
  if(!falling && intens >= FALL_TH_ON){
      falling = true;
      playFallingGliss(intens);
  }else if(falling && intens < FALL_TH_OFF){
      falling = false;
  }
  
}

function playFallingGliss(intens){
  // 1) 根据强度选一个组 – 低空用低音，剧烈用高音
  let key;
  if (intens < 0.35)               key = random(["G3","G4p"]);      // 比较温和
  else if (intens < 0.55)          key = random(["D4","D4p"]);
  else if (intens < 0.75)          key = random(["B4","D5"]);
  else                             key = random(["As5","G4"]);      // 最激烈

  const player = glissPlayers.player(key);

  // 2) 播放速率 0.5 – 1.2（区分更明显）
  player.playbackRate = mapRange(intens, 0.25, 1.0, 0.5, 1.4);

  // 3) ±30 cent 微雕色彩
  violinShift.pitch   = random(-0.5, 0.5);

  /* ── ③ 音量：intens 0.25 → –14 dB，1.0 → –6 dB ─ */
  const dB = mapRange(intens, 0.25, 1.0, -14, -6);
  player.volume.value = dB;

  player.start("+0");
  console.log("Fall-Gliss", { key, intens:intens.toFixed(2), rate:player.playbackRate.toFixed(2) });
}


/* ————————————————————
 * AUDIO LAYER 3 – Piano Hit & Cage Random FX
 * ———————————————————— */
let pianoPlayers=[],lastPianoIdx=-1;
function initLayer3(){
  const gShift=new Tone.PitchShift().toDestination();
  const pianoURLs=[
    "music/async/piano-hit-2.wav",
    "music/async/piano-lowhigh-hit.wav",
    "music/async/piano_string_hit_reverb.wav"
  ];
  pianoPlayers=pianoURLs.map(u=>{
    const p=new Tone.Player(u).connect(gShift);
    p.volume.value=-30;return p;
  });
  window.playMetalSoundRandomly=function(){
    const now=millis();
    if(now-lastPianoTrig<COOLDOWN_TIME) return;   // 冷却
    let i; do{ i=Math.floor(Math.random()*pianoPlayers.length);}while(i===lastPianoIdx);
    lastPianoIdx=i;
    gShift.pitch=random(-3,3);
    pianoPlayers[i].playbackRate=random(0.8,1.2);
    pianoPlayers[i].start();
    lastPianoTrig=now;
  };
}

const cageURLs=[
  "music/async/tibetan-bowl_center-hit.wav",
  "music/async/zymbel.mp3"
];
const afterCageFX=new Tone.Gain(0).toDestination();
const cageHPF=new Tone.Filter(120,"highpass");
const cageVerb=new Tone.Reverb({decay:12,wet:0.8});
const cagePan=new Tone.AutoPanner({frequency:0.03}).start();
cageHPF.chain(cageVerb,cagePan,afterCageFX);

function startCageLoop(){
  afterCageFX.gain.setValueAtTime(0,Tone.now());
  afterCageFX.gain.linearRampTo(0.6,5);
  playCageOnce();
}

function playCageOnce(){
  const url=random(cageURLs);
  const p=new Tone.Player({url,autostart:true});
  console.log("Cage-FX", { url });

  p.volume.value=-12;
  p.connect(cageHPF);
  setTimeout(playCageOnce,random(35000,45000));
}



/* ————————————————————
 * POSE + MOTION HANDLERS
 * ———————————————————— */
function gotPoses(results){
  poses=results;if(!isPlaying||!results.length) return;
  const now=millis(),pose=results[0];
  poseHistory.push({pose,t:now});
  latestPose = pose;
  poseHistory=poseHistory.filter(p=>now-p.t<=1000);

  if(now-prevTime>=500){   // falling check
    const prev=poseHistory.find(p=>now-p.t>=950);
    if(prev) detectFallingRelative(pose)
    prevTime=now;
  }

  const wrist=pose.keypoints.find(k=>k.name==='left_wrist');
  if(wrist&&lastLeftWrist){
    const accel=dist(0,0,wrist.x-lastLeftWrist.x,wrist.y-lastLeftWrist.y);
    if(accel>ACCEL_THRESHOLD) playMetalSoundRandomly();
  }
  lastLeftWrist=wrist;

  detectShakeHead(pose);
  detectContraction(pose);
  
}

/* ——— Shake Head ——— */
function detectShakeHead(pose){
  const kp=pose.keypoints;
  const nose=kp.find(k=>k.name==="nose");
  const lS  =kp.find(k=>k.name==="left_shoulder");
  const rS  =kp.find(k=>k.name==="right_shoulder");
  
  if(!(nose&&lS&&rS&&nose.score>0.4)) return;
  const neck={x:(lS.x+rS.x)/2,y:(lS.y+rS.y)/2};
  const theta=Math.atan2(nose.y-neck.y,nose.x-neck.x);
  const now=performance.now();

  if(prevTheta!==null&&prevTime!==null){
    const dt=(now-prevTime)/1000;
    const wDeg=(theta-prevTheta)/dt*180/Math.PI;
    if(!shaking&&Math.abs(wDeg)>SHAKE_THRESHOLD){
      shaking=true;
      onShakeHead(Math.abs(wDeg));
      console.log("Shake Head DETECTED!",wDeg.toFixed(1));
    }else if(shaking&&Math.abs(wDeg)<RELEASE_THRESHOLD){shaking=false;}
  }
  prevTheta=theta;prevTime=now;
}

/* ——— Contract Detection (shoulder-torso ratio + headLow) ——— */

/* 2️⃣ 冷却时间 & 触发门槛 —— 回到旧设定 */
const CONTRACT_COOLDOWN = 400;     // 0.4 s

function detectContraction(pose){
  if(baseRatio===null) return;
  const lS=kp("left_shoulder"),rS=kp("right_shoulder");
  const nose=kp("nose");
  if(!(lS&&rS&&nose)) return;
  const neck={x:(lS.x+rS.x)/2,y:(lS.y+rS.y)/2};
  const midHip=kp("right_hip");
  if(!midHip) return;

  const shoulder=Math.abs(lS.x-rS.x);
  const torso=Math.abs(neck.y-midHip.y); if(torso<1) return;
  const currRatio=shoulder/torso;
  const intensity=Math.max(0,Math.min((baseRatio-currRatio)/0.4,1));
  const headLow=(nose.y-neck.y)/torso >= HEAD_DROP_RATIO;
  const now=millis();
  
  // if(intensity>=CONTRACT_ON&&headLow&&now-lastContractTime>COOLDOWN_TIME){
    if(intensity>=CONTRACT_ON&&now-lastContractTime>CONTRACT_COOLDOWN){
    onContractionStart(intensity);
    lastContractTime=now;
  }
}


/* ─── 标定肩宽 ─── */
/* ─── 标定肩宽比例 ─── */

function calibrate(){
  let sum = 0, c = 0;
  const id = setInterval(()=>{
    if(latestPose){
      const lS = kp("left_shoulder"), rS = kp("right_shoulder");
      const neck = kp("left_shoulder");            // 用左肩 y 当 neck
      const midHip = kp("right_hip");              // 用右髋 y 当 midHip
      if(lS && rS && neck && midHip){
        const shoulder = Math.abs(lS.x - rS.x);
        const torsoLen = Math.abs(neck.y - midHip.y);
        if(torsoLen > 1){
          sum += shoulder / torsoLen;
          c++;
        }
      }
    }
    if(c >= 30){               // 采 30 帧
      baseRatio = sum / c;
      console.log("✅ shoulder/torso 基准 =", baseRatio.toFixed(3));
      clearInterval(id);
    }
  }, 33);
}

  /* ─── 每 2 秒打印当前角速度 & 收缩强度 ─── */
setInterval(()=>{
  // 角速度（若上一帧已算出 wDeg，可存在全局；否则读取 shaking state）
  const info = {};

  if(prevTheta!==null && prevTime!==null && latestPose){
    const nose = kp("nose"), l=kp("left_shoulder"), r=kp("right_shoulder");
    if(nose&&l&&r){
      const neck = {x:(l.x+r.x)/2, y:(l.y+r.y)/2};
      const theta = Math.atan2(nose.y-neck.y,nose.x-neck.x);
      const dt = (performance.now()-prevTime)/1000;
      const wDeg = Math.abs((theta-prevTheta)/dt*180/Math.PI);
      info.wDeg = wDeg.toFixed(0);
    }
  }

  if(baseRatio !== null){
    const l=kp("left_shoulder"), r=kp("right_shoulder"),
          neck=kp("left_shoulder"), hip=kp("right_hip");
    if(l&&r&&neck&&hip){
      const ratio = Math.abs(l.x-r.x) / Math.abs(neck.y-hip.y);
      const inten = Math.max(0, Math.min((baseRatio - ratio)/0.4, 1));
      info.contraction = (inten*100).toFixed(0)+'%';
    }
  }
  

  console.log('[DEBUG]', info);
}, 2000);


/* ————————————————————
 * PLAYBACK CONTROL & UI
 * ———————————————————— */
async function startPlaying(){
  if(isPlaying) return;
  await Tone.start();await Tone.loaded();
  audioReady=true;Tone.Transport.start();isPlaying=true;
}
function stopPlaying(){if(isPlaying){Tone.Transport.stop();isPlaying=false;}}
function keyPressed(){ if(key==='2') startPlaying(); else if(key==='1') stopPlaying(); }



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
  calibrate();


}

function draw() {
  image(video, 0, 0, width, height);

  /* ── 1️⃣ 关键点可视化 ── */
  poses.forEach(p =>
    p.keypoints.forEach(k => {
      fill(0, 255, 0);
      noStroke();
      circle(k.x, k.y, 5);
    })
  );
}


/* ——— Helper ——— */
function kp(label){
  return latestPose.keypoints.find(k=>(k.name===label)||(k.part===label));
}
function random(a,b){
  if(Array.isArray(a))return a[Math.floor(Math.random()*a.length)];
                     return Math.random()*(b-a)+a;
}
function mapRange(v,i0,i1,o0,o1){
  return Math.min(o1,Math.max(o0,o0+(v-i0)/(i1-i0)*(o1-o0)));
}
function millis(){return performance.now();}


///////

function onShakeHead(wDeg){
  if(!audioReady) return;            // ← 新增
  const now = performance.now();
  if (now - lastTrig < TRIG_COOLDOWN) return;   // 还在冷却期
  lastTrig = now;

  /* 1️⃣ 随机选一个音 —— 避免连续同音 */
  let note;
  do{
      note = PONT_NOTES[Math.floor(Math.random()*PONT_NOTES.length)];
  }while(note === lastNote);     // lastNote 在外层作用域定义
  lastNote = note;
  console.log("🚩 shakehead violin note",note);


  /* 2️⃣ 按角速度映射音量 (0.6~1.0) */
  const vel = 0.6 + Math.min(Math.abs(wDeg)/180, 1)*0.4;

  /* 3️⃣ 随机弓速 & 声像 */
  pont.playbackRate = 0.95 + Math.random()*0.1;
  pan.pan.value     = (Math.random()*2-1)*0.3;

  pont.triggerAttackRelease(note, "8n", undefined, vel);
  console.log("Shake-Violin", { note, wDeg: wDeg.toFixed(1) });
}


function onContractionStart(intensity = 1){
  if(!audioReady) return;            // ← 新增

  hitBD.volume.value = -12 + 12 * intensity;        // -8 dB → 0 dB
  hitBD.playbackRate = 0.85 + Math.random()*0.3;   // 轻抖速率
  hitBD.start();
  console.log("Contract-BD", { intensity: (intensity*100).toFixed(0)+"%" });


  if(intensity > 0.8){
    cymPlayer.volume.value = -10;
    cymPlayer.start("+0.02");      // 安全：buffer 已经加载
    console.log("Contract-Cymbal", { intensity: (intensity*100).toFixed(0)+"%" });
  }
}
