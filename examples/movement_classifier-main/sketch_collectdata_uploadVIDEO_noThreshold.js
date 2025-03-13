/// upload recorded video to get the keypoint data with bodyPose.

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


// 文件上传按钮
let fileInput;
//video play button
let playButton, videoSlider;
let controlBar; // 控制条容器


// 记录视频的实际宽高，方便在 videoLoaded 后使用
let vidWidth = 640;
let vidHeight = 480;

const FPS = 30;
const CAPTURE_FRAMES = 5 * FPS; // 20秒 x 30帧

// 声明一个全局的输入名称数组（33 个关键点，每个关键点对应 x 和 y，共 66 个输入）
let inputNames = [];

let confidence = null; // 或 -1 代表未初始化


function preload() {
  // 加载 BlazePose 模型
  bodyPose = ml5.bodyPose("BlazePose",modelReady);
}

function setup() {
  createCanvas(vidWidth, vidHeight);
  
  // 创建文件上传按钮，用于上传视频文件
  fileInput = createFileInput(handleFile);
  fileInput.position(10, (windowHeight - fileInput.elt.clientHeight) / 2);

  // 只创建一个空的 controlBar 容器，先不设置位置和大小
  controlBar = createDiv();

  // video = createCapture(VIDEO);
  // video.size(640, 480);
  // video.hide();


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
    learningRate: 0.001,
    debug: true,
  };
  classifier = ml5.timeSeries(options);
  console.log("Setup done. Press A/B to record, S to save.");
}

function handleFile(file) {
  if (file.type === 'video') {
    // 使用上传的视频文件创建 video 对象
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
  console.warn("video has been loaded");
  // 获取原始宽高
  vidWidth = video.width;
  vidHeight = video.height;

  // 创建与视频相同大小的画布
  resizeCanvas(vidWidth, vidHeight);

  video.loop();
  bodyPose.detectStart(video, gotPoses);
  connections = bodyPose.getSkeleton();

  // 设置控制条容器大小与位置（在视频下方）
  controlBar.size(vidWidth, 40);
  controlBar.style("background-color", "#ddd");
  // 让控制条位于视频正下方，可以根据需求调整 x, y
  controlBar.position(0, vidHeight+150);
  controlBar.style("display", "flex");
  controlBar.style("align-items", "center");
  controlBar.style("padding", "0 10px");

  // 在控制条容器中创建进度条
  // video.duration() 在视频加载后即可获取
  videoSlider = createSlider(0, video.duration(), 0, 0.01);
  videoSlider.parent(controlBar);
  videoSlider.style("flex-grow", "1"); // 让滑块自适应宽度

  // 当滑动条值改变时，更新视频当前播放时间
  videoSlider.input(() => {
    let t = videoSlider.value();
    video.time(t);
  });

  // 在控制条容器中创建播放/暂停按钮
  playButton = createButton("Play/Pause");
  playButton.parent(controlBar);
  playButton.style("margin-left", "10px");
  playButton.mousePressed(togglePlay);
}

function modelReady() {
  console.log("BlazePose ready!");
}


function draw() {
  // 绘制视频图像
  if (video){
    image(video, 0, 0, width, height);
  }

  if (video && videoSlider && video.time && video.duration) { 
    videoSlider.value(video.time()); 
  }

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
      // if (keypoint.confidence > 0.1) {
      //   fill(0, 255, 0);
      //   noStroke();
      //   circle(keypoint.x, keypoint.y, 10);
      // }
    }
  }
}

