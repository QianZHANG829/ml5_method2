// Tone.js Setup for "Sad Inner Struggle" (Layer 1 & Layer 2)
Tone.Transport.cancel(); // ⬅️ 清除旧的 Transport schedules，放在最顶部

const reverb = new Tone.Reverb({ decay: 6, wet: 0.5 }).toDestination();
const delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.5, wet: 0.3 }).toDestination();


// Layer 1: Enhanced Sad Ambient Background (Cello & Brown Noise)
Tone.Transport.cancel(); // ⬅️ 清除旧的 Transport schedules，放在最顶部

// Enhanced Sad Ambient Background (Cello with individual timelines)
const celloSampler = new Tone.Sampler({
  urls: {
    C3: "music/all-samples/cello/cello_C3_1_pianissimo_arco-normal.mp3",
    G2: "music/all-samples/cello/cello_G2_15_fortissimo_arco-normal.mp3",
    E3: "music/all-samples/cello/cello_E3_1_mezzo-piano_arco-minor-trill.mp3",
    "E3-1": "music/all-samples/cello/cello_E3_phrase_cresc-decresc_arco-normal.mp3",
    D3: "music/all-samples/cello/cello_D3_phrase_mezzo-forte_arco-legato.mp3",
    "A3":"music/all-samples/cello/cello_A3_phrase_cresc-decresc_arco-normal.mp3"
  },
  volume: -18
}).connect(reverb).connect(delay).toDestination();

const ambientPlayer = new Tone.Player({
  url: "music/async/ambient_experimental.wav",
  loop: true,
  autostart: true,
  volume: -18
}).connect(reverb).connect(delay).toDestination();


// Individual notes and phrase notes
const singleNotes = ["C3", "G2", "D3", "E3"];
const phraseNotes = ["A3", "E3-1"];

// Intervals
const singleNoteIntervals = [4, 6, 12, 18, 16,24];
const phraseNoteIntervals = [40,48,60,72];

function scheduleIndividualNote(note, intervals) {
  const randomInterval = intervals[Math.floor(Math.random() * intervals.length)];
  Tone.Transport.scheduleOnce((time) => {
    celloSampler.triggerAttack(note, time);
    scheduleIndividualNote(note, intervals);
    console.log(`🎵 Playing cello note: ${note}, interval: ${randomInterval}m`);
  }, `+${randomInterval}m`);
}

// Schedule single notes more frequently
singleNotes.forEach(note => scheduleIndividualNote(note, singleNoteIntervals));

// Schedule phrase notes less frequently
phraseNotes.forEach(note => scheduleIndividualNote(note, phraseNoteIntervals));



// Brown Noise Background (Sadness)
const noise = new Tone.Noise("brown").start();
const noiseFilter = new Tone.Filter(300, "lowpass");
const noiseReverb = new Tone.Reverb({ decay: 12, wet: 0.9 });
noise.chain(noiseFilter, noiseReverb, Tone.Destination);
noise.volume.value = -38;

Tone.Transport.scheduleRepeat((time) => {
  noiseFilter.frequency.linearRampTo(200 + Math.random() * 500, 10, time);
}, 12);


//layer 2

// Enhanced Sad Ambient Background with expanded violin sample pool & dynamic variation

// 🎻 1.  Violin Sampler — add more one‑shot samples (A3 / A4 / A5)
const violinReverb   = new Tone.Reverb({ decay: 8, wet: 0.7 }).toDestination();
const violinPitchMod = new Tone.PitchShift(0).connect(violinReverb).toDestination();

const violinSampler  = new Tone.Sampler({
  urls: {
    "G#7": "Music/all-samples/violin/violin_Gs5_long_forte_molto-vibrato.mp3",
    "E4" : "Music/all-samples/violin/violin_E4_1_piano_arco-normal.mp3",
    "G3" : "Music/all-samples/violin/violin_G3_1_mezzo-forte_molto-vibrato.mp3",
    "A3" : "Music/all-samples/violin/violin_A3_1_pianissimo_arco-normal.mp3",
    "A4" : "Music/all-samples/violin/violin_A4_1_fortissimo_arco-normal.mp3",
    "A5" : "Music/all-samples/violin/violin_A4_05_pianissimo_arco-normal.mp3" // same folder naming pattern
  },
  volume: -18
}).connect(violinPitchMod);

