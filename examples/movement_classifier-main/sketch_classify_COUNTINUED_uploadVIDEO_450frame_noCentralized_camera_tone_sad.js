// ─────────────────────────────────────────────
// 使用上传视频、计算 velocity 和 acceleration 特征进行动作分类预测
// ─────────────

// 视频宽高（默认值）
let vidWidth = 1920;
let vidHeight = 1080;

// 全局变量
let video;
let bodyPose;
let poses = [];       // 存储检测到的所有人的关键点
let connections;      // 用于绘制骨架连线的索引

// 显示预测结果
// let poseLabelVelocity = "";
// let poseLabelAcceleration = "";
let poseLabelEmotion = "";
let statusText = "Stopped";  // 当前状态文本（右上角显示）
let confidence;

// ml5.timeSeries 模型分类器
// let classifierVelocity;
// let classifierAcceleration;
let classifierEmotion;


// tone.js 音乐播放器
let currentPlayer = null;  // 当前播放的音乐对象

// 模型文件信息（请根据实际情况修改文件路径）
let emotionModelDetails = {
  model: "model/Model_Emotion_test10.1/model.json",
  metadata: "model/Model_Emotion_test10.1/model_meta.json",
  weights: "model/Model_Emotion_test10.1/model.weights.bin",
};

// 定义不同情感对应的多个音乐文件
const musicMapping = {
  "Conflict & Tension": [
    "Music/Conflict/conflict_black-box-cyberpunk-9296.mp3",
    "Music/Conflict/conflict_black-box-mutation-128364.mp3",
    "Music/Conflict/conflict_halloween-bgmghostdark-amp-gothic-piano-247732.mp3",
    "Music/Conflict/conflict_waltz-in-a-minor-251169.mp3"

  ],
  "Freedom & Liberation": [
    "Music/Freedom/freedom_classical-piano-by-beethoven-moonlight-sonata-no14.mp3",
    "Music/Freedom/freedom_classical-piano-by-chopin-prelude.mp3",
    "Music/Freedom/freedom_worm.mp3",
    "Music/Freedom/freedom_classical-piano-by-schumann-restless-dreams.mp3"
  ],

  "Sad & Inner Struggle": [
    "Music/Sadness/sad_moonlit-night-relaxing-piano.mp3",
    "Music/Sadness/sad_catastrophe.mp3",
    "Music/Sadness/sad_classical-piano-by-chopin-ballade.mp3",
    "Music/Sadness/sad_trois-gymnopedie-gymnopedie.mp3"


  ]

};


// 用于连续预测的滑动窗口
let sequence = [];    // 每个元素为一帧的对象
let frameCount = 0;

// 参数设置
const FPS = 30;
const CAPTURE_FRAMES = 15 * FPS; // 15 秒的帧数
const dt = 1 / FPS;

// 检测状态（通过按 d 键启动/停止）
let detecting = false;

// 文件上传按钮
let fileInput;
let playButton, videoSlider;
let controlBar;         // 控制条容器

let usingCamera = true;
let switchButton;

// 新增全局变量：记录上一次情绪以及每种情绪已播放的曲目
let lastEmotion = "";
let playedTracks = {
  "Conflict & Tension": [],
  "Freedom & Liberation": [],
  "Sad & Inner Struggle": []
};


let reverb, delay, globalPitchShift, metalPitchShift;
let ambientPlayer, metalPlayer, pianoPlayers;
let pianoSounds, pianoSettings;
let lastPianoIndex, pianoTimeout, isPlaying;

// 全局变量定义区域
let poseHistory = [];
let lastCalculationTime = 0;
let lastRightWrist = null;
let CALCULATION_INTERVAL = 500;  // 0.5秒计算一次
let MOVEMENT_THRESHOLD = 1100;
let ACCELERATION_THRESHOLD = 100;

let lastMetalTriggeredTime = 0;
const METAL_SOUND_INTERVAL = 500; // 至少0.5秒冷却


