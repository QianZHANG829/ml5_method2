// 全局变量
let video;
let bodyPose;
let poses = [];         // 存储检测到的所有人的关键点
let connections;        // 用于绘制骨架连线的索引

// ml5.timeSeries 模型
let classifier;

// 录制逻辑
let collecting = false;
let collectingLabel = "";
let sequence = [];      // 每个元素为一个帧的对象（包含 66 个输入）
let frameCount = 0;

// 文件上传按钮和视频控制相关 DOM
let fileInput;
let playButton, videoSlider;
let controlBar;         // 控制条容器

// 视频宽高（默认值）
let vidWidth = 1920;
let vidHeight = 1080;

const FPS = 30;
const CAPTURE_FRAMES = 2 * FPS; // 2秒 x 30帧

// 全局输入名称数组（33 个关键点，每个有 x 和 y，共66个输入）
let inputNames = [];

// 模型加载状态变量（可选）
let confidence = null;

function preload() {
  // 加载 BlazePose 模型，加载完成后调用 modelReady
  bodyPose = ml5.bodyPose("BlazePose", modelReady);
}

function setup() {
  // 创建画布
  createCanvas(vidWidth, vidHeight);
  
  // 创建文件上传按钮
  fileInput = createFileInput(handleFile);
  fileInput.position(10, (windowHeight - fileInput.elt.clientHeight) / 2);
  
  // 创建空的控制条容器（后面会在 videoLoaded 中设置样式和位置）
  controlBar = createDiv();
  
  // 获取骨架连线索引（用于绘制骨架）
  connections = bodyPose.getSkeleton();
  
  // 构造输入名称数组：["x0", "y0", "x1", "y1", ..., "x32", "y32"]
  for (let i = 0; i < 33; i++) {
    inputNames.push(`x${i}`, `y${i}`);
  }
  
  // 初始化 ml5.timeSeries 模型，使用 spatial 数据模式
  let options = {
    task: "classification",
    dataMode: "spatial", // 每个样本的 xs 是一个时序对象数组
    inputs: inputNames,
    outputs: ["label"],
    learningRate: 0.001,
    debug: true,
  };
  classifier = ml5.timeSeries(options);
  console.log("Setup done. Press A/B to record, S to save.");
}

function handleFile(file) {
  if (file.type === 'video') {
    // 使用上传的视频文件创建 video 对象，加载完成后调用 videoLoaded
    video = createVideo([file.data], videoLoaded);
    video.hide(); // 隐藏默认的视频 DOM 元素
  } else {
    console.log("请上传视频文件");
  }
}

function videoLoaded() {
  if (!video) {
    console.warn("video is not loaded");
    return;
  }
  console.log("video has been loaded");
  
  // // 获取视频的原始宽高，并调整画布大小
  // vidWidth = video.width;
  // vidHeight = video.height;
  // resizeCanvas(vidWidth, vidHeight);
  
  // 循环播放视频，并开始检测关键点
  video.loop();
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
  console.log("BlazePose ready!");
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
}


// 回调函数：处理检测到的人体关键点
function gotPoses(results) {
  if (!results || results.length === 0) return;  // 避免无效调用
  
  poses = results;
  
  // 如果正在录制且检测到至少一人
  if (collecting && poses.length > 0) {
    let pose = poses[0];
    
    // 输出统计信息（有效关键点个数与非0坐标数）
    let validKeypoints = 0;
    let nonZeroCoordinates = 0;
    for (let i = 0; i < pose.keypoints.length; i++) {
      if (pose.keypoints[i].x !== 0 || pose.keypoints[i].y !== 0) {
        validKeypoints++;
      }
      if (pose.keypoints[i].x !== 0) nonZeroCoordinates++;
      if (pose.keypoints[i].y !== 0) nonZeroCoordinates++;
    }
    console.log(`Frame ${frameCount}: Valid keypoints = ${validKeypoints}/33, Non-zero coordinates = ${nonZeroCoordinates}/66`);
    
    // 将当前帧的所有关键点 x,y 坐标存入数组（直接使用原始坐标，不做中心化处理）
    let frameArray = [];
    for (let i = 0; i < pose.keypoints.length; i++) {
      frameArray.push(pose.keypoints[i].x);
      frameArray.push(pose.keypoints[i].y);
    }
    
    // 构造帧对象，键名来源于 inputNames 数组
    let frameObj = {};
    for (let i = 0; i < inputNames.length; i++) {
      frameObj[inputNames[i]] = frameArray[i];
    }
    
    // 保存当前帧数据到时序数组中
    sequence.push(frameObj);
    frameCount++;
    console.log("collecting", collecting, "frameCount", frameCount, "poses.length", poses.length);
    
    // 当录制帧数达到设定值后，结束录制并将数据添加到模型中
    if (frameCount >= CAPTURE_FRAMES) {
      collecting = false;
      console.log(`Finished collecting for label=${collectingLabel}, got ${sequence.length} frames.`);
      classifier.addData(sequence, { label: collectingLabel });
      sequence = [];
      frameCount = 0;
    }
  }
}

// 键盘事件：用于录制、保存数据和训练模型
function keyPressed() {
  if (key === '1') {
    classifier.saveData();
    console.log("Saved data to JSON.");
  }
  else if (key === 'a' || key === 'A') {
    startCollection("Sustained");
  }
  else if (key === 'b' || key === 'B') {
    startCollection("Sudden");
  }
  else if (key === 'f' || key === 'F') {
    startCollection("Fast");
  }
  else if (key === 's' || key === 'S') {
    startCollection("Slow");
  }
  else if (key === 't' || key === 'T') {
    classifier.saveData();
    classifier.normalizeData();
    classifier.train({ epochs: 5 }, finishedTraining);
    console.log("Started training...");
  }
}

// 开始录制数据，延时1秒后开始录制
function startCollection(label) {
  console.log(`Will start collecting label=${label} in 1s...`);
  setTimeout(() => {
    console.log(`Recording 5s for label=${label}...`);
    collecting = true;
    collectingLabel = label;
    sequence = [];
    frameCount = 0;
  }, 100);
}

function finishedTraining() {
  console.log("模型训练完成！");
  classifier.save();
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
