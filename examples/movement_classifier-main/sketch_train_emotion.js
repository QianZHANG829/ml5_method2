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
  //60 sad
  "test10_450frame_sad_bye02_27set.json", 
  "test10_450frame_sad_bye01_18set.json", 
  "test10_450frame_sad_bye02_6set.json",
  "test10_450frame_sad_bye01_6set.json",

  // conflict 55
  "test10_450frame_conflict_hofesh_rave_8set.json",
  "test10_450frame_conflict_sarah_bigmouth_6set.json", 
  "test10_450frame_conflict_bo_bigmouth_14set.json", 
  "test10_450frame_conflict_hofesh_21set.json", 
  "test10_450frame_conflict_fullmoon_6set.json",

  // freedom 58
  "test10_450frame_freedom_smoke_20set.json",
  "test10_450frame_freedom_bye01_20set.json",
  "test10_450frame_freedom_dancer11_10set.json", 
  // "test10_450frame_freedom_mak_8set.json" 

];

//  feature
const FPS = 30;
const expected_frames = 450;    // 每个样本期望的帧数
const dt = 1 / FPS;
const CAPTURE_FRAMES = 15 * FPS; // 例如 15 秒（录制相关代码在此示例中不做修改）

let velocities = [];  // 用于存储速度特征


function preload() {
  // 加载 BlazePose 模型（如果你实时录制视频的话使用）
  bodyPose = ml5.bodyPose("BlazePose");

  // // 加载第一个文件夹的 index.json
  // let index1 = loadJSON("data/velocity_fast_index.json");
  // let files1 = index1.files;
  // for (let i = 0; i < files1.length; i++) {
  //   let path = "data/data_test9_velocity_fast/" + files1[i];
  //   json_data.push(loadJSON(path));
  //   fileNames.push(files1[i]);
  // }

  // // 加载第二个文件夹的 index.json
  // let index2 = loadJSON("data/data_test9_velocity_slow/velocity_slow_index.json");
  // let files2 = index2.files;
  // for (let i = 0; i < files2.length; i++) {
  //   let path = "data/data_test9_velocity_slow/" + files2[i];
  //   json_data.push(loadJSON(path));          // 使用 push 追加数据
  //   fileNames.push(files2[i]);   
  // }


  // 加载所有 JSON 文件，存入 json_data 数组
  for (let i = 0; i < fileNames.length; i++) {
    let path = "data/data_test10_emotion/" + fileNames[i];
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

  
 
  //// 构造输入名称数组：例如 ["v0", "v0", "v1", "v1", ..., "v32", "v32"]
  let inputNames = [];
  for (let i = 0; i < 33; i++) {
    inputNames.push(`x${i}`, `y${i}`);

  }
  

  // 初始化 ml5.timeSeries 模型，
  let options = {
    task: "classification",
    dataMode: "spatial",  // spatial 模式下每个样本的 xs 是一个对象
    inputs: inputNames,
    outputs: ["label"],
    learningRate: 0.001,
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
        let inputs = samplesFeatures[j]; 
        let outputs = fileData.data[j].ys;
        classifier.addData(inputs, outputs);
        console.log(`Data added: output = ${outputs.label}`);
      }
    }
  }
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

// 从 JSON 文件数据中提取所有样本的特征
function loadSamplesFromData(fileData, filename) {
  let samplesFeatures = [];
  if (fileData.data && Array.isArray(fileData.data)) {
    for (let j = 0; j < fileData.data.length; j++) {
      let sample = fileData.data[j];
      let frames = sample.xs; // 原始帧数据（包含 x, y 坐标）
      let normFeatures = computeNormalizedFeatures(frames);
      // 如果需要确保每个样本帧数达到期望值，可以在这里做截取或补帧处理
      if (!normFeatures || normFeatures.length < expected_frames) {
        console.warn(`Warning: In file ${filename}, sample ${j} has less than ${expected_frames} frames (normalized features).`);
      } else {
        samplesFeatures.push(normFeatures.slice(0, expected_frames));
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
    classifier.train({ epochs: 200, validationSplit:0.1, shuffle:false }, finishedTraining);
  }
}

function finishedTraining() {
  console.log("模型训练完成！");
  classifier.save();
  console.log("模型保存完成！");
}