// 回调函数：处理检测到的人体关键点
function gotPoses(results) {
  if (!results || results.length === 0) return;  // 避免无效调用

  poses = results;

  // 如果正在录制且检测到至少一个人体
  if (collecting && poses.length > 0) {
    let pose = poses[0];


    // 统计有效的关键点和非0坐标数量
    let validKeypoints = 0;    // 有效关键点个数（判断 x,y 至少一个不为 0）
    let nonZeroCoordinates = 0; // 非0的坐标数量（x 和 y 分开计算，总共 66 个坐标）
    for (let i = 0; i < pose.keypoints.length; i++) {
      // 如果该关键点的 x 或 y 有一个不为 0，则认为该关键点有效
      if (pose.keypoints[i].x !== 0 || pose.keypoints[i].y !== 0) {
        validKeypoints++;
      }
      if (pose.keypoints[i].x !== 0) nonZeroCoordinates++;
      if (pose.keypoints[i].y !== 0) nonZeroCoordinates++;
    }
    // 输出每一帧的统计信息，比如有效关键点个数（33 个中的有效数）和非0坐标数量（66 个中的有效数）
    console.log(
      `Frame ${frameCount}: Valid keypoints = ${validKeypoints}/33, Non-zero coordinates = ${nonZeroCoordinates}/66`
    );


    let frameArray = [];

    // 遍历 33 个关键点，将每个关键点的 x 和 y 值存入 frameArray（总共 66 个数字）
    for (let i = 0; i < pose.keypoints.length; i++) {
      frameArray.push(pose.keypoints[i].x);
      frameArray.push(pose.keypoints[i].y);
    }
    // 将该帧数据转换成对象，键由 inputNames 数组给出
    let frameObj = {};
    for (let i = 0; i < inputNames.length; i++) {
      frameObj[inputNames[i]] = frameArray[i];
    }
    // 将转换后的帧对象加入时序数据数组中
    sequence.push(frameObj);

    frameCount++;
    console.log("collecting", collecting, "frameCount", frameCount, "poses.length", poses.length);

    // 当录制帧数达到 CAPTURE_FRAMES（例如 150 帧，5秒）时，结束录制该样本
    if (frameCount >= CAPTURE_FRAMES) {
      collecting = false;
      console.log(`Finished collecting for label=${collectingLabel}, got ${sequence.length} frames.`);

      // 将该时序数据（一个包含多个帧对象的数组）作为一个样本添加到模型中
      classifier.addData(sequence, { label: collectingLabel });

      // 重置时序数据和帧计数
      sequence = [];
      frameCount = 0;
    }
  }
  // 如果没有检测到人体，则可以允许再次录制
  // 这里可选：你也可以设置 collecting = false; 以确保录制下一次数据
}

function keyPressed() {
  // 按 1 保存数据
  if (key === '1' ) {
    classifier.saveData();
    console.log("Saved data to JSON.");
  }
  // 按 A 开始录制 label "A"
  else if (key === 'a' || key === 'A') {  
    startCollection("Sustained");
  }
  // 按 B 开始录制 label "B"
  else if (key === 'b' || key === 'B') {
    startCollection("Sudden");
  } 
  
  else if (key === 'f' || key === 'F') {  
    startCollection("Fast"); // FAST 
  }
  // 按 S 开始录制 label "S"
  else if (key === 's' || key === 'S') {
    startCollection("Slow"); //Slow
  }
  // 按 T 触发训练
  else if (key === 't' || key === 'T') {
    classifier.saveData();
    classifier.normalizeData();
    classifier.train({ epochs: 5 }, finishedTraining);
    console.log("Started training...");
  }
}

// 开始录制数据，录制前延时1秒
function startCollection(label) {
  console.log(`Will start collecting label=${label} in 1s...`);
  setTimeout(() => {
    console.log(`Recording 5s for label=${label}...`);
    collecting = true;
    collectingLabel = label;
    sequence = [];
    frameCount = 0;
  }, 1000);
}


function finishedTraining() {
    console.log("模型训练完成！");
    classifier.save();
}

// for play video 
function togglePlay() {
   // 如果 video 对象支持 play/pause 控制（例如上传的视频）
   if (video && video.elt) {
    if (!video.elt.paused) {
      video.pause();
    } else {
      video.play();
    }
  }
}