// Tone.js sound setup

const reverb = new Tone.Reverb({ decay: 5, wet: 0.5 }).toDestination();
const delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.6, wet: 0.4 }).toDestination();

const globalPitchShift = new Tone.PitchShift(0).connect(reverb).connect(delay).toDestination();
// 创建metalPlayer专属PitchShift节点
const metalPitchShift = new Tone.PitchShift(0).connect(reverb).connect(delay).toDestination();

const ambientPlayer = new Tone.Player({
  url: "music/async/ambient_experimental.wav",
  loop: true,
  volume: -8
}).connect(reverb).connect(delay).toDestination();

// 修改metalPlayer的定义，将metalPlayer连接到metalPitchShift节点
const metalPlayer = new Tone.Player("music/async/metal-bowl-hit.wav")
  .connect(metalPitchShift);
  metalPlayer.volume.value = -10;  // 🔊 设置 metal 声音的音量


// 创建多个piano声音的数组
const pianoSounds = [
  "music/async/piano-hit-2.wav",
  "music/async/piano-lowhigh-hit.wav",
  "music/async/piano_string_hit_reverb.wav"
];


const pianoSettings = {
  pitchRange: [-3, 3],      // 音高随机范围（半音）
  rateRange: [0.8, 1.2],    // 播放速度随机范围
  intervalRange: [3000, 6000] // 随机触发间隔 (3～6秒)
};

const pianoPlayers = pianoSounds.map(url => {
  const player = new Tone.Player(url).connect(globalPitchShift);
  player.volume.value = -10; // 🔊 设置每个 piano 声音的音量
  return player;
});

// 用于记录上一次播放的index
let lastPianoIndex = -1;
let pianoTimeout;


// Playback state
let isPlaying = false;

// Thresholds
const MOVEMENT_THRESHOLD = 800;
const ACCELERATION_THRESHOLD = 80;



// Video and BodyPose
let video;
let bodyPose;
let poses = [];
let previousPose = null;
let lastRightWrist = null;

// 新增：储存历史数据用于1秒前后对比（约60帧）
let poseHistory = [];



// 设置声音触发间隔（4秒）
const MOVEMENT_SOUND_INTERVAL = 2000;
let lastMovementTriggeredTime = 0;
let lastCalculationTime = 0;    // 上一次计算动作强度的时间
const CALCULATION_INTERVAL = 500; // 每500毫秒（0.5秒）计算一次



function preload() {
  // Proper BlazePose initialization
  bodyPose = ml5.bodyPose('BlazePose');
  console.log("BlazePose model loaded");
}

function setup() {
  createCanvas(640, 480);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  // Start detecting poses with BlazePose
  bodyPose.detectStart(video, gotPoses);
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
      if (movement > MOVEMENT_THRESHOLD && !pianoTimeout) {
        playRandomPianoSound();
        console.log("Movement intensity:", movement);
        console.log("🎹 Piano triggered by movement intensity");
      }
    }
    lastCalculationTime = currentTime;
  }

  const currentRightWrist = currentPose.keypoints.find(k => k.name === 'right_wrist');
  if (currentRightWrist && lastRightWrist) {
    const acceleration = calculateAcceleration(currentRightWrist, lastRightWrist);
    if (acceleration > ACCELERATION_THRESHOLD && metalPlayer.state !== 'started') {
      playMetalSoundRandomly(); // 调用新定义的函数
      console.log("Current right wrist:", acceleration);
      console.log("🥁 Metal triggered by wrist acceleration");
    }
  }
  lastRightWrist = currentRightWrist;
}

// 仅计算关键点 11, 12, 13, 14, 15, 16, 23, 24 的变化
function calculateMovementIntensity(curr, prev) {
  if (!prev) return 0;

  // 指定关键点索引（BlazePose关键点索引标准）
  const selectedKeypointsIndices = [11, 12, 13, 14, 15, 16, 23, 24];

  let totalMovement = 0;

  selectedKeypointsIndices.forEach(i => {
    const currPoint = curr.keypoints[i];
    const prevPoint = prev.keypoints[i];

    const dx = currPoint.x - prevPoint.x;
    const dy = currPoint.y - prevPoint.y;

    totalMovement += dist(0, 0, dx, dy);
  });

  return totalMovement;
}


// Calculate acceleration of right wrist between frames
function calculateAcceleration(curr, prev) {
  if (!prev) return 0;
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  return dist(0, 0, dx, dy);
}




// Start audio playback
async function startPlaying() {
  if (isPlaying) return;
  isPlaying = true;
  await Tone.start();
  await Tone.loaded();
  ambientPlayer.start();
  console.log("🎵 Playback started");
}

function stopPlaying() {
  if (!isPlaying) return;
  isPlaying = false;
  ambientPlayer.stop();
  metalPlayer.stop();
  pianoPlayers.forEach(player => player.stop());
  
  if (pianoTimeout) clearTimeout(pianoTimeout); // 停止随机播放循环
  pianoTimeout = null;

  console.log("🛑 Playback stopped");
}

// Keyboard control
function keyPressed() {
  if (key === '2') {
    startPlaying();
  } else if (key === '1') {
    stopPlaying();
  }
}


// 随机播放piano声音的函数
function playRandomPianoSound() {
  let newIndex;
  do {
    newIndex = floor(random(pianoPlayers.length));
  } while (newIndex === lastPianoIndex);

  lastPianoIndex = newIndex;
  const player = pianoPlayers[newIndex];

  const pitch = random(pianoSettings.pitchRange[0], pianoSettings.pitchRange[1]);
  const playbackRate = random(pianoSettings.rateRange[0], pianoSettings.rateRange[1]);

  // 不再创建新的 PitchShift，直接修改全局PitchShift
  globalPitchShift.pitch = pitch;
  player.playbackRate = playbackRate;

  player.start();
  console.log(`🎹 Piano triggered [index ${newIndex}] pitch:${pitch.toFixed(2)}, rate:${playbackRate.toFixed(2)}`);
}



function playMetalSoundRandomly() {
  const pitch = random(-4, 4); // 自定义 pitch 范围
  const playbackRate = random(0.7, 1.3); // 自定义 rate 范围

  // 每次播放时直接修改metalPitchShift的pitch属性
  metalPitchShift.pitch = pitch;
  metalPlayer.playbackRate = playbackRate;

  metalPlayer.start();

  console.log(`🥁 Metal triggered pitch:${pitch.toFixed(2)}, rate:${playbackRate.toFixed(2)}`);
}
