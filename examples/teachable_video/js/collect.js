//

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
//let fileInput;
let playButton, videoSlider;
let controlBar;         // 控制条容器

// 视频宽高（默认值）
let vidWidth = 1920;
let vidHeight = 1080;

let FPS = 30;
let CAPTURE_FRAMES = 15 * FPS; 

// 全局输入名称数组（33 个关键点，每个有 x 和 y，共66个输入）
let inputNames = [];

// 模型加载状态变量（可选）
let confidence = null;

//存储每次 startCollection() 完成的标注时间段：
let labeledSegments = []; // 每段形如 { lab  l: 'Class A', start: 2.0, end: 17.0 }
let playRow;

// ================= 目标外框尺寸（想多大就填多大） ================
const CANVAS_W = 960;   // 固定外框宽
const CANVAS_H = 540;   // 固定外框高（例如 16:9）

/* --------- 刻度尺参数 --------- */
const TICK_INTERVAL = 1;      // 每 1s 一个小刻度
const BIG_TICK_EVERY = 5;     // 每 5s 加粗并打时间文字
let PX_PER_SEC = 8;
/* ----------------------------- */

/* 全局变量，加在文件顶部其它全局变量旁 */
let collectStartTime = 0;

/* sliderW 改成固定基准 960，而非 clientWidth */
const sliderW = 960;

/* ====== 1. 全局变量 ====== */
let webcamCapture = null;
let usingWebcam   = false;

/* collect.js 顶部 */
let sampleCount   = 0;         // 总段数
const thumbnails  = [];        // {imgEl, startF, endF, srcType}

let videoTimeHandler = null;

function preload() {
  // 加载 BlazePose 模型，加载完成后调用 modelReady
  bodyPose = ml5.bodyPose("BlazePose", modelReady);
}