function preload() {
  // 加载 BlazePose 模型
  bodyPose = ml5.bodyPose("BlazePose", modelReady);

  // 初始化 ml5.timeSeries 模型
  let options = {
    task: "classification",
    dataMode: "spatial",
    debug: true,
  };
  classifierEmotion = ml5.timeSeries(options);
}

function setup() {
  // 创建画布
  createCanvas(vidWidth, vidHeight);

  // 创建文件上传按钮（仅接受视频文件）
  fileInput = createFileInput(handleFile);
  fileInput.position(10, (windowHeight - fileInput.elt.clientHeight) / 4);

  // 创建切换按钮
  switchButton = createButton("切换视频源");
  switchButton.position(10, 80);
  switchButton.mousePressed(toggleSource);

  // 通过 constraints 请求 1920×1080 的分辨率
  let constraints = {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  };
  video = createCapture(constraints, () => {
    console.log("Camera stream is ready!");
  });
  video.hide(); // 隐藏默认的视频 DOM 元素



  // 当摄像头元数据加载完毕后，启动关键点检测
  video.elt.onloadedmetadata = () => {
    videoLoaded();
  };


  // 创建空的控制条容器（后面会在 videoLoaded 中设置样式和位置）
  controlBar = createDiv();

  // 加载预训练模型
  classifierEmotion.load(emotionModelDetails, () => {
    console.log("Emotion model loaded.");
  }).catch(err => console.error("Emotion model loading error:", err));

  // 设置音频上下文
  setupSadInnerStruggleMusic();


  console.log("Press 'd' to start detection.");
}

function handleFile(file) {
  if (file.type === 'video') {
    // 用上传的视频数据创建 video 对象
    video = createVideo([file.data], videoLoaded);
    video.hide(); // 隐藏默认的视频 DOM 元素
  } else {
    console.log("请上传视频文件");
  }
}

function videoLoaded() {
  // // 根据视频原始宽高调整画布
  // resizeCanvas(video.width, video.height);

  video.loop();
  // 开始对上传的视频进行关键点检测
  bodyPose.detectStart(video, gotPoses);
  connections = bodyPose.getSkeleton();

  // 设置控制条容器样式与位置（视频下方）
  controlBar.size(vidWidth, 40);
  controlBar.style("background-color", "#ddd");
  controlBar.position(0, vidHeight + 150);
  controlBar.style("display", "flex");
  controlBar.style("align-items", "center");
  controlBar.style("padding", "0 10px");

  // 创建进度条（滑块），视频加载后获取 video.duration() 作为最大值
  videoSlider = createSlider(0, video.duration(), 0, 0.01);
  videoSlider.parent(controlBar);
  videoSlider.style("flex-grow", "1");

  // 当用户拖动滑块时，更新视频当前时间
  videoSlider.input(() => {
    let t = videoSlider.value();
    video.time(t);
  });

  // 创建播放/暂停按钮
  playButton = createButton("Play/Pause");
  playButton.parent(controlBar);
  playButton.style("margin-left", "10px");
  playButton.mousePressed(togglePlay);

}

function modelReady() {
  console.log("BlazePose 模型加载完毕！");
}

