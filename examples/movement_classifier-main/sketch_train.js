// 全局变量
let video;
let bodyPose;
let poses = [];       // 存储检测到的所有人的关键点
let connections;      // 用于画骨架连接的索引

// timeSeries 模型
let classifier;

// 录制逻辑
let collecting = false;
let collectingLabel = "";
let sequence = [];    // 每个元素为一个帧的对象（而非纯数组）
let frameCount = 0;

// load data from json file , use loadJSON() function instead of loadData();
let json_data = [];
let fileNames = [
    ///label a///
    'test4_A600frame_glideComR_10set5.json',
    'test4_A600frame_glideComR_10set4.json',
    'test4_A600frame_glideComR_10set3.json',
    'test4_A600frame_glideComR_10set2.json',
    'test4_A600frame_glideComR_10set1.json',

    ///label b///
    'test5_B600frame_glideComR_QuickStrong_20set2.json',
    'test5_B600frame_glideComR_QuickStrong_10set3.json',
    'test5_B600frame_glideComR_QuickStrong_10set4.json',
    'test5_B600frame_glideComR_QuickStrong_10set5.json'
];

// 如果你希望将所有样本合并到一个数组，可以 use testData later.
// let testData = []; // Not needed in this version.

const FPS = 30;
const CAPTURE_FRAMES = 20 * FPS; // 20秒 x 30帧

// 声明一个全局的输入名称数组（33 个关键点，每个关键点对应 x 和 y，共 66 个输入）
let inputNames = [];

function preload() {
  // 加载 BlazePose 模型
  bodyPose = ml5.bodyPose("BlazePose");
  
  // 遍历文件名数组加载多个 JSON 文件
  for (let i = 0; i < fileNames.length; i++) {
    let path = "data/" + fileNames[i];
    json_data[i] = loadJSON(path);
  }
}

function setup() {
  createCanvas(640, 480);

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  // 开始检测视频中的人体关键点，结果回调到 gotPoses
  bodyPose.detectStart(video, gotPoses);

  // 获取骨架连线索引（用于绘制骨架）
  connections = bodyPose.getSkeleton();

  // 构造输入名称数组：例如 ["x0", "y0", "x1", "y1", ..., "x32", "y32"]
  for (let i = 0; i < 33; i++) {
    inputNames.push(`x${i}`, `y${i}`);
  }

  // 初始化 ml5.timeSeries 模型，使用 "spatial" 数据模式
  let options = {
    task: "classification",
    dataMode: "spatial",  // spatial 表示每个样本的 xs 是一个数组，每个元素为一个时刻的数据对象
    inputs: inputNames,
    outputs: ["label"],
    learningRate: 0.0001,
    debug: true,
  };
  classifier = ml5.timeSeries(options);
  console.log("Setup done. Press A/B to record, S to save.");

  // -------------------------------
  // 添加加载的训练数据到 classifier
  // -------------------------------
  // 遍历每个已加载的 JSON 文件
  for (let i = 0; i < json_data.length; i++) {
    let fileData = json_data[i];
    
    // 如果文件中存在 "data" 属性并且为数组，则说明文件中包含多个样本
    if (fileData.data && Array.isArray(fileData.data)) {
      for (let j = 0; j < fileData.data.length; j++) {
        let sample = fileData.data[j];
        // 这里假设每个 sample 具有 "xs" 和 "ys" 属性
        let inputs = sample.xs;
        let outputs = sample.ys;
        if (inputs && outputs) {
          classifier.addData(inputs, outputs);
        } else {
          console.error("Sample missing xs/ys:", sample);
        }
      }
    } else {
      // 否则，假设整个文件就是一个单独的 sample
      let inputs = fileData.xs;
      let outputs = fileData.ys;
      if (inputs && outputs) {
        classifier.addData(inputs, outputs);
      } else {
        console.error("File data missing xs/ys:", fileData);
      }
    }
  }
}