function setup() {
  // 创建画布
  //createCanvas(vidWidth, vidHeight);
  
  // 创建文件上传按钮
  //fileInput = createFileInput(handleFile);
  //fileInput.position(10, (windowHeight - fileInput.elt.clientHeight) / 2);
  
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

/** 处理上传文件（视频） */
function handleFile(file) {
  /* ============ 如果此时正在使用摄像头，先干净关闭 ============ */
  if (usingWebcam && webcamCapture) {
    try {
      webcamCapture.stop();        // 1. 停止 p5 捕获
      webcamCapture.remove();      // 2. 移除隐藏的 <video>
    } catch (e) {
      console.warn('close webcam error', e);
    }
    usingWebcam   = false;         // 3. 状态复原
    webcamCapture = null;

    /* 4. 恢复时间轴 & 控制条可见 */
    document.getElementById('label-timeline')?.classList.remove('hidden');
    controlBar?.show();            // p5 DOM：createDiv().show()
  }

  console.log("📦 handleFile 被调用，file.type:", file?.type);

  /* 若 BlazePose 正在 Webcam 流上检测，先停掉 */
  if (bodyPose && bodyPose.isDetecting) bodyPose.detectStop();

  /* —— 上传新文件前，清空旧标注 —— */
  resetAnnotations();

  /* 只接受视频文件 */
  if (file.type?.startsWith('video')) {
    // 显式创建浏览器本地 URL
    const videoBlobURL = URL.createObjectURL(file);
    video = createVideo([videoBlobURL], videoLoaded);
    video.hide();                   // 隐藏原生 <video>
  } else {
    console.warn("❌ 文件类型不合法，请上传视频文件");
  }
}


function videoLoaded () {
  if (!video) {
    console.warn('video is not loaded');
    return;
  }
  resetAnnotations();   // 二次防护：仅当视频真正加载完

  /* ① 先根据总时长刷新时间刻度文字 */
  updateTimelineLabels();
  console.log('video has been loaded');

    /* ------------ 固定画布尺寸 ------------ */
  vidWidth  = CANVAS_W;
  vidHeight = CANVAS_H;

  if (!window.canvasCreated) {
    const canvas = createCanvas(vidWidth, vidHeight);
    canvas.parent('canvas-container');
    window.canvasCreated = true;
  } else {
    resizeCanvas(vidWidth, vidHeight);
  }


  /* ③ 创建进度条 + 播放按钮行（会生成全局变量 videoSlider / playRow） */
  setupControlBar();

  /* ④ 统一宽度：以 videoSlider 的实际 clientWidth 为准 */
  setTimeout(() => {
    const sliderDOM = videoSlider?.elt;          // p5 <input type="range">
    if (!sliderDOM) return;

    /* A. 用进度条宽度重新计算 PX_PER_SEC */
    const BASE_W = 960;                          // 永远用这条基准
    PX_PER_SEC  = BASE_W / video.duration();     // ← A

    /* B. 把同样宽度同步给所有相关容器 */
    const syncW = BASE_W + 'px';

    /* 这两个 id 都同步一下宽度 */
    document.getElementById('label-timeline').style.width = syncW;
    const oldContainer = document.getElementById('timeline-container');
    const annotBar = document.getElementById('annot-toolbar');


    if (oldContainer) oldContainer.style.width = syncW;
    if (typeof playRow !== 'undefined') playRow.style('width', syncW);
    if (annotBar) annotBar.style.width = syncW;

    /* 让 slider 本身也 960 px */
    videoSlider.style('width', syncW);           // ← C
    /* C. 更新一次时间线（刻度尺、clip、playhead 都会用新的 PX_PER_SEC） */
    updateAnnotationTimeline();
  }, 0); // 下一帧执行，确保 slider 已渲染完


  /* ⑤ 启动骨架检测 */
  video.loop();
  video.volume(0);
  bodyPose.detectStart(video, gotPoses);

  video.elt.addEventListener('timeupdate', () => {
    if (!video || !video.elt) return;   // ← 防守式检查（★新增）

    // videoSlider.value(video.time());
    if(!usingWebcam) videoSlider.value(video.time());
    const ph = document.getElementById('timeline-playhead');
    if (ph) ph.style.left = `${video.time() * PX_PER_SEC}px`;   // 8 = pxPerSec
  });
  

  /* ⑥ 让 canvas 点击即可切换播放/暂停 */
  const canvasEl = document.querySelector('canvas');
  if (canvasEl) {
    canvasEl.style.cursor = 'pointer';
    canvasEl.addEventListener('click', togglePlay);
  }

  console.log('🖼️ canvas ready, pose detection started');
  
  videoTimeHandler = () => {
    if (!usingWebcam || !video) return;
    videoSlider.value(video.time());

    const ph = document.getElementById('timeline-playhead');
    if (ph) ph.style.left = `${video.time() * PX_PER_SEC}px`;
  };
  video.elt.addEventListener('timeupdate', videoTimeHandler);

}


/* ====== 启动摄像头 ====== */
function startWebcam() {
  console.log("🎥 开始使用摄像头…");
  if (bodyPose && bodyPose.isDetecting) bodyPose.detectStop();

  // ① 如果之前在播本地视频，先停掉
  if (video) {
    try { video.stop(); video.remove(); } catch(e){}
    video = null;
  }

  // ② 清理控制条 / 时间轴（可选）
  document.getElementById('label-timeline')?.classList.add('hidden');
  controlBar?.hide();

  // ③ 打开摄像头
  webcamCapture = createCapture(VIDEO, () => {
    console.log("✅ 摄像头已就绪");
    vidWidth  = CANVAS_W;
    vidHeight = CANVAS_H;

    if (!window.canvasCreated) {
      const c = createCanvas(vidWidth, vidHeight);
      c.parent('canvas-container');
      window.canvasCreated = true;
    } else {
      resizeCanvas(vidWidth, vidHeight);
    }

    bodyPose.detectStart(webcamCapture, gotPoses);
    usingWebcam = true;
  });

  // webcamCapture.size(vidWidth, vidHeight);
  webcamCapture.hide();               // 不显示原生 video

  if (video && video.elt && videoTimeHandler) {
    video.elt.removeEventListener('timeupdate', videoTimeHandler);
    videoTimeHandler = null;
  }
  try { video.stop(); video.remove(); } catch(e) {}
  video = null;

}



function modelReady() {
  console.log("BlazePose ready!");
}

function setupControlBar () {
   /* ——— 若已存在旧控件，全部干净移除 ——— */
   if (videoSlider) { videoSlider.remove(); videoSlider = null; }
   if (playRow)     { playRow.remove();     playRow     = null; }
   controlBar.html('');   // 把 controlBar 里残余内容清空
  // ⬇︎ 1. 把控制条放到同一个容器里
  controlBar.parent('canvas-container');

  // ⬇︎ 2. 取消绝对定位，改为普通块状 + 100% 宽
  controlBar.style('position', 'relative');
  controlBar.style('width',     '100%');
  controlBar.style('background','#ddd');
  controlBar.style('display',   'flex');
  controlBar.style('align-items','center');
  controlBar.style('padding',   '6px 10px');
  controlBar.style('gap',       '8px');   // 额外：按钮间距

  // ⬇︎ 3. 不再用 .position()（删掉或注释）
  // controlBar.position(0, vidHeight + 150);

  /* ---- 下面保持不变 ---- */
  videoSlider = createSlider(0, video.duration(), 0, 0.01);
  videoSlider.parent(controlBar);
  videoSlider.style('flex-grow', '1');


  // ⬇︎ 新增：拖动 slider 时，让视频跳到对应时间
  videoSlider.input(() => {
    video.time(videoSlider.value());   // ← 关键一句
  });


  // playButton = createButton('Play / Pause');
  playRow = createDiv();
  playRow.parent('canvas-container'); // 添加到视频底部
  playRow.style('display', 'flex');
  playRow.style('justify-content', 'center');
  playRow.style('marginTop', '4px');

  playButton = createButton('⏯ Play / Pause');
  playButton.parent(playRow);
  playButton.mousePressed(togglePlay);



}

  
// function draw() {
//   // 填充黑色背景
//   background(0);
//   // 绘制视频图像
//   if (usingWebcam && webcamCapture) {
//     // 与原来 video 的绘制逻辑完全相同，只是把数据源换成 webcamCapture
//     const w = webcamCapture.width;
//     const h = webcamCapture.height;
//     const scaleFactor = min(vidWidth / w, vidHeight / h);
//     const sw = w * scaleFactor;
//     const sh = h * scaleFactor;
//     const xOff = (vidWidth  - sw) / 2;
//     const yOff = (vidHeight - sh) / 2;

//     image(webcamCapture, xOff, yOff, sw, sh);

//   } else if (video) {
//     // 获取视频原始尺寸
//     let originalWidth = video.elt.videoWidth;
//     let originalHeight = video.elt.videoHeight;
//     // 计算统一的缩放因子，使视频在保持比例的前提下尽可能填满画布
//     let scaleFactor = min(vidWidth / originalWidth, vidHeight / originalHeight);
//     let scaledWidth = originalWidth * scaleFactor;
//     let scaledHeight = originalHeight * scaleFactor;
//     // 计算偏移量，将视频居中显示
//     let xOffset = (vidWidth - scaledWidth) / 2;
//     let yOffset = (vidHeight - scaledHeight) / 2;
    
//     // 绘制视频，不进行拉伸
//     image(video, xOffset, yOffset, scaledWidth, scaledHeight);
  
  
//     // 自动更新进度条，使其跟随视频播放
//     // if (video && videoSlider && video.time && video.duration) {
//     //   videoSlider.value(video.time());
//     // }
  
//     // 绘制检测到的关键点和骨架连线（按照相同的缩放比例与偏移量）
//     for (let i = 0; i < poses.length; i++) {
//       let pose = poses[i];
      
//       // 绘制骨架连线
//       for (let j = 0; j < connections.length; j++) {
//         let pointA = pose.keypoints[connections[j][0]];
//         let pointB = pose.keypoints[connections[j][1]];
//         if (pointA.confidence > 0.1 && pointB.confidence > 0.1) {
//           stroke(255, 0, 0);
//           strokeWeight(2);
//           line(pointA.x * scaleFactor + xOffset, pointA.y * scaleFactor + yOffset,
//                pointB.x * scaleFactor + xOffset, pointB.y * scaleFactor + yOffset);
//         }
//       }
      
//       // 绘制关键点
//       for (let j = 0; j < pose.keypoints.length; j++) {
//         let keypoint = pose.keypoints[j];
//         if (keypoint.confidence < 0.3) {
//           fill(0, 0, 255);  // 低置信度用蓝色
//           noStroke();
//           circle(keypoint.x * scaleFactor + xOffset, keypoint.y * scaleFactor + yOffset, 12);
//         } else {
//           fill(0, 255, 0);  // 高置信度用绿色
//           noStroke();
//           circle(keypoint.x * scaleFactor + xOffset, keypoint.y * scaleFactor + yOffset, 10);
//         }
//       }
//     }
//   }
// }

function draw() {
  background(0);

  let scaleFactor, xOff, yOff;
  let src = null;

  if (usingWebcam && webcamCapture) {
    const w = webcamCapture.width;
    const h = webcamCapture.height;
    if (w === 0 || h === 0) return;          // 摄像头还没准备好
    scaleFactor = min(vidWidth / w, vidHeight / h);
    src = webcamCapture;
  } else if (video) {
    const w = video.elt.videoWidth;
    const h = video.elt.videoHeight;
    scaleFactor = min(vidWidth / w, vidHeight / h);
    src = video;
  } else {
    return;                                  // 没有任何源
  }

  const sw = src.width  * scaleFactor;
  const sh = src.height * scaleFactor;
  xOff = (vidWidth  - sw) / 2;
  yOff = (vidHeight - sh) / 2;

  image(src, xOff, yOff, sw, sh);

  /* === 进度条只在文件模式更新 === */
  if (!usingWebcam && videoSlider) {
    videoSlider.value(video.time());
  }

  /* === 绘制骨架 & 关键点 === */
  poses.forEach(pose => drawPose(pose, scaleFactor, xOff, yOff));
}

/* 单独封装，避免重复 */
function drawPose(pose, s, xOff, yOff) {
  push();
  stroke(255,0,0); strokeWeight(2);
  for (let c of connections) {
    const A = pose.keypoints[c[0]];
    const B = pose.keypoints[c[1]];
    if (A.confidence>0.1 && B.confidence>0.1) {
      line(A.x*s+xOff, A.y*s+yOff, B.x*s+xOff, B.y*s+yOff);
    }
  }
  noStroke();
  for (let kp of pose.keypoints) {
    const col = (kp.confidence<0.3)? color(0,0,255) : color(0,255,0);
    fill(col);
    circle(kp.x*s+xOff, kp.y*s+yOff, kp.confidence<0.3?12:10);
  }
  pop();
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

    /* ★★★ 把数字写到工具条 ★★★ */
    showProgress(`${frameCount} / ${CAPTURE_FRAMES}`);

    console.log("collecting", collecting, "frameCount", frameCount, "poses.length", poses.length);

    
    // 当录制帧数达到设定值后，结束录制并将数据添加到模型中
    if (frameCount >= CAPTURE_FRAMES) {
      // const startTime = video.time();
      const startTime = collectStartTime;
      const endTime = startTime + (CAPTURE_FRAMES / FPS);

      labeledSegments.push({
        label: collectingLabel,
        start: startTime,
        end: endTime,
      });

      // updateAnnotationTimeline(); // <-- 每次更新 UI
      if(!usingWebcam) updateAnnotationTimeline();

      collecting = false;
      showProgress(`✅ ${CAPTURE_FRAMES} / ${CAPTURE_FRAMES} Done!`);   // ★

      // 确保文件模式下视频仍在播放
      if (!usingWebcam && video && video.elt.paused) {
        video.play();
      }

      classifier.addData(sequence, { label: collectingLabel });
      sequence = [];
      frameCount = 0;

      ///////////////webcamera
      /* ① 统计 & 更新文字 */
      sampleCount++;
      document.getElementById('sample-counter').textContent =
            `${sampleCount} video sample${sampleCount>1?'s':''}`;

      /* ② 取本段的“中间一帧”做缩略图 */
      /* —— 对文件：video.elt.currentTime 刚好在结尾，需要 seek(); webcam 用 capture.get() ——— */
      const thumbW = 80, thumbH = 60;   // 4:3 缩略图尺寸
      let thumbCanvas = createGraphics(thumbW, thumbH);

      if(usingWebcam && webcamCapture){
        // 直接从当前 live 画面抓
        thumbCanvas.image(
          webcamCapture,
          0,0,thumbW,thumbH,
          0,0,webcamCapture.width,webcamCapture.height
        );
      } else if(video){
        const oldT = video.time();
  const midT = (collectStartTime + endTime) / 2;

  /* 第一次 seek：跳到中点抓缩略图 */
  video.time(midT);

  video.elt.onseeked = () => {
    /* 1. 抓缩略图 */
    thumbCanvas.image(
      video, 0, 0, thumbW, thumbH,
      0, 0, video.width, video.height
    );
    /* 2. 取消回调，防止递归触发 */
    video.elt.onseeked = null;
    /* 3. 再 seek 回原来的播放位置 */
    video.time(oldT);
    /* 4. 等最后一次 seek 真正完成，再恢复播放 */
    setTimeout(() => {
      if (video.elt.paused) video.play();
    }, 80);          // 80ms 足够让浏览器触发第二次 onseeked
  };

      }

      /* ③ 转成 <img> */
      /* ③ 创建 <img> 缩略图 */
      /* ③ 创建 <img> 缩略图 */
      const img = document.createElement('img');
      img.width  = thumbW;
      img.height = thumbH;
      img.src    = thumbCanvas.canvas.toDataURL();
      img.style.cursor = 'pointer';

      /* 挂上开始时间，文件模式预览用 */
      img._startTimeSec = collectStartTime;

      /* 一个定时器句柄，用来“单击延迟” */
      let clickTimer = null;

      /* ④ 单击：先开启延迟，200 ms 后再决定是否执行 */
      img.addEventListener('click', e => {
        if (clickTimer) return;             // 已经在等待 ⇒ 忽略
        clickTimer = setTimeout(() => {
          clickTimer = null;                // 清掉句柄
          /* ← 真正的单击逻辑 */
          if (usingWebcam) {
            alert('Webcam sample preview TODO');
          } else {
            video.time(img._startTimeSec);
          }
        }, 200);                            // 200 ms 内若触发 dblclick 会取消
      });

      /* ⑤ 双击：先取消等待中的单击，再删除缩略图 */
      img.addEventListener('dblclick', e => {
        e.stopPropagation();
        clearTimeout(clickTimer);           // 阻止单击回调
        clickTimer = null;
        removeThumbnail(img);               // DOM + 计数同步
      });

      /* ⑥ 加到 strip 并记到数组 */
      document.getElementById('thumb-strip').appendChild(img);
      thumbnails.push(img);

    }
  }
}