function draw() {
  // 填充黑色背景
  background(0);
  // 绘制视频图像
  if (video) {
    // 获取视频原始尺寸
    let originalWidth = video.elt.videoWidth;
    let originalHeight = video.elt.videoHeight;
    // 计算统一的缩放因子，使视频在保持比例的前提下尽可能填满画布
    let scaleFactor = min(vidWidth / originalWidth, vidHeight / originalHeight);
    let scaledWidth = originalWidth * scaleFactor;
    let scaledHeight = originalHeight * scaleFactor;
    // 计算偏移量，将视频居中显示
    let xOffset = (vidWidth - scaledWidth) / 2;
    let yOffset = (vidHeight - scaledHeight) / 2;

    // 绘制视频，不进行拉伸
    image(video, xOffset, yOffset, scaledWidth, scaledHeight);

    // 自动更新进度条，使其跟随视频播放
    if (video && videoSlider && video.time && video.duration) {
      videoSlider.value(video.time());
    }

    // 绘制检测到的关键点和骨架连线（按照相同的缩放比例与偏移量）
    for (let i = 0; i < poses.length; i++) {
      let pose = poses[i];

      // 绘制骨架连线
      for (let j = 0; j < connections.length; j++) {
        let pointA = pose.keypoints[connections[j][0]];
        let pointB = pose.keypoints[connections[j][1]];
        if (pointA.confidence > 0.1 && pointB.confidence > 0.1) {
          stroke(255, 0, 0);
          strokeWeight(2);
          line(pointA.x * scaleFactor + xOffset, pointA.y * scaleFactor + yOffset,
            pointB.x * scaleFactor + xOffset, pointB.y * scaleFactor + yOffset);
        }
      }

      // 绘制关键点
      for (let j = 0; j < pose.keypoints.length; j++) {
        let keypoint = pose.keypoints[j];
        if (keypoint.confidence < 0.3) {
          fill(0, 0, 255);  // 低置信度用蓝色
          noStroke();
          circle(keypoint.x * scaleFactor + xOffset, keypoint.y * scaleFactor + yOffset, 12);
        } else {
          fill(0, 255, 0);  // 高置信度用绿色
          noStroke();
          circle(keypoint.x * scaleFactor + xOffset, keypoint.y * scaleFactor + yOffset, 10);
        }
      }
    }
  }

  // 在左上角显示模型文件名
  fill(255, 0, 255);
  textSize(32);
  textAlign(LEFT, TOP);
  text(emotionModelDetails.model, 10, 10);


  // 在右上角显示当前状态
  textSize(24);
  fill(255);
  textAlign(RIGHT, TOP);
  text(statusText, width - 10, 10);

  // 在屏幕中央显示预测结果
  noStroke();
  textSize(40);
  textAlign(CENTER, CENTER);

  // 根据不同标签设定颜色
  if (poseLabelEmotion.includes("Freedom & Liberation")) {
    fill(0, 255, 0);
  } else if (poseLabelEmotion.includes("Conflict & Tension")) {
    fill(255, 0, 0);
  } else {
    fill(0, 0, 255);
  }
  // text(`Emotion: ${poseLabelEmotion} ${confidence}`, width / 4, height / 4);
  text("Emotion: " + poseLabelEmotion + confidence, width / 4, height / 4);

}


// if (poseLabelVelocity.includes("Fast")) {
//   fill(0, 255, 0); // 若预测标签为 "Sudden"，则显示为绿色
// } else {
//   fill(255, 0, 255); // 其他情况（如 Sustained）维持原有颜色
// }
// text(`Velocity: ${poseLabelVelocity}`, width / 4, height / 4);

// if (poseLabelAcceleration.includes("Sudden")) {
//   fill(0, 255, 0); // 若预测标签为 "Sudden"，则显示为绿色
// } else {
//   fill(255, 0, 255); // 其他情况（如 Sustained）维持原有颜色
// }
// text(`Acceleration: ${poseLabelAcceleration}`, width / 4, height / 4 + 50);


