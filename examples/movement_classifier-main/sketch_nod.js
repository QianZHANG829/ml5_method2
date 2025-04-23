/**
 * Shake-Head + Inner-Struggle Sound
 * — p5.js + ml5.bodyPose(BlazePose) + Tone.js
 * Qian 2025-04-22
 */

let video, bodyPose, latestPose;
let prevTheta = null, prevTime = null;
const SHAKE_THRESHOLD   = 500;   // 上阈值（deg/s）
const RELEASE_THRESHOLD = 400;   // 下阈值
const CONTRACT_ON=0.25;
const CONTRACT_OFF=0.15;	
let shaking = false;
let lastNote = null;


let baseShoulder = null;      // 进入后自动标定
let contracting=false;

// ─────────── Tone.js 初始化 ────────────
/* ───────── Tone.js ───────── */
const pan  = new Tone.Panner();      // 输出先给 pan


pan.toDestination();                 // 最终输出

const verb = new Tone.Reverb({decay:1.2, wet:0.3}).toDestination();


const pont = new Tone.Sampler({
    urls:{
      G3:"music/all-samples/violin/violin_G3_1_piano_arco-sul-ponticello.mp3",
      D4:"music/all-samples/violin/violin_D4_1_piano_arco-sul-ponticello.mp3",
      F4:"music/all-samples/violin/violin_F4_1_piano_arco-sul-ponticello.mp3",
      G4:"music/all-samples/violin/violin_G4_1_piano_arco-sul-ponticello.mp3",
      E4:"music/all-samples/violin/violin_E4_1_piano_arco-sul-ponticello.mp3",
      C5:"music/all-samples/violin/violin_C5_1_piano_arco-sul-ponticello.mp3",
    },
    release: 2,
  }).toDestination();
  
  pont.connect(pan);
  
  const PONT_NOTES = ["G3","D4","F4","G4","E4","C5"];
  
// ⚡ 加在脚本顶部采样区
const hitBD = new Tone.Player(
    "music/all-samples/percussion/bass-drum/bass-drum__1_fortissimo_struck-singly.mp3"
  ).toDestination();

  

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
        // intensity 取 0–1，可直接用肩宽收缩比例
        // 随强度映射音量 (−8 dB 到 0 dB)
        hitBD.volume.value = Tone.gainToDb(0.4 + 0.6*intensity);
      
        // 随机轻微变速，避免每次听起来完全一样
        hitBD.playbackRate = 0.95 + Math.random()*0.1;
      
        // 可选：加一点极短 Reverb 提升空间感
        const verb = new Tone.Reverb({decay:1.2, wet:0.3}).toDestination();
        hitBD.connect(verb);
        
        // 可选：在收缩幅度 > 0.8 时，再叠一个 clash cymbal：
        if(intensity > 0.8){
            const cym = new Tone.Player(
            "music/all-samples/percussion/clash cymbals/clash-cymbals__15_fortissimo_struck-together.mp3"
            ).toDestination();
            cym.volume.value = Tone.gainToDb(-10); // 控制别盖住低鼓
            cym.start("+0.02");  // 稍滞后混合
        }
  

        hitBD.start();
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
    if (key === '2'){                    // 按数字 2 才解锁音频
      Tone.start().then(()=>{            // ← 用 Tone.js 自带的解锁方法
        console.log('🔊 Tone.js AudioContext unlocked');
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
function detectContraction(){
    if(!latestPose||!baseShoulder) return;
    const l=kp("left_shoulder"),r=kp("right_shoulder");
    if(!l||!r) return;
    const delta= baseShoulder - Math.abs(l.x-r.x);
    const intensity = Math.max(0, Math.min(delta/(baseShoulder*0.4), 1));
  
    if(!contracting && intensity>CONTRACT_ON){
        contracting=true; 
        onContractionStart(intensity);
        console.log("👹 Contract DETECTED!", intensity.toFixed(1));

    }else if(contracting && intensity<CONTRACT_OFF){
        contracting=false;
    }
  
    /* 可选：在屏幕左上角实时显示强度 */
    fill(255,0,0); noStroke();
    text(`Contraction: ${(intensity*100).toFixed(0)}%`,10,20);
  }
  
  /* ─── 工具 ─── */
  /* ─── 工具函数：返回关键点对象 ─── */
  function kp(label){
    return latestPose.keypoints.find(k=>{
      return (k.name && k.name===label) || (k.part && k.part===label);
    });
  }


/* ─── 标定肩宽 ─── */
function calibrate(){
    let sum=0,c=0;
    const id=setInterval(()=>{
      if(latestPose){
        const l=kp("left_shoulder"), r=kp("right_shoulder");
        if(l&&r){ sum+=Math.abs(l.x-r.x); c++; }
      }
      if(c>=30){ baseShoulder=sum/c; clearInterval(id); }
    },33);
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

  if(baseShoulder){
    const l=kp("left_shoulder"), r=kp("right_shoulder");
    if(l&&r){
      const delta = baseShoulder - Math.abs(l.x-r.x);
      const intensity = Math.max(0, Math.min(delta/(baseShoulder*0.4),1));
      info.contraction = (intensity*100).toFixed(0)+'%';
    }
  }

  console.log('[DEBUG]', info);
}, 2000);
