// 全局变量
let video;
let bodyPose;
let poses = [];       // 存储检测到的所有人的关键点
let connections;      // 用于画骨架连接的索引

// timeSeries 模型
let classifier;

let sequence = [];    // 每个元素为一个帧的对象（而非纯数组）
let frameCount = 0;

const FPS = 30;
const CAPTURE_FRAMES = 5 * FPS; // 5秒 x 30帧

// 预测（识别）数据采集逻辑
let recognizing = false;        // 是否正在采集/识别
let recognizeSequence = [];     // 存放采集到的预测序列（每帧 33 个关键点的 x,y 数据）
let recognizeFrameCount = 0;    // 已采集帧数
const RECOGNIZE_FRAMES = 5 * 30; // 5 秒 x 30fps = 150 帧


function preload() {
  // 加载 BlazePose 模型
  bodyPose = ml5.bodyPose("BlazePose");
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

  // TODO: Add the code for loading the model
  // QUETSION: Does this work the same way for ml5.timeSeries // yes!
  const modelDetails = {
    model: "model/model.json",
    metadata: "model/model_meta.json",
    weights: "model/model.weights.bin",
  };

  classifier.load(modelDetails, modelLoaded);


  //console.log("Setup done. Press A/B to record, S to save.");


}

// When the model is loaded, you start predicting
function modelLoaded() {
    console.log("model loaded!");
    predictData();
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

}


// predict data
function predictData() {
  

//// select the same properties for inputs


    
    // add them to one array to make them a sequence
    // sequence.push(options);


  // Turn the body pose data into the format to go into "sequence"

  

  // use the sequence to predict
  classifier.predict(sequence, gotResults);
}

// put the new data in the dataset so this will be considered for any new predictions
function gotResults(results) {
  console.log(results);
}

