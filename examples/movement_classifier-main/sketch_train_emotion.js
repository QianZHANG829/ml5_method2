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
  "test10_450frame_freedom_mak_8set.json"


];

//  feature
const FPS = 30;
const expected_frames = 450;    // 每个样本期望的帧数
const dt = 1 / FPS;
const CAPTURE_FRAMES = 15 * FPS; // 例如 15 秒（录制相关代码在此示例中不做修改）

function preload() {
  // 加载 BlazePose 模型（如果你实时录制视频的话使用）
  bodyPose = ml5.bodyPose("BlazePose");


  // 加载所有 JSON 文件，存入 json_data 数组
  for (let i = 0; i < fileNames.length; i++) {
    let path = "data/data_test10_emotion/" + fileNames[i]; // update folder of json file
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


  // each sample has 33 joints 
  let inputNames = [];
  for (let i = 0; i < 33; i++) {
    inputNames.push(`x${i}`, `y${i}`);
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
  // -------------------------------
  // 遍历每个已加载的 JSON 文件
  for (let i = 0; i < json_data.length; i++) {
    let fileData = json_data[i];
    let samplesFeatures = loadSamplesFromData(fileData, fileNames[i]);

    // 如果文件中存在 "data" 属性并且为数组，则说明文件中包含多个样本
    if (fileData.data && Array.isArray(fileData.data)) {
      for (let j = 0; j < samplesFeatures.length; j++) {
        // 取出当前样本归一化后的 xs 数据（450 帧，每帧 66 个特征）
        let normalizedInputs = samplesFeatures[j];
        console.log(`File ${i}, samplesFeatures ${j} frame count: ${samplesFeatures.length}`);
        // 对应的标签数据从原始 sample.ys 中获取
        let outputs = fileData.data[j].ys;
        if (normalizedInputs && outputs) {
          classifier.addData(normalizedInputs, outputs);
        } else {
          console.error("Sample missing xs/ys:", fileData.data[j]);
        }
      }
    } else {
      // 否则，假设整个文件就是一个单独的 sample
      let samples = loadSamplesFromData(fileData, fileNames[i]);
      // 如果返回的是数组，但只有一个样本，则取第一个
      let normalizedInputs = samples.length > 0 ? samples[0] : null;
      let outputs = fileData.ys;
      if (normalizedInputs && outputs) {
        classifier.addData(normalizedInputs, outputs);
      } else {
        console.error("File data missing xs/ys:", fileData);
      }
    }
  }
}

// ──────────────────────────
// 对单帧数据进行归一化处理
// 计算该帧中所有关键点的边界框，然后以边界框中心为原点，并用边界框尺寸进行缩放
function normalizeFrame(frame) {
  let xs = [];
  let ys = [];
  for (let i = 0; i < 33; i++) {
    xs.push(frame["x" + i]);
    ys.push(frame["y" + i]);
  }
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  let centerX = (minX + maxX) / 2;
  let centerY = (minY + maxY) / 2;
  let scale = Math.max(maxX - minX, maxY - minY);
  if (scale === 0) scale = 1;
  let normalizedFrame = {};
  for (let i = 0; i < 33; i++) {
    normalizedFrame["x" + i] = (frame["x" + i] - centerX) / scale;
    normalizedFrame["y" + i] = (frame["y" + i] - centerY) / scale;
  }
  return normalizedFrame;
}

// 对一段连续的帧进行归一化
function normalizeFrames(frames) {
  return frames.map(frame => normalizeFrame(frame));
}

// 从 JSON 文件数据中提取所有样本的归一化原始坐标数据
function loadSamplesFromData(fileData, filename) {
  let samplesFeatures = [];
  if (fileData.data && Array.isArray(fileData.data)) {
    for (let j = 0; j < fileData.data.length; j++) {
      let sample = fileData.data[j];
      let frames = sample.xs; // 原始帧数据（包含 x0, y0, ..., x32, y32）
      if (frames.length < expected_frames) {
        console.warn(`Warning: In file ${filename}, sample ${j} has less than ${expected_frames} frames.`);
        continue;
      }
      // 只取前 expected_frames 帧，并进行归一化处理
      let normalized = normalizeFrames(frames.slice(0, expected_frames));
      samplesFeatures.push(normalized);
    }
  }
  return samplesFeatures; // 返回归一化后的原始坐标数据
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
    classifier.train({ epochs: 150, validationSplit: 0.15, shuffle: false }, finishedTraining);
  }
}

function finishedTraining() {
  console.log("模型训练完成！");
  classifier.save();
  console.log("模型保存完成！");
}