function gotPoses(results) {
  poses = results;
  if (!isPlaying || results.length === 0) return;

  const currentPose = results[0];
  const currentTime = millis();

  // 存储当前pose数据到历史数组中 (用于1秒内的对比)
  poseHistory.push({ pose: currentPose, timestamp: currentTime });
  poseHistory = poseHistory.filter(p => currentTime - p.timestamp <= 1000);

  // 控制计算动作剧烈程度的频率（每0.5秒执行一次）
  if (currentTime - lastCalculationTime >= CALCULATION_INTERVAL) {
    // 找到1秒前的pose数据
    let previousData = poseHistory.find(p => currentTime - p.timestamp >= 950);

    if (previousData) {
      // 计算动作剧烈程度 (指定关键点的变化)
      const movement = calculateMovementIntensity(currentPose, previousData.pose);

      // 当动作剧烈程度超过阈值时，触发钢琴声音（避免重复触发）
      if (movement > MOVEMENT_THRESHOLD && !pianoTimeout && poseLabelEmotion === "Sad & Inner Struggle") {
        playRandomPianoSound();
        console.log("🎹 Piano triggered by movement intensity:", movement);
      }
    }

    lastCalculationTime = currentTime;
  }

  // 计算右手腕加速度
  const currentRightWrist = currentPose.keypoints.find(k => k.name === 'right_wrist');
  if (currentRightWrist && lastRightWrist) {
    const acceleration = calculateAcceleration(currentRightWrist, lastRightWrist);

    // 当手腕加速度超过阈值时，触发金属声音 (避免重复触发)
    if (acceleration > ACCELERATION_THRESHOLD &&
        currentTime - lastMetalTriggeredTime > METAL_SOUND_INTERVAL &&
        poseLabelEmotion === "Sad & Inner Struggle") {
      
      playMetalSoundRandomly();
      lastMetalTriggeredTime = currentTime;

      console.log("🥁 Metal triggered by wrist acceleration:", acceleration);
    }
  }

  // 更新lastRightWrist为当前帧数据
  lastRightWrist = currentRightWrist;
}

