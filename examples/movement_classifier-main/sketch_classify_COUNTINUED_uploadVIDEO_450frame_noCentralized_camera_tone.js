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

  // 检查该情绪对应的音乐列表是否存在
  if (musicMapping[poseLabelEmotion]) {
    let tracks = musicMapping[poseLabelEmotion];
    // 筛选出该情绪下尚未播放过的曲目
    let availableTracks = tracks.filter(track => playedTracks[poseLabelEmotion].indexOf(track) === -1);
    if (availableTracks.length === 0) {
      // 如果所有曲目都播放过，则重置记录
      playedTracks[poseLabelEmotion] = [];
      availableTracks = tracks.slice();
    }
    // 随机选取一首未播放的曲目
    let chosenTrack = availableTracks[Math.floor(Math.random() * availableTracks.length)];
    playedTracks[poseLabelEmotion].push(chosenTrack);

    // 创建新的 Tone.Player 播放新曲目
    // 注意：Tone.start() 应在用户首次交互时调用一次，此处确保音频上下文已解锁
    let newPlayer = new Tone.Player(chosenTrack, () => {
      // 跨曲目交叉混合：新曲子淡入，旧曲子同时淡出
      crossfadePlayers(newPlayer, 2); // 混合时间 2 秒
      console.log("正在播放: " + chosenTrack);
    }).toDestination();

    // 更新最后检测到的情绪
    lastEmotion = poseLabelEmotion;
  } else {
    console.log("没有找到对应情感的音乐");
  }

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

