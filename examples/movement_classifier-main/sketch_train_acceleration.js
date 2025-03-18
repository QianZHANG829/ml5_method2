// use acceleration feature to train the model
// capture movement weight: light/strong


// 全局变量
let video;
let bodyPose;
let poses = [];       // 存储检测到的所有人体关键点（用于实时录制时用，不在本示例重点）
let connections;      // 用于绘制骨架连线的索引

// timeSeries 模型
let classifier;

// 录制逻辑
let collecting = false;
let collectingLabel = "";
let sequence = [];    // 每个元素为一个帧的对象（而非纯数组）
let frameCount = 0;

// JSON 数据数组，每个元素对应一个文件
let json_data = [];
let fileNames = [

  // Label A 文件 - sustained
  // 'test4_A600frame_glideComR_10set1.json', //sustained/light
  // 'test4_A600frame_glideComR_10set2.json',
  // 'test4_A600frame_glideComR_10set3.json',
  // 'test4_A600frame_glideComR_10set4.json',
  // 'test4_A600frame_glideComR_10set5.json',

  // 'test6_sustained_dance03_6set.json',
  // 'test6_sustained_dance03_6set.json',

  // 'test7_150frame_sustained_palm_15set.json',
  // 'test7_150frame_sustained_knee_15set.json',
  // 'test7_150frame_sustained_head_15set.json',
  // 'test7_150frame_sustained_elbow_15set.json',

  // sustained move test 8 -  135 data
  //'test8_150frame_sustained_back_15set.json',
  // 'test8_150frame_sustained_elbow_21set.json',
  // 'test8_150frame_sustained_finger_17set.json',
  // 'test8_150frame_sustained_foot_15set.json',
  // 'test8_150frame_sustained_head_15set.json',
  // 'test8_150frame_sustained_knee_20set.json',
  // 'test8_150frame_sustained_kayla_7set.json',
  // 'test8_150frame_sustained_walk_20set.json',
  // 'test8_150frame_sustained_shoulder_20set.json',

  "test9_60frame_sustained_hip_22set.json",
  "test9_60frame_sustained_nose_25set.json",
  "test9_60frame_sustained_walk_20set.json",
  "test9_60frame_sudden_walk_18set.json",
  "test9_60frame_sustained_head_28set.json",
  "test9_60frame_sudden_elbow_17set.json",
  "test9_60frame_sudden_dancer06_7set.json",
  "test9_60frame_sudden_jump_24set.json",
  "test9_60frame_sustained_knee_23set.json",
  "test9_60frame_sustained_foot_20set.json",

  // sudden
  "test9_60frame_sudden_dancer02_21set.json",
  "test9_60frame_sudden_dancer03_6set.json",
  "test9_60frame_sudden_dancer08_10set.json",
  "test9_60frame_sudden_dancer01_22set.json",
  "test9_60frame_sustained_palm_21set.json",
  "test9_60frame_sustained_elbow_26set.json",
  "test9_60frame_sudden_dancer09_15set.json",
  "test9_60frame_sustained_dancer03_10set.json",
  "test9_60frame_sustained_dancer03_11set.json",
  "test9_60frame_sustained_shoulder_24set.json",
  "test9_60frame_sudden_hofesh01_30set.json",
  "test9_60frame_sudden_knee_20set.json",
  "test9_60frame_sudden_palm_34set.json"


  // Label B 文件
  // 'test5_B600frame_glideComR_QuickStrong_10set3.json', //sudden/strong
  // 'test5_B600frame_glideComR_QuickStrong_10set4.json',
  // 'test5_B600frame_glideComR_QuickStrong_10set5.json',
  // 'test5_B600frame_glideComR_QuickStrong_20set2.json',
  // 'test6_sudden_dancer01_8set.json',
  // 'test6_sudden_dancer04_11set.json',

  // 'test7_150frame_sudden_elbow_15set.json',
  // 'test7_150frame_sudden_palm_15set.json',
  // 'test7_150frame_sudden_jump_15set.json',
  // 'test7_150frame_sudden_knee_15set.json',

  // sudden move test 8 -  139 data
  // 'test8_150frame_sudden_dancer01_8set.json',
  // 'test8_150frame_sudden_dancer02_10set.json',
  // 'test8_150frame_sudden_dancer06_1set.json',
  // 'test8_150frame_sudden_elbow_20set.json',
  // 'test8_150frame_sudden_hofesh01_10set.json',
  // 'test8_150frame_sudden_jump_30set.json',
  // 'test8_150frame_sudden_knee_16set.json',
  // 'test8_150frame_sudden_palm_23set.json',
  // 'test8_150frame_sudden_walk_21set.json',

  // sudden
  // 'test9_60frame_sudden_dancer01_22set.json',
  // 'test9_60frame_sudden_dancer02_21set.json',
  // 'test9_60frame_sudden_dancer03_6set.json',

];

