// ─────────────────────────────────────────────
// 使用上传视频、计算 acceleration 特征进行动作分类预测
// ─────────────────────────────────────────────


// 全局变量
let video;
let bodyPose;
let poses = [];       // 存储检测到的所有人的关键点
let connections;      // 用于绘制骨架连线的索引
let poseLabel = "";   // 显示预测的动作标签
let statusText = "Stopped";  // 当前状态文本（右上角显示）

// ml5.timeSeries 模型
let classifier;
let modelDetails;

// 用于连续预测的滑动窗口
let sequence = [];    // 每个元素为一帧的对象
let frameCount = 0;

// 参数设置
const FPS = 30;
const CAPTURE_FRAMES = 5 * FPS; // 5 seconds, 150 frame
const dt = 1 / FPS;

// 检测状态（通过按 d 键启动/停止）
let detecting = false;

// 构造 classifier 输入名称数组，注意：训练时使用加速度特征，每帧 33 个特征，键为 "A0"～"A32"
let inputNames = [];
for (let i = 0; i < 33; i++) {
  inputNames.push(`Acc${i}`);
}

//set kalman filter

let kalmanFiltersX = [];
let kalmanFiltersY = [];


// 文件上传按钮
let fileInput;

function preload() {
  // 加载 BlazePose 模型
  bodyPose = ml5.bodyPose("BlazePose", modelReady); 
  
  // 初始化 ml5.timeSeries 模型（这里用于预测，已训练好的模型无需 inputs/outputs 定义）
  let options = {
    task: "classification",
    dataMode: "spatial",
    debug: true,
  };
  classifier = ml5.timeSeries(options);
}

function setup() {
  createCanvas(640, 480);

  // 创建文件上传按钮（仅接受视频文件）
  fileInput = createFileInput(handleFile);
  fileInput.position(10, (windowHeight - fileInput.elt.clientHeight) / 4);

  // 这里不创建实时摄像头 video，由上传的视频创建

  // set up Kalman filters
  for (let i = 0; i < 33; i++) {
    kalmanFiltersX.push(new KalmanFilter(0.05, 0.5 ));
    kalmanFiltersY.push(new KalmanFilter(0.05, 0.5 ));
  }


  // 加载预训练模型
  modelDetails = {
    // model: "model/Model_Acceleration_test6/model.json",  
    // metadata: "model/Model_Acceleration_test6/model_meta.json",
    // weights: "model/Model_Acceleration_test6/model.weights.bin",

    model: "model/Model_Acceleration_test7/model.json",  
    metadata: "model/Model_Acceleration_test7/model_meta.json",
    weights: "model/Model_Acceleration_test7/model.weights.bin",
  };
  classifier.load(modelDetails, modelLoaded);
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
  // 获取原始宽高
  const vidWidth = video.width;
  const vidHeight = video.height;
  // 创建与视频相同大小的画布
  resizeCanvas(vidWidth, vidHeight);

  video.loop();
  // 开始对上传的视频进行关键点检测
  bodyPose.detectStart(video, gotPoses);
  connections = bodyPose.getSkeleton();
}

function modelReady() {
  console.log("BlazePose 模型加载完毕！");
}

function modelLoaded() {
  console.log("Classifier 模型加载完毕！");
  // 如果需要，预设模型预测标签，例如：
  expectedLabels = ["A", "B"];
  // 启动预测循环（内部会根据 detecting 状态决定是否采集数据）
  predictPose();
}

// ─────────────────────────────────────────────
// draw() 中只负责画视频和 poses 数组中的关键点
// 如果 detecting=false，则骨骼跟随原始视频
// 如果 detecting=true，则骨骼已在 predictPose() 中被居中
// ─────────────────────────────────────────────

function draw() {
  // 绘制视频图像
  if (video) {
    image(video, 0, 0, width, height);
  }

  // 绘制检测到的关键点和骨架连线
  for (let i = 0; i < poses.length; i++) {
    let pose = poses[i];

    // 绘制骨架连线
    for (let j = 0; j < connections.length; j++) {
      let pointAIndex = connections[j][0];
      let pointBIndex = connections[j][1];
      let pointA = pose.keypoints[pointAIndex];
      let pointB = pose.keypoints[pointBIndex];

      if (pointA.confidence > 0.1 && pointB.confidence > 0.1) {
        stroke(255, 0, 0);
        strokeWeight(2);
        line(pointA.x, pointA.y, pointB.x, pointB.y);
      }
    }
    // 绘制关键点
    for (let j = 0; j < pose.keypoints.length; j++) {
      let keypoint = pose.keypoints[j];
      // if (keypoint.confidence > 0.1) {
      //   fill(0, 255, 0);
      //   noStroke();
      //   circle(keypoint.x, keypoint.y, 10);
      // }
      if (keypoint.confidence < 0.3) {
        // 低置信度：用红色标记，并可以画一个稍大的圆或其他形状
        fill(0, 0, 255); // 蓝色
        noStroke();
        // 例如，绘制一个直径 12 的圆，或者可以使用 ellipse 来绘制不同形状
        circle(keypoint.x, keypoint.y, 12);
      } else {
        // 高置信度：用绿色标记
        fill(0, 255, 0); // 绿色
        noStroke();
        circle(keypoint.x, keypoint.y, 10);
      }
    }
  }

  // 在屏幕中央显示预测结果
  fill(255, 0, 255);
  noStroke();
  textSize(52);
  textAlign(CENTER, CENTER);
  text(poseLabel, width / 2, height / 2);

  // 在左上角显示模型文件名
  textSize(32);
  textAlign(LEFT, TOP);
  text(modelDetails.model, 10, 10);

  // 在右上角显示当前状态
  textSize(24);
  fill(255);
  textAlign(RIGHT, TOP);
  text(statusText, width - 10, 10);
}