// 计算关键点 11, 12, 13, 14, 15, 16, 23, 24 的变化量
function calculateMovementIntensity(curr, prev) {
  if (!prev) return 0;

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

// 计算手腕加速度变化
function calculateAcceleration(curr, prev) {
  if (!prev) return 0;
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  return dist(0, 0, dx, dy);
}





// ──────────────────────────
// Normalization for Perspective Invariance
// ──────────────────────────
// 归一化函数，将所有帧的坐标数据归一化到 [0, 1] 区间
function computeNormalizedFeatures(frames) {
  let normalizedFrames = [];

  // ALL Frames
  for (let i = 0; i < frames.length; i++) {
    let frameNorm = {};
    for (let j = 0; j < 33; j++) {
      let keyX = "x" + j;
      let keyY = "y" + j;
      // 按照 canvas 大小进行归一化（canvas 固定为 1920*1080）
      let normX = frames[i][keyX] / 1920;
      let normY = frames[i][keyY] / 1080;
      frameNorm[keyX] = normX;
      frameNorm[keyY] = normY;
    }
    normalizedFrames.push(frameNorm);
  }
  return normalizedFrames;
}



// ─────────────────────────────
// 持续预测：仅在 detecting 为 true 时采集数据并预测
function predictPose() {
  if (detecting && poses.length > 0) {
    let pose = poses[0];

    // 构造当前帧的关键点坐标对象（格式： "x0", "y0", ..., "x32", "y32"）
    let rawFrameObj = {};
    for (let i = 0; i < 33; i++) {
      rawFrameObj["x" + i] = pose.keypoints[i].x;
      rawFrameObj["y" + i] = pose.keypoints[i].y;
    }

    // 维护固定长度的滑动窗口
    if (sequence.length < CAPTURE_FRAMES) {
      sequence.push(rawFrameObj);
    } else {
      sequence.shift();
      sequence.push(rawFrameObj);
    }
    frameCount++;

    // 每秒（大约每 x 帧）进行一次预测（确保采集满 xx 帧）
    if (frameCount % (15 * FPS) === 0) {
      // firstly, collect 450 frame to predict emotion
      if (sequence.length >= CAPTURE_FRAMES) {
        console.log("Predicting with full sequence (" + sequence.length + " frames).");
        let normalizedSeq = computeNormalizedFeatures(sequence);
        classifierEmotion.classify(normalizedSeq, gotResultsEmotion);
      } else {
        console.log("Collecting data: " + sequence.length + " frames, waiting for " + CAPTURE_FRAMES + " frames to start prediction.");
      }
    }
  }
  setTimeout(predictPose, 1000 / FPS);
}


/**
 * 交叉混合函数
 * newPlayer 作为新曲目，在淡入的同时对当前正在播放的音乐（currentPlayer）进行淡出
 * fadeDuration 为交叉混合时间，单位为秒
 */
function crossfadePlayers(newPlayer, fadeDuration = 3) {
  let now = Tone.now();
  
  // 保存旧播放器引用
  let oldPlayer = currentPlayer;
  
  // 新播放器淡入：
  newPlayer.volume.cancelScheduledValues(now);
  newPlayer.volume.setValueAtTime(-60, now); // 初始设为 -60 dB
  newPlayer.start(now);
  newPlayer.volume.linearRampToValueAtTime(0, now + fadeDuration);

  // 如果有旧播放器，开始淡出：
  if (oldPlayer) {
    oldPlayer.volume.cancelScheduledValues(now);
    oldPlayer.volume.linearRampToValueAtTime(-60, now + fadeDuration);
    // 淡出结束后停止旧播放器
    setTimeout(() => {
      oldPlayer.stop();
    }, fadeDuration * 1000);
  }

  // 更新当前播放器引用为新播放器
  currentPlayer = newPlayer;
}



function gotResultsEmotion(results) {
  console.log("预测结果：", results);
  // if (!results || results.length === 0) return;
  poseLabelEmotion = results[0].label;
  confidence = "Confidence: " + nf(results[0].confidence, 0, 2);

  // 如果情绪与上次相同，则保持当前音乐不变
  if (poseLabelEmotion === lastEmotion) {
    console.log("情绪未变化，继续播放当前音乐");
    return;
  }

  // 识别到 Sad & Inner Struggle
  if (poseLabelEmotion === "Sad & Inner Struggle") {
    // 停止可能正在播放的其他音乐
    if (currentPlayer) {
      currentPlayer.stop();
      currentPlayer = null;
    }
    // 启动专用Tone.js音乐逻辑
    startSadInnerStruggleMusic();
  } else {
    // 如果从 Sad & Inner Struggle 切换到其他情绪，关闭Tone.js的音乐
    if (isPlaying) {
      stopSadInnerStruggleMusic();
    }

    // 检查该情绪对应的音乐列表是否存在
    // 其他情绪仍按原有音乐逻辑处理
    if (musicMapping[poseLabelEmotion]) {
      let tracks = musicMapping[poseLabelEmotion];
      let availableTracks = tracks.filter(track => playedTracks[poseLabelEmotion].indexOf(track) === -1);

      if (availableTracks.length === 0) {
        playedTracks[poseLabelEmotion] = [];
        availableTracks = tracks.slice();
      }

      let chosenTrack = availableTracks[Math.floor(Math.random() * availableTracks.length)];
      playedTracks[poseLabelEmotion].push(chosenTrack);

      let newPlayer = new Tone.Player(chosenTrack, () => {
        crossfadePlayers(newPlayer, 2);
        console.log("正在播放: " + chosenTrack);
      }).toDestination();

      lastEmotion = poseLabelEmotion;
    } else {
      console.log("没有找到对应情感的音乐");
    }
  }

  lastEmotion = poseLabelEmotion;

}




// ─────────────────────────────
// 按 d 键切换检测状态：启动或停止连续预测
function keyPressed() {
  if (key === 'd' || key === 'D') {
    Tone.start().then(() => {
      console.log("Audio Context started!");
      // 后续逻辑
      if (!detecting) {
        startDetection();
        statusText = "Detecting";
      } else {
        detecting = false;
        statusText = "Stopped";
        console.log("Detection stopped.");
      }
    });
  }  
}

function startDetection() {
  console.log("Detection will start in 2 seconds...");
  // 延时 1 秒后启动检测
  setTimeout(() => {
    console.log("Detection started in continuous sliding window mode");
    poseLabelEmotion = "";
    sequence = [];
    frameCount = 0;
    detecting = true;
    predictPose();
  }, 1000);
}

// 播放/暂停控制
function togglePlay() {
  if (video && video.elt) {
    if (!video.elt.paused) {
      video.pause();
    } else {
      video.play();
    }
  }
}

function toggleSource() {
  if (usingCamera) {
    // 停止摄像头，并使用文件上传视频（或其他视频源）
    video.remove();
    // 这里可以调用文件上传函数或者加载其他视频
    console.log("切换到文件视频源");
  } else {
    // 恢复摄像头视频源
    video = createCapture(VIDEO);
    video.hide();
    video.elt.onloadedmetadata = () => {
      videoLoaded();
    };
    console.log("切换到摄像头视频源");
  }
  usingCamera = !usingCamera;
}

/////////////////////
//// tone.js 音乐播放器
/////////////////////
function setupSadInnerStruggleMusic() {
  // Tone.js Effect setup
  reverb = new Tone.Reverb({ decay: 5, wet: 0.5 }).toDestination();
  delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.6, wet: 0.4 }).toDestination();

  globalPitchShift = new Tone.PitchShift(0).connect(reverb).connect(delay).toDestination();
  metalPitchShift = new Tone.PitchShift(0).connect(reverb).connect(delay).toDestination();

  ambientPlayer = new Tone.Player({
    url: "music/async/ambient_experimental.wav",
    loop: true,
    volume: -5
  }).connect(reverb).connect(delay).toDestination();

  metalPlayer = new Tone.Player("music/async/metal-bowl-hit.wav").connect(metalPitchShift);

  pianoSounds = [
    "music/async/piano-hit-2.wav",
    "music/async/piano-lowhigh-hit.wav",
    "music/async/piano_string_hit_reverb.wav"
  ];

  pianoSettings = {
    pitchRange: [-3, 3],
    rateRange: [0.8, 1.2],
    intervalRange: [3000, 6000]
  };

  pianoPlayers = pianoSounds.map(url => {
    const player = new Tone.Player(url).connect(globalPitchShift);
    return player;
  });

  lastPianoIndex = -1;
  pianoTimeout = null;
  isPlaying = false;

  MOVEMENT_THRESHOLD = 1100;
  ACCELERATION_THRESHOLD = 100;
}

