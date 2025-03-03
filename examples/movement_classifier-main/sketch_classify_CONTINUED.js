//const { model } = require("@tensorflow/tfjs");

// 全局变量
let video;
let bodyPose;
let poses = [];       // 存储检测到的所有人的关键点
let connections;      // 用于画骨架连接的索引
let poseLabel = "";   // 识别的动作标签
let statusText = "";  // 显示当前状态

// timeSeries 模型
let classifier;
let modelDetails;

let sequence = [];    // 每个元素为一个帧的对象（而非纯数组）
let frameCount = 0;
let inputNames = [];

const FPS = 30;
const CAPTURE_FRAMES = 20 * FPS; // 20秒 x 30帧

// // 预测（识别）数据采集逻辑
// let recognizing = false;        // 是否正在采集/识别
// let recognizeSequence = [];     // 存放采集到的预测序列（每帧 33 个关键点的 x,y 数据）
// let recognizeFrameCount = 0;    // 已采集帧数
let detecting = false;


function preload() {
  // 加载 BlazePose 模型
  bodyPose = ml5.bodyPose("BlazePose");
  // 构造输入名称数组：例如 ["x0", "y0", "x1", "y1", ..., "x32", "y32"]
  for (let i = 0; i < 33; i++) {
    inputNames.push(`x${i}`, `y${i}`);
  }

  // setup the timeSeries Neural Network
  let options = {
    task: "classification",
    dataMode: "spatial",  // spatial 表示每个样本的 xs 是一个数组，每个元素为一个时刻的数据对象
    debug: true,
  };
  classifier = ml5.timeSeries(options);
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

  // TODO: Add the code for loading the model
  // QUETSION: Does this work the same way for ml5.timeSeries // yes!
  modelDetails = {
    model: "model/model_test5_glideComR_QuickSlow.json",  // learning rate: 0.00005, epochs: 400
    metadata: "model/model_meta.json", // _test4_e400_2
    weights: "model/model.weights.bin", // _test4_e400_2
  };

  classifier.load(modelDetails, modelLoaded);

}

// When the model is loaded, you start predicting
function modelLoaded() {
    console.log("model loaded!");
    expectedLabels = ["A", "B"];
    predictPose();

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
    // if (frameCount % predictInterval  ==0){
    //   predictPoseQuick();
    // predictPoseStrong();
    }

    fill(255, 0, 255);
    noStroke();
    textSize(52);
    textAlign(CENTER, CENTER);
    text(poseLabel, width / 2, height / 2);

    textSize(24);
    textAlign(RIGHT, TOP);
    text(modelDetails.model, width-10, 10);

    // 在右上角显示状态
    textSize(24);
    fill(255);  // 使用白色文字，或根据需要调整颜色
    textAlign(RIGHT, TOP);
    text(statusText, width - 10, 36);
}

// 回调函数：处理检测到的人体关键点
function gotPoses(results) {
  poses = results;
}

// predict pose
// PREDICTION LOOP: Accumulate frames only when detecting is true.
function predictPose() {

  // Turn the body pose data into the format to go into "sequence"
  if(poses.length > 0) {
    let pose = poses[0];

    //apply thresholding to remove low confidence points
    const threshold = 0.3;
    pose.keypoints.forEach(keypoint => {
      if (keypoint.confidence < threshold) {
        keypoint.x = 0;
        keypoint.y = 0;
      }
    });

    // convert the 33 points into an array of 66 numbers
    let frameArray = [];
    for (let i = 0; i < pose.keypoints.length; i++) {
      frameArray.push(pose.keypoints[i].x);
      frameArray.push(pose.keypoints[i].y);
    }

    //convert the array into an object using keys from inputNames
    // ensure inputNames is an array of 66 strings, one for each coordinate.
    let frameObj = {};
    for (let i = 0; i < inputNames.length; i++) {
      frameObj[inputNames[i]] = frameArray[i];
    }
    // sequence.push(frameObj);

    if(sequence.length < CAPTURE_FRAMES) {
      sequence.push(frameObj);
    } else {
      sequence.shift(); //remove the 1 second old data, 30 frames
      sequence.push(frameObj);
    }

    frameCount++;

    // check 
    if (frameCount % FPS == 0 && sequence.length == CAPTURE_FRAMES) {
      classifier.predict(sequence, gotResults);
    }
  }
  // sequence = []; //reset or handle as needed
  setTimeout(predictPose, 1000/FPS);
}


function gotResults(results) {
  console.log("Full model output:", results);
  if (!results || results.length === 0) return;
  
  // Extract the raw output from the model.
  const { label: rawLabel, value } = results[0];
  const confidence = value !== undefined ? value : 0;
  
  let predictedLabel, displayConfidence;
  
  // If the raw label is "label", use our custom mapping:
  if (rawLabel === "label") {
    if (confidence > 0.5) {
      predictedLabel = "A";
      displayConfidence = confidence;
    } else {
      predictedLabel = "B";
      displayConfidence = 1 - confidence;
    }
  } else {
    // Otherwise, assume the model already maps correctly.
    predictedLabel = rawLabel.toUpperCase();
    displayConfidence = confidence;
  }
  
  console.log("result:", results, "confidence:", confidence, "predictedLabel:", predictedLabel);
  
  // Set poseLabel to display the predicted label and confidence.
  poseLabel = `${predictedLabel} (${displayConfidence.toFixed(2)})`;
}


// KEY PRESS: Press 'd' to start detection after a 2-second delay
// -----------------------------------------------------
function keyPressed() {
  if ((key === 'd' || key === 'D')) {
    if (!detecting){
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
  console.log("Press detected. Starting detection in 2 seconds...");
  // Wait 2 seconds before starting detection
  setTimeout(() => {
    console.log("detection started in continuous sliding window mode");
    // Clear previous results
    poseLabel = "";
    sequence = [];
    frameCount = 0;
    detecting = true; 
  }, 2000); // 这里为 (600 / 30) * 1000 = 20000 毫秒
}
