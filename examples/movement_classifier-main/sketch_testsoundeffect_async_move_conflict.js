// =====================
// 🎼 Conflict & Tension – Full Sketch (with 16-beat adaptive drum loop)
// =====================

// ——— 全局常量 ———
const MOVEMENT_THRESHOLD = 6;
const MAX_SPEED = 1200;
const SPEED_MIN = 0, SPEED_MAX = 800;
const INT_MIN = 1, INT_MAX = 0.25;

let video, bodyPose, poses = [], prevPose = null, prevTime = 0;
let isPlaying = false;
let drumsLive = false;
let currN = 0.3;

let drums = {}, drumPart;
let drumInterval = 0.5;
let drumVolume = -10;
let speedHistory = [];

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
    hard : new Tone.Player("music/all-samples/percussion/bass-drum/bass-drum__1_mezzo-piano_struck-singly.mp3")
              .chain(reverb, echo, Tone.Destination)
  };
  drums.hard.volume.value = drumVolume;

  let notes = Array(16).fill(0).map((_, i) => [i * drumInterval, "C1"]);
  drumPart = new Tone.Part((time, note) => {
    drums.hard.volume.value = drumVolume;
    drums.hard.start(time);

    console.log(`🥁 DRUM HIT @ ${time.toFixed(2)} | volume: ${drumVolume.toFixed(1)} dB`);


  }, notes).start(0);

  drumPart.loop = true;
  drumPart.loopEnd = `${16 * drumInterval}`;
  drumPart.mute = true;
}

// 🔔 Layer 3 – Sparse Chimes
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
    setTimeout(playChime, random(20000,30000));
  }
  setTimeout(()=>{
    afterFX.gain.linearRampTo(0.6,5);
    playChime();
  }, 30000);
}

// 🧠 Update Drum Pattern from Motion
function updateDrumPatternFromSpeed(speeds){
  const avgSpeed = speeds.reduce((a,b)=>a+b,0) / speeds.length;
  drumInterval = mapVal(avgSpeed, SPEED_MIN, SPEED_MAX, 1, 0.25);
  drumVolume   = mapVal(avgSpeed, SPEED_MIN, SPEED_MAX, -20, -2);

  drumPart.clear();
  let newNotes = Array(16).fill(0).map((_, i) => [i * drumInterval, "C1"]);
  newNotes.forEach(n => drumPart.add(n));
  drumPart.loopEnd = `${16 * drumInterval}`;

  const bpm = 60 / drumInterval;
  console.log(`🥁 UPDATE loop: ${bpm.toFixed(1)} BPM | interval=${drumInterval.toFixed(2)}s | volume=${drumVolume.toFixed(1)} dB`);
}

// 🧠 Motion – helpers
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

// 🔄 Pose callback
function gotPoses(res){
  poses = res;
  if(!isPlaying || !res.length) return;

  const curr = res[0];
  if(!prevPose){
    prevPose = curr; prevTime = millis();
    return;
  }

  const now = millis();
  const dt  = Math.max((now-prevTime)/1000, 0.001);
  const disp  = calculateMovementIntensity(curr, prevPose);
  const speed = disp/dt;
  currN = constrain((speed-MOVEMENT_THRESHOLD)/(MAX_SPEED-MOVEMENT_THRESHOLD),0,1);

  if(drumsLive){
    speedHistory.push(speed);
    if(speedHistory.length >= 16){
      updateDrumPatternFromSpeed(speedHistory);
      speedHistory = [];
    }
  } else if (speed > MOVEMENT_THRESHOLD) {
    drumsLive = true;
    drumPart.mute = false;
    speedHistory.push(speed);
  }

  if(frameCount % 10 === 0)
    console.log(`📉 Speed: ${speed.toFixed(1)} | n: ${currN.toFixed(2)}`);

  prevPose = curr; prevTime = now;
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

// 🖼️ p5 setup / draw
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
function int(x){return Math.floor(x);}