async function startSadInnerStruggleMusic() {
  if (isPlaying) return;
  isPlaying = true;
  await Tone.start();
  await Tone.loaded();
  ambientPlayer.start();
  console.log("🎵 Sad & Inner Struggle music playback started.");
}

function stopSadInnerStruggleMusic() {
  if (!isPlaying) return;
  isPlaying = false;
  ambientPlayer.stop();
  metalPlayer.stop();
  pianoPlayers.forEach(player => player.stop());

  if (pianoTimeout) clearTimeout(pianoTimeout);
  pianoTimeout = null;

  console.log("🛑 Sad & Inner Struggle music playback stopped.");
}


function triggerMovementSounds(movement, acceleration) {
  if (poseLabelEmotion !== "Sad & Inner Struggle") return;

  if (movement > MOVEMENT_THRESHOLD && !pianoTimeout) {
    playRandomPianoSound();
    console.log("🎹 Piano triggered by movement intensity:", movement);
  }

  const currentTime = millis();
  if (acceleration > ACCELERATION_THRESHOLD && currentTime - lastMetalTriggeredTime > METAL_SOUND_INTERVAL) {
    playMetalSoundRandomly();
    lastMetalTriggeredTime = currentTime;
    console.log("🥁 Metal triggered by wrist acceleration:", acceleration);
  }
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