function gotPoses(results) {
  poses = results;
}

// ─────────────────────────────
// 计算加速度特征（按帧计算）：
// ----------------------------------------------------------------
// Input: frames array, where each element is an object with keys "x0", "y0", ..., "x32", "y32"
// Output: an array where each element is a frame's acceleration feature object with keys "A0", "A1", …, "A32"
//         A total of CAPTURE_FRAMES frames are returned (the last frame is a duplicate of the previous one)

function computeJointVelocityFeatures(frames) {
  let numJoints = 33;
  let velocityFrames = [];
  // 计算连续帧之间的速度（速度 = 两帧间欧氏距离除以 dt）
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
  // 为保持帧数一致，复制最后一帧的速度特征
  if (velocityFrames.length > 0) {
    velocityFrames.push({ ...velocityFrames[velocityFrames.length - 1] });
  }
  return velocityFrames;
}

function computeJointAccelerationFeatures(frames) {
  // 先计算速度特征
  let velocityFrames = computeJointVelocityFeatures(frames);
  let numJoints = 33;
  let accelerationFrames = [];
  
  // 对连续的速度帧计算加速度：加速度 = (后帧速度 - 当前帧速度) / dt
  for (let i = 0; i < velocityFrames.length - 1; i++) {
    let frameAcc = {};
    for (let j = 0; j < numJoints; j++) {
      let key = "V" + j;
      let v_current = velocityFrames[i][key];
      let v_next = velocityFrames[i + 1][key];
      let a = Math.abs((v_next - v_current)) / dt;
      frameAcc["Acc" + j] = a;
    }
    accelerationFrames.push(frameAcc);
  }
  
  // 为保持帧数一致，复制最后一帧的加速度特征
  if (accelerationFrames.length > 0) {
    accelerationFrames.push({ ...accelerationFrames[accelerationFrames.length - 1] });
  }
  return accelerationFrames;
}

// ─────────────────────────────────────────────
// 持续预测：仅在 detecting 为 true 时进行“居中 + 滑动窗口 + 预测”
// ─────────────────────────────────────────────
function predictPose() {
  if (detecting && poses.length > 0) {
    let pose = poses[0];
    
    // if condidence is low, use kalman filter
    const threshold = 0.3;
    pose.keypoints.forEach((keypoint,i) => {
      if (keypoint.confidence < threshold) {
        let predX = kalmanFiltersX[i].predict();
        let predY = kalmanFiltersY[i].predict();
        console.log(`Keypoint ${i} low confidence (confidence: ${keypoint.confidence.toFixed(2)}): raw(${keypoint.x.toFixed(2)}, ${keypoint.y.toFixed(2)}) -> predict (${predX.toFixed(2)}, ${predY.toFixed(2)})`);
        keypoint.x = predX;
        keypoint.y = predY;
      } else {
        let rawX = keypoint.x;
        let rawY = keypoint.y;
        keypoint.x = kalmanFiltersX[i].filter(keypoint.x);
        keypoint.y = kalmanFiltersY[i].filter(keypoint.y);
        console.log(`Keypoint ${i} high confidence (confidence: ${keypoint.confidence.toFixed(2)}):raw (${rawX.toFixed(2)}, ${rawY.toFixed(2)}) -> smooth (${keypoint.x.toFixed(2)}, ${keypoint.y.toFixed(2)})`);
      }
    });

    //data centralized
    // ------------------------------
    let sumX = 0, sumY = 0;
    for (let i = 0; i < pose.keypoints.length; i++){
      sumX += pose.keypoints[i].x;
      sumY += pose.keypoints[i].y;
    }
    let avgX = sumX / pose.keypoints.length;
    let avgY = sumY / pose.keypoints.length;
    for (let i = 0; i < pose.keypoints.length; i++) {
      pose.keypoints[i].x = pose.keypoints[i].x - avgX + width / 2;
      pose.keypoints[i].y = pose.keypoints[i].y - avgY + height / 2;
    }
    // ------------------------------
    
    // 将 33 个关键点的原始坐标构造为对象，键名为 "x0", "y0", ..., "x32", "y32"
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
    
    // 每秒（大约每 30 帧）进行一次预测
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
      // 计算 acceleration 特征（返回的 accelerationSequence 为一个帧对象数组，每帧包含 33 个键 "A0"～"A32"）
      let accelerationSequence = computeJointAccelerationFeatures(sequence);
      classifier.predict(accelerationSequence, gotResults);
    }
  }
  setTimeout(predictPose, 1000 / FPS);
}

function gotResults(results) {
  console.log("Full model output:", results);
  if (!results || results.length === 0) return;
  
  // 从模型输出中提取 label 和 confidence
  const { label: rawLabel, value } = results[0];
  const confidence = value !== undefined ? value : 0;
  let predictedLabel, displayConfidence;
  
  // 根据模型返回的标签（这里仅做示例，实际可根据训练时标签设定转换）
  if (rawLabel === "label") {
    if (confidence > 0.5) {
      predictedLabel = "Sustained";   // 例如：A -> Sustained
      displayConfidence = confidence;
    } else {
      predictedLabel = "Sudden";   // 例如：B -> Sudden
      displayConfidence = 1 - confidence;
    }
  } else {
    predictedLabel = rawLabel.toUpperCase();
    displayConfidence = confidence;
  }
  console.log("result:", results, "confidence:", confidence, "predictedLabel:", predictedLabel);
  poseLabel = `${predictedLabel} (${displayConfidence.toFixed(2)})`;
}

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
    // 重置预测相关变量
    poseLabel = "";
    sequence = [];
    frameCount = 0;
    detecting = true;
  }, 2000);
}