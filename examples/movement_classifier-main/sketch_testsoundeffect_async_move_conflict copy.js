
// =====================
// 🎼 Conflict & Tension ‑ 3‑Layer Music System
// =====================

// === GLOBAL STATE ===
let video, bodyPose, poses = [], prevPose = null, prevTime = 0;
let isPlaying      = false;
let lastDrumTime   = 0;
let drumCooldown   = 400;           // ms (动态调整)
/* ---------- 全局计时与缓冲 ---------- */
const BEATS_PER_CYCLE = 8;      // 8 拍
const BEAT_UNIT       = "8n";   // 每拍 8 分音符
let cycleActive = false;
let beatIdx     = 0;
let currN       = 0.4;           // 当前循环强度 (0‑1)
let currGapMs   = 150;           // 当前循环敲击间隔 (备用；这里固定 8n)
let moveSum=0, accelSum=0, sampleCnt=0;  // 收集 8 拍内的动作统计
let loopId=null;                 // Transport 回调 id
let cycleStartSec=0;

// === THRESHOLDS & LIMITS ===
const MOVEMENT_THRESHOLD     = 6;   // moveIntensity 起触发
const ACCELERATION_THRESHOLD = 25;  // groupAcceleration 起调速
const MAX_MOVE   = 12;              // 练习时测得上界
const MAX_ACCEL  = 50;

///////////
const BPM           = 60;    // 全局速度，可自行改
Tone.Transport.bpm.value = BPM;

let beatIndex       = 0;      // 0‑15
let capturePhase    = true;   // true = 实时采集；false = 回放预测
let captureBuffer   = Array(16).fill(0);  // 存 0‑1 强度


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
    volume:-8
  }).chain(reverb, delay, Tone.Destination);
}

