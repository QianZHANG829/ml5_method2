// ─────────────────────────────────────────────
// 使用摄像头、计算 velocity 和 acceleration 特征进行动作分类预测
// ─────────────
// 视频宽高（默认值，即画布大小）
let vidWidth = 1920;
let vidHeight = 1080;

// 全局变量
let video;
let bodyPose;
let poses = [];       // 存储检测到的所有人的关键点
let connections;      // 用于绘制骨架连线的索引

// 显示预测结果
let poseLabelVelocity = "";
let poseLabelAcceleration = "";
let statusText = "Stopped";  // 当前状态文本（右上角显示）

// ml5.timeSeries 模型分类器
let classifierVelocity;
let classifierAcceleration;

// 模型文件信息（请根据实际情况修改文件路径）
let velocityModelDetails = {
  model: "model/Model_Velocity_test9/model.json",  
  metadata: "model/Model_Velocity_test9/model_meta.json",
  weights: "model/Model_Velocity_test9/model.weights.bin",
};

let accelerationModelDetails = {
  model: "model/Model_Acceleration_test9/model.json",  
  metadata: "model/Model_Acceleration_test9/model_meta.json",
  weights: "model/Model_Acceleration_test9/model.weights.bin",
};

// 用于连续预测的滑动窗口
let sequence = [];    // 每个元素为一帧的对象
let frameCount = 0;

// 参数设置
const FPS = 30;
const CAPTURE_FRAMES = 2 * FPS; // 2 秒
const dt = 1 / FPS;

// 检测状态（通过按 d 键启动/停止）
let detecting = false;

function preload() {
  // 加载 BlazePose 模型
  bodyPose = ml5.bodyPose("BlazePose", modelReady);
  
  // 初始化 ml5.timeSeries 模型
  let options = {
    task: "classification",
    dataMode: "spatial",
    debug: true,
  };
  classifierVelocity = ml5.timeSeries(options);
  classifierAcceleration = ml5.timeSeries(options);
}

function setup() {
  // 创建画布
  createCanvas(vidWidth, vidHeight);
  
  // 使用摄像头采集视频（不设定固定尺寸以保留摄像头原始比例）
  video = createCapture(VIDEO);
  video.hide(); // 隐藏默认的视频 DOM 元素
  
  // 当摄像头元数据加载完毕后，启动关键点检测
  video.elt.onloadedmetadata = () => {
    videoLoaded();
  };

  // 加载预训练模型
  classifierVelocity.load(velocityModelDetails, () => {
    console.log("Velocity model loaded.");
  }).catch(err => console.error("Velocity model loading error:", err));
  
  classifierAcceleration.load(accelerationModelDetails, () => {
    console.log("Acceleration model loaded.");
  }).catch(err => console.error("Acceleration model loading error:", err));
  
  console.log("Press 'd' to start detection.");
}

function videoLoaded() {
  // 使用摄像头视频流进行关键点检测
  bodyPose.detectStart(video, gotPoses);
  connections = bodyPose.getSkeleton();
}

function modelReady() {
  console.log("BlazePose 模型加载完毕！");
}