function draw() {
  // 绘制视频图像
  image(video, 0, 0, width, height);

  // 绘制检测到的关键点和骨架连线
  for (let i = 0; i < poses.length; i++) {
    let pose = poses[i];

    // 1) 绘制骨架连线
    for (let j = 0; j < connections.length; j++) {
      let pointAIndex = connections[j][0];
      let pointBIndex = connections[j][1];
      let pointA = pose.keypoints[pointAIndex];
      let pointB = pose.keypoints[pointBIndex];

      // 当两个关键点的置信度均大于 0.1 时画线
      if (pointA.confidence > 0.1 && pointB.confidence > 0.1) {
        stroke(255, 0, 0);
        strokeWeight(2);
        line(pointA.x, pointA.y, pointB.x, pointB.y);
      }
    }

    // 2) 绘制关键点
    for (let j = 0; j < pose.keypoints.length; j++) {
      let keypoint = pose.keypoints[j];
      if (keypoint.confidence > 0.1) {
        fill(0, 255, 0);
        noStroke();
        circle(keypoint.x, keypoint.y, 10);
      }
    }
  }
}

// 回调函数：处理检测到的人体关键点
function gotPoses(results) {
  poses = results;

  // 如果正在录制且检测到至少一个人体
  if (collecting && poses.length > 0) {
    let pose = poses[0];

    // 对每个关键点判断置信度，低于阈值的设为 0
    const threshold = 0.3;
    pose.keypoints.forEach(keypoint => {
      if (keypoint.confidence < threshold) {
        keypoint.x = 0;
        keypoint.y = 0;
      }
    });

    // 统计有效关键点和非0坐标数量
    let validKeypoints = 0;
    let nonZeroCoordinates = 0;
    for (let i = 0; i < pose.keypoints.length; i++) {
      if (pose.keypoints[i].x !== 0 || pose.keypoints[i].y !== 0) {
        validKeypoints++;
      }
      if (pose.keypoints[i].x !== 0) nonZeroCoordinates++;
      if (pose.keypoints[i].y !== 0) nonZeroCoordinates++;
    }
    console.log(
      `Frame ${frameCount}: Valid keypoints = ${validKeypoints}/33, Non-zero coordinates = ${nonZeroCoordinates}/66`
    );

    let frameArray = [];
    // 遍历33个关键点，将每个关键点的 x 和 y 值存入 frameArray（总共66个数字）
    for (let i = 0; i < pose.keypoints.length; i++) {
      frameArray.push(pose.keypoints[i].x);
      frameArray.push(pose.keypoints[i].y);
    }
    // 将该帧数据转换成对象，键由 inputNames 数组给出
    let frameObj = {};
    for (let i = 0; i < inputNames.length; i++) {
      frameObj[inputNames[i]] = frameArray[i];
    }
    sequence.push(frameObj);

    frameCount++;
    console.log("collecting", collecting, "frameCount", frameCount, "poses.length", poses.length);

    // 当录制帧数达到 CAPTURE_FRAMES 时，结束录制该样本
    if (frameCount >= CAPTURE_FRAMES) {
      collecting = false;
      console.log(`Finished collecting for label=${collectingLabel}, got ${sequence.length} frames.`);
      classifier.addData(sequence, { label: collectingLabel });
      sequence = [];
      frameCount = 0;
    }
  }
}

function keyPressed() {
  // 按 S 保存数据
  if (key === 's' || key === 'S') {
    classifier.saveData();
    console.log("Saved data to JSON.");
  }
  // 按 A 开始录制 label "A"
  else if (key === 'a' || key === 'A') {
    startCollection("A");
  }
  // 按 B 开始录制 label "B"
  else if (key === 'b' || key === 'B') {
    startCollection("B");
  }
  // 按 T 触发训练
  else if (key === 't' || key === 'T') {
    classifier.normalizeData();
    classifier.train({ epochs: 200 }, finishedTraining);
  }
}

// 开始录制数据，录制前延时2秒
function startCollection(label) {
  console.log(`Will start collecting label=${label} in 1s...`);
  setTimeout(() => {
    console.log(`Recording 5s for label=${label}...`);
    collecting = true;
    collectingLabel = label;
    sequence = [];
    frameCount = 0;
  }, 2000);
}

function finishedTraining() {
  console.log("模型训练完成！");
  classifier.save();
}