// =====================
// 🥁 LAYER 2 – Drum (single‑hit kits)
// =====================
let drums;
function initLayer2() {
  drums = {
    soft : new Tone.Player("music/all-samples/percussion/bass-drum/bass-drum__1_pianissimo_struck-singly.mp3").toDestination(),
    mid  : new Tone.Player("music/all-samples/percussion/bass-drum/bass-drum__1_mezzo-piano_struck-singly.mp3").toDestination(),
    hard : new Tone.Player("music/all-samples/percussion/bass-drum/bass-drum__1_fortissimo_struck-singly.mp3").toDestination()
  };
  Object.values(drums).forEach(p => p.volume.value = -20);
  // 16 分音符一拍；可改 "4n" 做四分音符

  Tone.Transport.scheduleRepeat((time) => {
    // ——确定当前强度——
    const n = capturePhase
              ? captureBuffer[beatIndex]         // 实时采到的
              : captureBuffer[beatIndex] || 0.3; // 回放时用上一循环值，缺失给 0.3

    if (n > 0) playDrumAtTime(n, time);          // 只有强度>0 才敲

    // ——步进拍号——
    beatIndex = (beatIndex + 1) % 8;

    // ——8 拍结束：切换阶段——
    if (beatIndex === 0){
      if (capturePhase){
        // 采完一轮：这里可以加预测算法；现用 *平滑* 做示例
        const avg = captureBuffer.reduce((a,b)=>a+b,0) / 8;
        captureBuffer = captureBuffer.map(()=>avg);     // 用平均值填充
      }
      capturePhase = !capturePhase;   // 交替
    }
  }, "8n");

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
  if (!prev || dt <= 0) return 0;

  // ——肩宽作为尺度——
  const ls = curr.keypoints[11], rs = curr.keypoints[12];
  const shoulder = (ls && rs && isFinite(ls.x) && isFinite(rs.x))
                     ? dist(ls.x, ls.y, rs.x, rs.y)
                     : 1;  // 防 0

  // ——平均速度（不再加权）——
  let sum = 0, cnt = 0;

  [11,12,15,16,23,24,27,28].forEach(i => {        // 8 个关键点
    const c = curr.keypoints[i];
    const p = prev.keypoints[i];
    if (!c || !p || !isFinite(c.x) || !isFinite(p.x)) return;   // 跳过缺失

    // 正确的 dist 调用：原点→位移向量
    const v = dist(0, 0, c.x - p.x, c.y - p.y) / dt;            // px/s
    sum += v;  cnt++;
  });

  if (cnt === 0) return 0;      // 全部丢失
  return (sum / cnt) / shoulder;
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

// ——— 调试开关（放在文件顶部也行）———
const DEBUG_LOG = true;   // 需要时改 false
function gotPoses(res){
  poses = res;
  if (!isPlaying || !res.length) return;

  const curr = res[0];
  if (!prevPose){    // 首帧只做缓存
    prevPose = curr;
    prevTime = millis();
    prevPose.prevX = curr.keypoints.map(k=>k.x);
    prevPose.prevY = curr.keypoints.map(k=>k.y);
    return;
  }

  /* === 计算 move & accel === */
  const now  = millis();
  const dt   = Math.max((now - prevTime)/1000, 0.001);   // 秒
  const move = calcMove (curr, prevPose, dt);
  const acc  = calcAccel(curr, prevPose, dt);

  /* ====== ① 首次超过阈值 → 开启 16 拍循环 ====== */
  if (!cycleActive && move > MOVEMENT_THRESHOLD){
    const nInit   = constrain((move - MOVEMENT_THRESHOLD)/(MAX_MOVE - MOVEMENT_THRESHOLD),0,1);
    startCycle(nInit, acc);
  }

  /* ====== ② 处于循环时收集统计 ====== */
  if (cycleActive){
    moveSum   += move;
    accelSum  += acc;
    sampleCnt += 1;
  }

  /* ====== 调试打印 ====== */
  if (DEBUG_LOG && frameCount % 5 === 0){
    console.log(`frame:${frameCount} beat:${beatIdx} move:${move.toFixed(2)} acc:${acc.toFixed(2)} n:${currN.toFixed(2)}`);
  }

  /* —— 更新上一帧缓存 —— */
  prevPose       = curr;
  prevTime       = now;
  prevPose.prevX = curr.keypoints.map(k=>k.x);
  prevPose.prevY = curr.keypoints.map(k=>k.y);
}

/* ---------- 启动一个 16 拍循环 ---------- */
function startCycle(nInitial, accel){
  currN        = nInitial;
  beatIdx      = 0;
  moveSum      = 0;
  accelSum     = 0;
  sampleCnt    = 0;
  cycleActive  = true;
  cycleStartSec= Tone.Transport.seconds;

  /* 若已存在旧循环调度，先清掉 */
  if (loopId) Tone.Transport.clear(loopId);

  /* 计算节拍间隔 (这里只示例用固定 16n；可用 accel 映射到更细 subdivision) */
  currGapMs = 150;   // 留作你未来要换成自定义 setTimeout 的话

  /* 每 16n 回调一次 */
  loopId = Tone.Transport.scheduleRepeat(beatCallback, BEAT_UNIT, "+0.01");

  console.log("▶️ new cycle, n=", nInitial.toFixed(2));
}

/* ---------- 每拍回调 ---------- */
function beatCallback(time){
  // 播鼓
  playDrumAtTime(currN, time);

  beatIdx++;

  if (beatIdx >= BEATS_PER_CYCLE){
    /* 16 拍结束：算平均，准备下一循环 */
    const avgMove  = moveSum   / Math.max(sampleCnt,1);
    const avgAccel = accelSum  / Math.max(sampleCnt,1);

    const nNext = constrain((avgMove - MOVEMENT_THRESHOLD)/(MAX_MOVE - MOVEMENT_THRESHOLD),0,1);
    // 这里如果要用 avgAccel 去决定 subdivision，可在此计算
    startCycle(nNext, avgAccel);   // 递归启新循环
  }
}

/* ---------- 播鼓（精确到 Transport 时间） ---------- */
function playDrumAtTime(intensity, t){
  const kit = intensity<0.33 ? "soft" : intensity<0.66 ? "mid" : "hard";
  drums[kit].volume.value = -20 + intensity*18;
  drums[kit].start(t);
}

// =====================
// 🎬 PLAY / STOP
// =====================
async function startPlaying(){
  if(isPlaying) return;
  isPlaying = true;
  await Tone.start(); await Tone.loaded();
  Tone.Transport.start("+0.1");

  ambientPlayer.start();                              // Layer 1
  console.log("🎵 Start");
  

  // 15 s 后淡入 Layer 3 (已在 initLayer3 设置)
}

function stopPlaying(){
  if(!isPlaying) return;
  isPlaying=false;
  ambientPlayer.stop();
  Object.values(drums).forEach(p=>p.stop());
  Tone.Transport.stop();
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