// 🎼 2.  Combinations — richer textures (single / dyad / triad / tremolo phrase)
const violinCombinations = [
  ["G3"], ["A3"], ["E4"],                              // 单音
  ["G3", "E4"], ["A3", "E4"], ["A4", "E4"],           // 二音
  ["G#7", "E4"], ["A4", "G3"],                        // 旋律 + 伴音
  ["G#7", "E4", "G3"], ["A4", "E4", "A3"],        // 三和弦
  ["G#7", "A4", "E4", "A3"]                           // 四音和声
];

// 🔧 3.  Utility: mapRange
const mapRange = (v,i0,i1,o0,o1)=>Math.min(o1,Math.max(o0,o0+((v-i0)/(i1-i0))*(o1-o0)));

function playFallingViolin(accel){
  if(!isFinite(accel)) {console.warn("accel NaN/undefined → skip"); return;}

  const idx   = Math.floor(mapRange(accel,0,300,0,violinCombinations.length-1));
  const combo = violinCombinations[idx];

  // --- PitchShift based on accel ---
  let pitchVal = mapRange(accel,0,300,-3,2);      // −3 ~ +2 半音
  if(!isFinite(pitchVal)) pitchVal = 0;
  violinPitchMod.pitch = pitchVal;

  // Trigger sampler (Sampler 本身没有 .player.playbackRate，若需速率感可用 pitchShift 或 envelope 调节)
  violinSampler.triggerAttackRelease(combo,"2n",Tone.now(),0.9);
  console.log(`🎻 Combo: ${combo.join(" · ")} | accel ${accel.toFixed(1)} | pitch ${pitchVal.toFixed(2)}`);
}

// 🏃‍♂️ 4.  Pose logic — compute torso‑center position + vertical acceleration
let video, bodyPose, poses=[], poseHistory=[];
let lastCenterY = null;   // normalized 0‑1 (0 top, 1 bottom)
let lastVelocity = 0;     // dy/s  (normalized per second)
const ACC_T = 1.0;        // ≥ 1.0 norm‑units/s²  ≈ 明显下坠
let lastTick = 0;

function preload(){ bodyPose = ml5.bodyPose('BlazePose'); }
function setup(){
  createCanvas(640,480); video=createCapture(VIDEO); video.size(640,480); video.hide();
  bodyPose.detectStart(video, gotPoses);
}
function draw(){ image(video,0,0,width,height); poses.forEach(p=>p.keypoints.forEach(k=>{fill(0,255,0);noStroke();circle(k.x,k.y,5);})); }

function gotPoses(r){
  poses=r; if(!isPlaying||!r.length) return;
  const pose=r[0]; const now=millis();

  // 1. 躯干中心 (两肩+两髋平均)
  const idx=[12,11,24,23];
  const centerY = idx.reduce((s,i)=>s+pose.keypoints[i].y,0)/idx.length / height; // 0‑1

  // 2. 速度 & 加速度
  if(lastCenterY!==null){
      const dt   = (now - lastTick) / 1000;      // sec
      if(dt>0){
        const vel = (centerY - lastCenterY)/dt;  // + 下移
        const acc = (vel - lastVelocity)/dt;     // + 加速下移
        if(acc > ACC_T && vel>0){
           playFallingViolin(acc*150);           // scale to 0‑300 for mapRange
        }
        lastVelocity = vel;
      }
  }
  lastCenterY = centerY;
  lastTick    = now;
}

// Playback Control
let isPlaying = false;

async function startPlaying() {
  if (isPlaying) return;
  isPlaying = true;
  await Tone.start();
  await Tone.loaded();
  Tone.Transport.start();
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
