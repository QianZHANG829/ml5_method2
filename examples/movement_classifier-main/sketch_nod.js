/**
 * Shake-Head + Inner-Struggle Sound
 * — p5.js + ml5.bodyPose(BlazePose) + Tone.js
 * Qian 2025-04-22
 */

let video, bodyPose, latestPose;
let prevTheta = null, prevTime = null;
const SHAKE_THRESHOLD   = 500;   // 上阈值（deg/s）
const RELEASE_THRESHOLD = 400;   // 下阈值
const CONTRACT_ON=0.30;
const CONTRACT_OFF=0.15;	
const HEAD_DROP_RATIO = 0.08;   // 低头阈值 ≈ 躯干长度 8%



let shaking = false;
let lastNote = null;


let baseShoulder = null;      // 进入后自动标定
let contracting=false;

let audioReady = false;          // ← 新增，全局



// ─────────── Tone.js 初始化 ────────────
/* ───────── Tone.js ───────── */
const pan = new Tone.Panner().toDestination();      // 立体声位置
const verb = new Tone.Reverb({decay:1.2, wet:0.3}).toDestination();
const cymPlayer = new Tone.Player(
  "music/all-samples/percussion/suspended-cymbal/suspended-cymbal__1_forte_scraped.mp3"
).connect(verb);     // ※ 只建一次

const pont = new Tone.Sampler({ 
  urls:{
    G3:"music/all-samples/violin/violin_G3_1_piano_arco-sul-ponticello.mp3",
    D4:"music/all-samples/violin/violin_D4_1_piano_arco-sul-ponticello.mp3",
    F4:"music/all-samples/violin/violin_F4_1_piano_arco-sul-ponticello.mp3",
    G4:"music/all-samples/violin/violin_G4_1_piano_arco-sul-ponticello.mp3",
    E4:"music/all-samples/violin/violin_E4_1_piano_arco-sul-ponticello.mp3",
    C5:"music/all-samples/violin/violin_C5_1_piano_arco-sul-ponticello.mp3",
  },
  
  release:2 }).connect(pan);

  
  const PONT_NOTES = ["G3","D4","F4","G4","E4","C5"];
  
// ⚡ 加在脚本顶部采样区
const hitBD = new Tone.Player(
  "music/all-samples/percussion/bass-drum/bass-drum__1_fortissimo_struck-singly.mp3"
  
).connect(verb);



  // ─────────── Sad-Pad 单音循环 ────────────
  function startSadPad(){
    let last = null;
    Tone.Transport.scheduleRepeat(time=>{
      let note;
      do{ note = PONT_NOTES[Math.floor(Math.random()*PONT_NOTES.length)]; }
      while(note === last);
      last = note;
  
      const vel  = 0.6 + Math.random()*0.4;   // 0.6–1.0
      pont.playbackRate = 0.95 + Math.random()*0.1;
      pan.pan.value     = (Math.random()*2-1)*0.3;
  
      pont.triggerAttackRelease(note, "2n", time, vel);
    }, "1m");
    Tone.Transport.start();
  }
  
  // ─────────── 摇头尖音 ────────────
  // 随机音集合（确保都已在 Sampler.urls 里）

    // 冷却：两次触发至少相隔 300 ms
    let lastTrig = 0;
    const TRIG_COOLDOWN = 300;   // ms

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

      /* 2️⃣ 按角速度映射音量 (0.6~1.0) */
      const vel = 0.6 + Math.min(Math.abs(wDeg)/180, 1)*0.4;

      /* 3️⃣ 随机弓速 & 声像 */
      pont.playbackRate = 0.95 + Math.random()*0.1;
      pan.pan.value     = (Math.random()*2-1)*0.3;

      pont.triggerAttackRelease(note, "8n", undefined, vel);
    }


    function onContractionStart(intensity = 1){
      if(!audioReady) return;            // ← 新增

      hitBD.volume.value = -8 + 8 * intensity;        // -8 dB → 0 dB
      hitBD.playbackRate = 0.9 + Math.random()*0.2;   // 轻抖速率
      hitBD.start();
  

      if(intensity > 0.8){
        cymPlayer.volume.value = -10;
        cymPlayer.start("+0.02");      // 安全：buffer 已经加载
      }
    }
    
      