function draw() {
  // 以黑色填充整个背景（若视频尺寸不足时形成黑边）
  background(0);
  
  if (video) {
    // 使用摄像头原始视频尺寸，确保保持原始比例
    let originalWidth = video.elt.videoWidth || video.width;
    let originalHeight = video.elt.videoHeight || video.height;
    
    // 计算统一的缩放因子，使视频尽可能大地显示在画布内，同时保持比例
    let scaleFactor = min(vidWidth / originalWidth, vidHeight / originalHeight);
    let scaledWidth = originalWidth * scaleFactor;
    let scaledHeight = originalHeight * scaleFactor;
    
    // 计算偏移量，将视频居中显示，空余部分为黑色背景
    let xOffset = (vidWidth - scaledWidth) / 2;
    let yOffset = (vidHeight - scaledHeight) / 2;
    
    // 绘制视频（未进行拉伸）
    image(video, xOffset, yOffset, scaledWidth, scaledHeight);
    
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
  text(velocityModelDetails.model, 10, 10);
  text(accelerationModelDetails.model, 10, 40);

  // 在右上角显示当前状态
  textSize(24);
  fill(255);
  textAlign(RIGHT, TOP);
  text(statusText, width - 10, 10);

  // 在屏幕中央显示预测结果
  noStroke();
  textSize(40);
  textAlign(CENTER, CENTER);

  if (poseLabelVelocity.includes("Fast")) {
    fill(0, 255, 0); // 若预测标签为 "Fast"，则显示为绿色
  } else {
    fill(255, 0, 255); // 其他情况维持原有颜色
  }
  text(`Velocity: ${poseLabelVelocity}`, width / 4, height / 4);

  if (poseLabelAcceleration.includes("Sudden")) {
    fill(0, 255, 0); // 若预测标签为 "Sudden"，则显示为绿色
  } else {
    fill(255, 0, 255); // 其他情况维持原有颜色
  }
  text(`Acceleration: ${poseLabelAcceleration}`, width / 4, height / 4 + 50);
}

function gotPoses(results) {
  poses = results;
}

// ─────────────────────────────
// 计算速度特征（按帧计算）：
// 对连续帧计算速度：速度 = 两帧间欧氏距离 / dt
function computeJointVelocityFeatures(frames) {
  let numJoints = 33;
  let velocityFrames = [];
  for (let i = 0; i < frames.length - 1; i++) {
    let frameVel = {};
    for (let j = 0; j < numJoints; j++) {
      let keyX = "x" + j;
      let keyY = "y" + j;
      let v = 0;
      if (frames[i].hasOwnProperty(keyX) && frames[i+1].hasOwnProperty(keyX) &&
          frames[i].hasOwnProperty(keyY) && frames[i+1].hasOwnProperty(keyY)) {
        let dx = frames[i+1][keyX] - frames[i][keyX];
        let dy = frames[i+1][keyY] - frames[i][keyY];
        let dist = Math.sqrt(dx * dx + dy * dy);
        v = dist / dt;
      }
      frameVel["V" + j] = v;
    }
    velocityFrames.push(frameVel);
  }
  // 复制最后一帧以保持帧数一致
  if (velocityFrames.length > 0) {
    velocityFrames.push({ ...velocityFrames[velocityFrames.length - 1] });
  }
  return velocityFrames;
}

// ─────────────────────────────
// 计算加速度特征（按帧计算）：
// 先计算速度，再计算加速度：加速度 = (后帧速度 - 当前帧速度) / dt
function computeJointAccelerationFeatures(frames) {
  let velocityFrames = computeJointVelocityFeatures(frames);
  let numJoints = 33;
  let accelerationFrames = [];
  for (let i = 0; i < velocityFrames.length - 1; i++) {
    let frameAcc = {};
    for (let j = 0; j < numJoints; j++) {
      let key = "V" + j;
      let v_current = velocityFrames[i][key];
      let v_next = velocityFrames[i + 1][key];
      let a = Math.abs(v_next - v_current) / dt;
      frameAcc["Acc" + j] = a;
    }
    accelerationFrames.push(frameAcc);
  }
  // 保持帧数一致
  if (accelerationFrames.length > 0) {
    accelerationFrames.push({ ...accelerationFrames[accelerationFrames.length - 1] });
  }
  return accelerationFrames;
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
    
    // 每秒（大约每 30 帧）进行一次预测（确保采集满帧数据）
    if (frameCount % FPS === 0) {
      // 若帧数不足，则用最后一帧补全
      if (sequence.length < CAPTURE_FRAMES) {
        console.log("Not enough frames (" + sequence.length + "), filling up with last frame...");
        let lastFrame = sequence[sequence.length - 1];
        while (sequence.length < CAPTURE_FRAMES) {
          sequence.push(lastFrame);
        }
      }
      console.log("Predicting with raw sequence length: " + sequence.length);
      
      // 分别计算 velocity 和 acceleration 特征
      let velocitySeq = computeJointVelocityFeatures(sequence);
      let accelerationSeq = computeJointAccelerationFeatures(sequence);
      
      // 分别调用两个模型进行预测
      classifierVelocity.predict(velocitySeq, gotResultsVelocity);
      classifierAcceleration.predict(accelerationSeq, gotResultsAcceleration);
    }
  }
  setTimeout(predictPose, 1000 / FPS);
}

function gotResultsVelocity(results) {
  if (!results || results.length === 0) return;

  const { label: rawLabel, value } = results[0];
  const confidence = value !== undefined ? value : 0;
  let displayConfidence;

  if (rawLabel === "label") {
    if (confidence > 0.5) {
      poseLabelVelocity = "Slow";
      displayConfidence = confidence;
    } else {
      poseLabelVelocity = "Fast";
      displayConfidence = 1 - confidence;
    }
  } else {
    poseLabelVelocity = rawLabel.toUpperCase();
    displayConfidence = confidence;
  }

  // 更新全局显示变量（带 confidence 的字符串）
  poseLabelVelocity = `${poseLabelVelocity} (${displayConfidence.toFixed(2)})`;

  // 发送 velocity 数据到服务器
  socket.emit("midiData", {
    type: "velocity",
    label: poseLabelVelocity,
    displayConfidence: displayConfidence
  });
}

function gotResultsAcceleration(results) {
  if (!results || results.length === 0) return;

  const { label: rawLabel, value } = results[0];
  const confidence = value !== undefined ? value : 0;
  let displayConfidence;

  if (rawLabel === "label") {
    if (confidence > 0.5) {
      poseLabelAcceleration = "Sustained";
      displayConfidence = confidence;
    } else {
      poseLabelAcceleration = "Sudden";
      displayConfidence = 1 - confidence;
    }
  } else {
    poseLabelAcceleration = rawLabel.toUpperCase();
    displayConfidence = confidence;
  }

  poseLabelAcceleration = `${poseLabelAcceleration} (${displayConfidence.toFixed(2)})`;

  // // 发送 acceleration 数据到服务器
  // socket.emit("midiData", {
  //   type: "acceleration",
  //   label: poseLabelAcceleration,
  //   displayConfidence: displayConfidence
  // });
}


// ─────────────────────────────
// 按 d 键切换检测状态：启动或停止连续预测
function keyPressed() {
  if (key === 'd' || key === 'D') {
    if (!detecting) {
      startDetection();
      statusText = "Detecting";
    } else {
      detecting = false;
      statusText = "Stopped";
      console.log("Detection stopped.");
    }
  }
}

function startDetection() {
  console.log("Detection will start in 2 seconds...");
  // 延时 2 秒后启动检测
  setTimeout(() => {
    console.log("Detection started in continuous sliding window mode");
    poseLabelVelocity = "";
    poseLabelAcceleration = "";
    sequence = [];
    frameCount = 0;
    detecting = true;
    predictPose();
  }, 2000);
}