// acceleration feature
const FPS = 30;
const expected_frames = 60;    // 每个样本期望的帧数
const dt = 1 / FPS;
const CAPTURE_FRAMES = 2 * FPS; // 例如 2 秒（录制相关代码在此示例中不做修改）

function preload() {
  // 加载 BlazePose 模型（如果你实时录制视频的话使用）
  bodyPose = ml5.bodyPose("BlazePose");


  // 加载所有 JSON 文件，存入 json_data 数组
  for (let i = 0; i < fileNames.length; i++) {
    let path = "data/data_test9_acceleration/" + fileNames[i]; // update folder of json file
    json_data[i] = loadJSON(path);
  }
}

function setup() {

  createCanvas(640, 480);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  bodyPose.detectStart(video, gotPoses);
  connections = bodyPose.getSkeleton();

  
  // For acceleration, each sample has 33 joints × expected_frames values.
  //// 构造输入名称数组：例如 ["Acc0", "Acc0", "Acc1", "Acc1", ..., "Acc32", "Acc32"]
  let inputNames = [];
  for (let i = 0; i <33; i++) {
    inputNames.push("Acc" + i);
  }
  

  // 初始化 ml5.timeSeries 模型，此时输入使用加速度特征名称
  let options = {
    task: "classification",
    dataMode: "spatial",  // spatial 模式下每个样本的 xs 是一个对象
    inputs: inputNames,
    outputs: ["label"],
    learningRate: 0.002,
    debug: true,
  };
  classifier = ml5.timeSeries(options);
  console.log("Setup done. Press T to train after data added.");


  // -------------------------------
  // 添加加载的训练数据到 classifier
  for (let i = 0; i < json_data.length; i++) {
    let fileData = json_data[i];
    if (fileData.data && Array.isArray(fileData.data)) {
      let samplesFeatures = loadSamplesFromData(fileData, fileNames[i]);
      for (let j = 0; j < samplesFeatures.length; j++) {
        let inputs = samplesFeatures[j]; // 每个 inputs 为一帧对象数组（每帧 33 个加速度特征）
        let outputs = fileData.data[j].ys;
        classifier.addData(inputs, outputs);
      }
    }
  }
}