// 键盘事件：用于录制、保存数据和训练模型
function keyPressed() {
  if (key === '1') {
    classifier.saveData();
    console.log("Saved data to JSON.");
  }
  else if (key === 'c' || key === 'C') {
    startCollection("Conflict & Tension");
  }
  else if (key === 's' || key === 'S') {
    startCollection("Sad & Inner Struggle");
  }
  else if (key === 'f' || key === 'F') {
    startCollection("Freedom & Liberation");
  
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
    collecting = true;
    collectingLabel = label;
    sequence = [];
    frameCount = 0;
    // collectStartTime  = video.time();     // ★ 关键：此刻就是 start
    collectStartTime  = usingWebcam ? (millis()/1000) : video.time();

    showProgress(`0 / ${CAPTURE_FRAMES}`);   // ← ★ 新增
    console.log(`Recording ${CAPTURE_FRAMES/FPS}s for label=${label}...`);

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

/* 用于安全地写进度文字，element 不存在时什么也不做 */
function showProgress(text){
  const el = document.getElementById('collect-progress');
  if (el) el.textContent = text;
}

/* collect.js 顶部或 updateAnnotationTimeline 里加入 */
function pxVar(name){
  return parseFloat(
    getComputedStyle(document.documentElement)
    .getPropertyValue(name));
}
const rowHeight = pxVar('--timeline-row-h');   // 20
const rowGap    = pxVar('--timeline-row-gap'); // 8

/* 原来那行 top / minHeight 逻辑保持，只换成上面两个变量 */
// clip.style.top      = `${row * (rowHeight + rowGap)}px`;
// track.style.minHeight = `${(row + 1) * rowHeight + row * rowGap}px`;


/* ----------------------------------------------------------
   更新标注时间轴（剪辑软件风格，支持多行堆叠 & 刻度尺）
   依赖：
     - const PX_PER_SEC         // 全局像素/秒缩放因子
     - function renderRuler()   // 负责绘制刻度尺
     - array   labeledSegments  // [{label,start,end}, …]
     - function getSegmentRow() // 行避让算法
     - function getColorForLabel()
     - video.duration() / video.time()
----------------------------------------------------------- */
// function updateAnnotationTimeline () {
//   const container = document.getElementById('label-timeline');
//   if (!container) return;

//   /* 防御：视频尚未就绪 */
//   if (!video || typeof video.duration !== 'function') {
//     container.innerHTML = '';
//     return;
//   }

//   const duration = video.duration();
//   container.innerHTML = '';             // 清空旧 DOM
//   container.style.overflowX = 'auto';   // 允许横向滚动

//   /* ---------- 1. 刻度尺 ---------- */
//   const ruler = document.createElement('div');
//   ruler.id = 'timeline-ruler';
//   ruler.className = 'timeline-ruler';
//   ruler.style.width = `${duration * PX_PER_SEC}px`;  // 让尺子长度随时长
//   container.appendChild(ruler);

//   renderRuler(Math.ceil(duration));                   // 用统一函数绘制尺子

//   /* ---------- 2. 轨道条（支持多行） ---------- */
//   const track = document.createElement('div');
//   track.id = 'track-wrapper';
//   track.className = 'track-wrapper';
//   container.appendChild(track);

//   /* ★ 找到这段，整段替换 */
//   const rowHeight = pxVar('--timeline-row-h');   // 20
//   const rowGap    = pxVar('--timeline-row-gap'); // 8
//   const placedRows = [];          // 行避让占位表

//   labeledSegments.forEach((seg, idx) => {
//     const clip = document.createElement('div');
//     clip.className = 'timeline-clip';

//     /* 位置 & 尺寸（像素制） */
//     clip.style.left  = `${seg.start * PX_PER_SEC}px`;
//     clip.style.width = `${(seg.end - seg.start) * PX_PER_SEC}px`;

//     /* 行避让 */
//     const row = getSegmentRow(seg, placedRows, duration);
//     clip.style.top        = `${row * (rowHeight + rowGap)}px`;
//     track.style.minHeight = `${(row + 1) * rowHeight + row * rowGap}px`;

//     /* 外观 */
//     clip.style.background = getColorForLabel(seg.label);
//     clip.textContent = seg.label;
//     clip.title = `${seg.label}  ${seg.start.toFixed(1)}s–${seg.end.toFixed(1)}s`;

//     /* 交互：点击删除 / 双击跳转 */
//     /* ✦ 修改交互 ✦ */
//     clip.onclick      = () => video.time(seg.start);          // 单击 → seek
//     clip.ondblclick   = e => {                                // 双击 → 删除
//       e.stopPropagation();
//       labeledSegments.splice(idx,1);
//       updateAnnotationTimeline();

//       /* 若存在对应缩略图，也一并删除 */
//       if (idx < thumbnails.length) removeThumbnail(thumbnails[idx]);

//     };

//     track.appendChild(clip);
//   });

//   /* ---------- 3. 播放指针 ---------- */
//   const playhead = document.createElement('div');
//   playhead.id = 'timeline-playhead';
//   playhead.className = 'timeline-playhead';
//   playhead.style.left = `${video.time() * PX_PER_SEC}px`;
//   track.appendChild(playhead);
// }



function getColorForLabel(label) {
  const palette = {
    "Sad & Inner Struggle": "#2196f3",
    "Freedom & Liberation": "#4caf50",
    "Conflict & Tension": "#f44336"
  };
  // return palette[label] || '#888';
  return 'rgba(33, 150, 243, 0.7)'; // 蓝色 + 70% 透明度

}

function updateTimelineLabels() {
  const container = document.getElementById('timeline-labels');
  if (!container || !video || typeof video.duration !== 'function') return;

  const duration = video.duration();
  container.innerHTML = '';

  const steps = 10; // 分10段
  for (let i = 0; i <= steps; i++) {
    const t = (duration / steps) * i;
    const label = document.createElement('div');
    label.textContent = `${t.toFixed(1)}s`;
    label.style.flex = '1';
    label.style.textAlign = 'center';
    container.appendChild(label);
  }
}

// function getSegmentRow(newSeg, placedSegments = [], duration) {
//   let row = 0;
//   while (true) {
//     const overlap = placedSegments[row]?.some(existing => {
//       return !(newSeg.end <= existing.start || newSeg.start >= existing.end);
//     });

//     if (!overlap) break;
//     row++;
//   }

//   if (!placedSegments[row]) placedSegments[row] = [];
//   placedSegments[row].push(newSeg);
//   return row;
// }

function resetAnnotations () {
  labeledSegments = [];          // 清空数组
  updateAnnotationTimeline();    // 立即把时间轴 UI 清零
  showProgress('');              // 进度文字也清空
}


/* 生成刻度尺 */
// function renderRuler(totalSeconds){
//   const ruler = document.getElementById('timeline-ruler');
//   if(!ruler) return;
//   ruler.innerHTML = '';
//   const pxPerSec = PX_PER_SEC;

//   for(let s=0; s<=totalSeconds; s+=TICK_INTERVAL){
//     const tick = document.createElement('div');
//     tick.style.position = 'absolute';
//     tick.style.left = `${s*pxPerSec}px`;
//     tick.style.bottom = '0';
//     tick.style.width  = '1px';
//     tick.style.background = '#9ca3af';    // gray-400
//     tick.style.height = (s % BIG_TICK_EVERY === 0) ? '100%' : '50%';
//     ruler.appendChild(tick);

//     if(s % BIG_TICK_EVERY === 0){
//       const label = document.createElement('span');
//       label.textContent = `${s.toFixed(0)}s`;
//       label.style.position = 'absolute';
//       label.style.left = `${s*pxPerSec+2}px`;
//       label.style.bottom = '-14px';
//       ruler.appendChild(label);
//     }
//   }
// }

function removeThumbnail(img){
  if(!img) return;
  img.remove();                               // 1) DOM
  const idx = thumbnails.indexOf(img);
  if(idx !== -1) thumbnails.splice(idx,1);    // 2) 从数组里删
  sampleCount = Math.max(0, sampleCount-1);   // 3) 计数 & 文本
  document.getElementById('sample-counter').textContent =
        `${sampleCount} video sample${sampleCount!==1?'s':''}`;
}


// 暴露关键控制函数给外部 HTML 使用
window.handleFile = handleFile;
window.startCollection = startCollection;
window.trainModel = () => {
  classifier.normalizeData();
  classifier.train({ epochs: 5 }, finishedTraining);
};
window.exportData = () => {
  classifier.saveData();
};


/* ============================================================
   可在运行期改写 FPS / CAPTURE_FRAMES   —— 直接贴到文件末尾
   ============================================================ */
   function setFpsAndDuration(newFps, newDuration){
    FPS            = newFps;
    CAPTURE_FRAMES = newFps * newDuration;
    console.log(`⚙️ FPS=${FPS}, CAPTURE_FRAMES=${CAPTURE_FRAMES}`);
  }
  window.setFpsAndDuration = setFpsAndDuration;   // ← 一定放到全局
  /* ====== 4. 暴露到全局，给 HTML 调用 ====== */
window.startWebcam = startWebcam;
  

 /* =====================================================================
   统一事件委托：确保任何 Class 卡片（包括动态新增）里的
   ▶ Webcam  ◀ Upload  都能把数据标到正确的 className
===================================================================== */

/* ---- ① 辅助函数：设置当前激活类 ---- */
function setActiveClass(cardEl) {
  if (!cardEl) return;

  // 更新全局标签
  className = cardEl.querySelector('.card-header span').textContent;
  document.getElementById('class-name').textContent = className;

  // 可选：给当前卡片加蓝色描边，提示正在采集
  document.querySelectorAll('.class-card')
          .forEach(c => c.classList.remove('ring-2', 'ring-blue-500'));
  cardEl.classList.add('ring-2', 'ring-blue-500');
}

/* ---- ② 处理 click：Webcam / Upload 按钮 ---- */
document.querySelector('.classes-panel')
  .addEventListener('click', e => {
    const camBtn = e.target.closest('.webcam-btn');
    if (camBtn) {
      const card = camBtn.closest('.class-card');
      setActiveClass(card);
      startWebcam();
      return;
    }

    const upBtn = e.target.closest('.upload-btn');
    if (upBtn) {
      const card = upBtn.closest('.class-card');
      /* 触发隐藏的 <input type=file> */
      card.querySelector('input[type=file]').click();
    }
  });

/* ---- ③ 处理 change：真正拿到上传文件 ---- */
document.querySelector('.classes-panel')
  .addEventListener('change', e => {
    if (e.target.type !== 'file') return;      // 不是 file input
    const file = e.target.files[0];
    if (!file) return;

    const card = e.target.closest('.class-card');
    setActiveClass(card);
    handleFile(file);                          // 原有上传逻辑
  });
