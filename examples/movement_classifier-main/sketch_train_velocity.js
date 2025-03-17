// use velocity feature to train the model


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
  // Label A 文件
  // 'test4_A600frame_glideComR_10set1.json', //sustained/light
  // 'test4_A600frame_glideComR_10set2.json',
  // 'test4_A600frame_glideComR_10set3.json',
  // 'test4_A600frame_glideComR_10set4.json',
  // 'test4_A600frame_glideComR_10set5.json',

  // label fast file
  // 'test8_150frame_fast_dancer05_10set.json',
  // 'test8_150frame_fast_dancer06_8set.json',
  // 'test8_150frame_fast_dancer07_8set.json',
  // 'test8_150frame_fast_dancer08_8set.json',
  // 'test8_150frame_fast_dancer09_10set.json',
  // 'test8_150frame_fast_hofesh01_15set.json',


  // Label B 文件
  // 'test5_B600frame_glideComR_QuickStrong_10set3.json', //sudden/strong
  // 'test5_B600frame_glideComR_QuickStrong_10set4.json',
  // 'test5_B600frame_glideComR_QuickStrong_10set5.json',
  // 'test5_B600frame_glideComR_QuickStrong_20set2.json',

  //labe slow files
  // 'test8_150frame_slow_circlewalk_14set.json',
  // 'test8_150frame_slow_elbow_20set.json',
  // 'test8_150frame_slow_finger_17set.json',
  // 'test8_150frame_slow_foot_15set.json',
  // 'test8_150frame_slow_head_15set.json',

];

// acceleration feature
const FPS = 30;
const expected_frames = 75;    // 每个样本期望的帧数
const dt = 1 / FPS;
const CAPTURE_FRAMES = 2.5 * FPS; // 例如 2.5 秒（录制相关代码在此示例中不做修改）

let velocities = [];  // 用于存储速度特征


function preload() {
  // 加载 BlazePose 模型（如果你实时录制视频的话使用）
  bodyPose = ml5.bodyPose("BlazePose");

  // 加载第一个文件夹的 index.json
  let index1 = loadJSON("data/data_test9_velocity_fast/velocity_fast_index.json");
  let files1 = index1.files;
  for (let i = 0; i < files1.length; i++) {
    let path = "data/data_test9_velocity_fast/" + files1[i];
    json_data.push(loadJSON(path));
    fileNames.push(files1[i]);
  }

  // // 加载第二个文件夹的 index.json
  // let index2 = loadJSON("data/data_test9_velocity_slow/velocity_slow_index.json");
  // let files2 = index2.files;
  // for (let i = 0; i < files2.length; i++) {
  //   let path = "data/data_test9_velocity_slow/" + files2[i];
  //   json_data.push(loadJSON(path));          // 使用 push 追加数据
  //   fileNames.push(files2[i]);   
  // }


  // // 加载所有 JSON 文件，存入 json_data 数组
  // for (let i = 0; i < fileNames.length; i++) {
  //   let path = "data/data_test8_velocity/" + fileNames[i];
  //   json_data[i] = loadJSON(path);
  // }
}

function setup() {
  createCanvas(640, 480);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  bodyPose.detectStart(video, gotPoses);
  connections = bodyPose.getSkeleton();

  
 
  //// 构造输入名称数组：例如 ["v0", "v0", "v1", "v1", ..., "v32", "v32"]
  let inputNames = [];
  for (let i = 0; i < 33; i++) {
    inputNames.push("V" + i);
  }
  

  // 初始化 ml5.timeSeries 模型，此时输入使用加速度特征名称
  let options = {
    task: "classification",
    dataMode: "spatial",  // spatial 模式下每个样本的 xs 是一个对象
    inputs: inputNames,
    outputs: ["label"],
    learningRate: 0.0002,
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
        let inputs = samplesFeatures[j]; // 这里 inputs 是一个帧对象数组（每帧 33 个速度值）
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
  for (let j = 0; j < numJoints; j++) {
    let jointVelocities = [];
  
  //对于每个相邻帧（0 到 frames.length-2）
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
}


// 从 JSON 文件数据中提取所有样本的速度特征
function loadSamplesFromData(fileData, filename) {
  let samplesFeatures = [];
  if (fileData.data && Array.isArray(fileData.data)) {
    for (let j = 0; j < fileData.data.length; j++) {
      let sample = fileData.data[j];
      let frames = sample.xs; // 原始帧数据（包含 x, y 坐标）
      let velFeatures = computeJointVelocityFeatures(frames);
      if (!velFeatures || velFeatures.length < 33*(expected_frames - 1)) {
        console.warn(`Warning: In file ${filename}, sample ${j} has less than ${expected_frames} frames (velocity features).`);
      } else {
        samplesFeatures.push(velFeatures.slice(0, expected_frames));
      }
    }
  }
  return samplesFeatures;
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
    classifier.train({ epochs: 100 }, finishedTraining);
  }
}

function finishedTraining() {
  console.log("模型训练完成！");
  classifier.save();
  console.log("模型保存完成！");
}