// ──────────────────────────
// 计算每个样本的速度特征（按帧计算）
// ──────────────────────────
// 输入：frames 数组，每个元素为一帧对象，包含 "x0", "y0", ..., "x32", "y32"
// 输出：一个数组，每个元素为一帧的速度特征对象，键为 "V0", "V1", …, "V32"
//       共返回 expected_frames 帧（最后一帧复制前一帧的结果）
function computeJointVelocityFeatures(frames) {
  let numJoints = 33;
  let velocityFrames = [];

  // 对于每个关节
  for (let i = 0; i < frames.length-1; i++) {
      let frameVel = {};
      for (let j=0; j<numJoints; j++) {
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
  
    // 如果原来有 N-1 个速度值，为了让长度达到 N，复制最后一个速度值
    if (velocityFrames.length > 0) {
      velocityFrames.push({ ...velocityFrames[velocityFrames.length - 1] });
    }    
  return velocityFrames; 
}


// 计算加速度特征（按帧计算）：
// 输入：frames 数组，每个元素为一帧对象，包含 "x0", "y0", ..., "x32", "y32"
// 输出：一个数组，每个元素为一帧的加速度特征对象，键为 "A0", "A1", …, "A32"
//       共返回 expected_frames 帧（最后一帧复制前一帧的结果）
function computeJointAccelerationFeatures(frames) {
  let velocityFrames = computeJointVelocityFeatures(frames);
  let numJoints = 33;
  let accelerationFrames = []; 

  // 对于每对相邻的速度帧，计算加速度：加速度 = (后帧速度 - 当前帧速度) / dt
  for (let i = 0; i < velocityFrames.length - 1; i++) {
    let frameAcc = {};
    for (let j = 0; j < numJoints; j++) {
      let key = "V" + j;
      let v_current = velocityFrames[i][key];
      let v_next = velocityFrames[i + 1][key];
      let a = Math.abs((v_next - v_current)) / dt; // use absolute value.ignore direction change.
      frameAcc["Acc" + j] = a;
    }
    accelerationFrames.push(frameAcc);
  }
  // 为了保持帧数与原始数据一致，将最后一帧的加速度复制一次
  if (accelerationFrames.length > 0) {
    accelerationFrames.push({ ...accelerationFrames[accelerationFrames.length - 1] });
  }
  return accelerationFrames;
}



// 从 JSON 文件数据中提取所有样本的速度特征
function loadSamplesFromData(fileData, filename) {
  let samplesFeatures = [];
  if (fileData.data && Array.isArray(fileData.data)) {
    for (let j = 0; j < fileData.data.length; j++) {
      let sample = fileData.data[j];
      let frames = sample.xs; // 原始帧数据（包含 x, y 坐标）
      let accFeatures = computeJointAccelerationFeatures(frames);
      if (!accFeatures || accFeatures.length < expected_frames) {
        console.warn(`Warning: In file ${filename}, sample ${j} has less than ${expected_frames} frames (velocity features).`);
      } else {
        samplesFeatures.push(accFeatures.slice(0, expected_frames));
      }
    }
  }
  return samplesFeatures; // acc features
}

function draw() {
  // 显示视频（以及实时绘制检测到的关键点等，仅供参考）
  image(video, 0, 0, width, height);
  for (let i = 0; i < poses.length; i++) {
    let pose = poses[i];
    // 绘制骨架连线
    for (let j = 0; j < connections.length; j++) {
      let idxA = connections[j][0];
      let idxB = connections[j][1];
      let pointA = pose.keypoints[idxA];
      let pointB = pose.keypoints[idxB];
      if (pointA.confidence > 0.1 && pointB.confidence > 0.1) {
        stroke(255, 0, 0);
        strokeWeight(2);
        line(pointA.x, pointA.y, pointB.x, pointB.y);
      }
    }
    // 绘制关键点
    for (let j = 0; j < pose.keypoints.length; j++) {
      let kp = pose.keypoints[j];
      if (kp.confidence > 0.1) {
        fill(0, 255, 0);
        noStroke();
        circle(kp.x, kp.y, 10);
      }
    }
  }
}

// 回调函数：处理检测到的人体关键点（实时录制用）
function gotPoses(results) {
  poses = results;
  // 此处省略实时录制的代码，可参考原代码
}

function keyPressed() {
  // 按 T 键开始训练
  if (key === 't' || key === 'T') {
    classifier.normalizeData();
    classifier.train({ epochs: 150, validationSplit:0.15, shuffle:false }, finishedTraining);
  }
}

function finishedTraining() {
  console.log("模型训练完成！");
  classifier.save();
  console.log("模型保存完成！");
}