// ─────────────────── p5 初始化 ───────────────────
/* ────── p5 初始化 ────── */
function setup(){
    createCanvas(640, 480);
    video = createCapture(VIDEO);
    video.size(width,height);
    video.hide();
  
    const opt = {modelName:"BlazePose", runtime:"mediapipe", modelType:"full", enableSmoothing:true};
    bodyPose = ml5.bodyPose("BlazePose", opt, ()=>{
      console.log("🎉 BlazePose ready");
      bodyPose.detectStart(video, gotPoses);
    });
  
    // ⚠️ 不再在这里解锁音频；等待用户按键
    console.log("按键 2 开启音频并进入 Sad Pad …");
    calibrate();   // 自动标定肩宽
  
  }
  
  function keyPressed(){
    if (key === '2'){
      Tone.start().then(()=>{                     // 解锁 AudioContext
        Tone.loaded().then(()=>{                 // 等全部 Buffer OK
          console.log('✅ 全部采样已加载');
          audioReady = true;                     // 现在才允许发声
        });
      });
    }
  }
  
  
  
  
function draw(){
  image(video, 0, 0, width, height);
  drawKeypoints();
  detectShakeHead();
  detectContraction();

}

// ────── Pose 回调 ──────
function gotPoses(results){
  poses = results;
  if (results.length === 0) return;

  if(results.length){
    if(!latestPose) calibrate();   // 第一次拿到姿态时开始标定
    latestPose = results[0];
  }
}

// ────── 绿色关键点 ──────
function drawKeypoints(){
  if(!latestPose) return;
  fill(0,255,0); noStroke();
  latestPose.keypoints.forEach(k=>{
    if(k.score>0.3) circle(k.x,k.y,8);
  });
}

// ────── 摇头检测 ──────
function detectShakeHead(){
  if(!latestPose) return;
  const kp = latestPose.keypoints;
  const nose = kp.find(k=>k.name==="nose");
  const lSh  = kp.find(k=>k.name==="left_shoulder");
  const rSh  = kp.find(k=>k.name==="right_shoulder");
  if(!nose || nose.score<0.4 || !lSh || !rSh) return;

  const neck = {x:(lSh.x+rSh.x)/2, y:(lSh.y+rSh.y)/2};
  const theta = Math.atan2(nose.y-neck.y, nose.x-neck.x);

  const now = performance.now();
  if(prevTheta!==null && prevTime!==null){
    const dt   = (now-prevTime)/1000;
    const dAng = shortestAngleDiff(theta,prevTheta);
    const wDeg = dAng/dt*180/Math.PI;
    // console.log(`ω = ${wDeg.toFixed(1)}°/s`);

    if(!shaking && Math.abs(wDeg)>SHAKE_THRESHOLD){
      shaking = true;
      onShakeHead(wDeg);
      console.log("🚩 Shake Head DETECTED!", wDeg.toFixed(1));
    }else if(shaking && Math.abs(wDeg)<RELEASE_THRESHOLD){
      shaking = false;
      console.log("✅ Shake Head ended");
    }
  }
  prevTheta = theta;
  prevTime  = now;
}

function shortestAngleDiff(a2,a1){
  let d = a2-a1;
  if(d> Math.PI) d-=2*Math.PI;
  if(d<-Math.PI) d+=2*Math.PI;
  return d;
}


/* ─── 含胸 ─── */
/* ─── 含胸检测 ─── */
let lastContractTime = 0;          // 冷却计时
const CONTRACT_COOLDOWN = 400;     // ms

function detectContraction(){
  if(!latestPose || baseRatio === null) return;

  const lS = kp("left_shoulder"), rS = kp("right_shoulder");
  const neck = kp("left_shoulder");
  const midHip = kp("right_hip");
  const nose =kp("nose");
  if(!lS || !rS || !neck || !midHip) return;

  const shoulder   = Math.abs(lS.x - rS.x);
  const torsoLen   = Math.abs(neck.y - midHip.y);

  if(torsoLen < 1) return;

  const currRatio  = shoulder / torsoLen;          // 0.0 ~ 1.0
  const intensity  = Math.max(0, Math.min((baseRatio - currRatio) / 0.4, 1));

  const headDrop = (nose.y - neck.y) / torsoLen;   // 正值 = 向下
  const headLow  = headDrop >= HEAD_DROP_RATIO;


  // —— 冷却触发逻辑 ——
  const now = performance.now();
  if(intensity >= CONTRACT_ON && headLow &&
    now - lastContractTime > CONTRACT_COOLDOWN){

      onContractionStart(intensity);
      lastContractTime = now;
      console.log("👹 Contract DETECTED!", intensity.toFixed(2));
  }

  // HUD
  fill(255,0,0); 
  noStroke();
  textSize(50);
  text(`Con: ${(intensity*100).toFixed(0)}%`, 10, 50);
}

  /* ─── 工具 ─── */
  /* ─── 工具函数：返回关键点对象 ─── */
  function kp(label){
    return latestPose.keypoints.find(k=>{
      return (k.name && k.name===label) || (k.part && k.part===label);
    });
  }


/* ─── 标定肩宽 ─── */
/* ─── 标定肩宽比例 ─── */
let baseRatio = null;   // (shoulderDist / torsoLen) 基准

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
