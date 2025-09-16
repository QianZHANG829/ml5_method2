// js/preview.js  —— 基于你的原始写法，使用 p5 instance 模式挂在 Preview 面板
(function () {
  const overlayEl    = document.getElementById("pv-overlay");
  const modelNameEl  = document.getElementById("pv-modelname");
  const sourceNameEl = document.getElementById("pv-sourcename");
  const textEl       = document.getElementById("pv-textresults");
  const btnWebcam    = document.getElementById("pv-btn-webcam");
  const btnUpload    = document.getElementById("pv-btn-upload");
  const fileInput    = document.getElementById("pv-file");
  const host         = document.getElementById("pv-canvas-host");

  let MODEL_URL = (document.getElementById("pv-config")?.dataset?.modelUrl) || "";
  let started = false;

  // 与 collect.js 同步 fps × duration
  function readConfig() {
    const fallback = { fps: 30, durationSec: 15 };
    const c = (window.__tvConfig || fallback);
    const fps = Number(c.fps) > 0 ? Number(c.fps) : fallback.fps;
    const durationSec = Number(c.durationSec) > 0 ? Number(c.durationSec) : fallback.durationSec;
    return {
      fps,
      durationSec,
      frameIntervalMs: Math.round(1000 / fps),
      captureFrames: Math.round(fps * durationSec),
    };
  }
  let CONFIG = readConfig();
  window.addEventListener("tv-config-changed", () => {
    CONFIG = readConfig();
  });

  function showOverlay(t){ if(overlayEl){ overlayEl.textContent=t||"加载中…"; overlayEl.classList.remove("hidden"); } }
  function hideOverlay(){ overlayEl?.classList.add("hidden"); }

  // ---------------- p5 实例（复用你的原始变量/函数） ----------------
  let sketch = (p) => {
    // ==== 你的原始变量（作用域限定在这个 p5 实例里） ====
    let vidWidth = 640, vidHeight = 360;
    let video, bodyPose, poses = [], connections;
    let poseLabelEmotion = "", confidence = "";
    let classifierEmotion;
    let sequence = []; let frameCount = 0;
    let detecting = false;
    let usingCamera = false;

    // 这两个供外部按钮调用
    p.useWebcam = async function() {
      try{
        showOverlay("正在打开摄像头…");
        // 摄像头
        const constraints = { video: { width:{ideal:1280}, height:{ideal:720} }, audio:false };
        video = p.createCapture(constraints, () => {});
        video.hide();
        usingCamera = true;
        sourceNameEl && (sourceNameEl.textContent = "Webcam");

        // 画布大小跟随容器
        const w = host.clientWidth || 640;
        const h = Math.round(w * 9 / 16);
        vidWidth = w; vidHeight = h;

        // 创建/调整画布
        if (!p._created) {
          p.createCanvas(vidWidth, vidHeight).parent(host);
          p._created = true;
        } else {
          p.resizeCanvas(vidWidth, vidHeight);
        }

        // 姿态模型
        showOverlay("正在加载姿态模型…");
        bodyPose = ml5.bodyPose("BlazePose", () => {
          connections = bodyPose.getSkeleton();
          bodyPose.detectStart(video, gotPoses);
        });

        // 分类模型（优先内存实例）
        showOverlay("正在加载分类模型…");
        await ensureClassifierLoaded();
        modelNameEl && (modelNameEl.textContent = window.__tvModelName || modelNameEl.textContent);

        hideOverlay();
        setPreviewActive(true);  // 👈 加这里
        
        started = true;
        startDetection(); // 默认开始
        

      }catch(e){
        showOverlay("Webcam 启动失败：" + (e?.message||e));
        console.error(e);
      }
      setPreviewActive(true);

    };

    p.useFile = async function(file){
      try{
        if (!file) return;
        showOverlay("正在载入视频…");
        const blobURL = URL.createObjectURL(file);
        video = p.createVideo([blobURL], () => {});
        video.loop(); video.volume(0); video.hide();
        usingCamera = false;
        sourceNameEl && (sourceNameEl.textContent = file.name || "Uploaded video");

        const w = host.clientWidth || 640;
        const h = Math.round(w * 9 / 16);
        vidWidth = w; vidHeight = h;
        if (!p._created) { p.createCanvas(vidWidth, vidHeight).parent(host); p._created = true; }
        else { p.resizeCanvas(vidWidth, vidHeight); }

        showOverlay("正在加载姿态模型…");
        bodyPose = ml5.bodyPose("BlazePose", () => {
          connections = bodyPose.getSkeleton();
          bodyPose.detectStart(video, gotPoses);
        });

        showOverlay("正在加载分类模型…");
        await ensureClassifierLoaded();
        modelNameEl && (modelNameEl.textContent = window.__tvModelName || modelNameEl.textContent);

        hideOverlay();
        setPreviewActive(true);  // 👈 加这里
        started = true;
        startDetection();
        
      }catch(e){
        showOverlay("视频预览失败：" + (e?.message||e));
      }
      

    };

    p.setup = function(){ /* 画布在 useWebcam/useFile 里创建 */ };

    p.draw = function() {
      if (!video) return;
      p.background(0);

      // 按比例绘制视频
      const ow = video.width || video.elt?.videoWidth || vidWidth;
      const oh = video.height|| video.elt?.videoHeight|| vidHeight;
      const s = Math.min(vidWidth/ow, vidHeight/oh);
      const sw = ow * s, sh = oh * s;
      const xOff = (vidWidth - sw)/2, yOff = (vidHeight - sh)/2;
      p.image(video, xOff, yOff, sw, sh);

      // 画骨架 + 点（与你原代码一致）
      if (poses && connections){
        for (let pose of poses){
          // 连线
          p.stroke(255,0,0); p.strokeWeight(2);
          for (let [a,b] of connections){
            const A = pose.keypoints[a], B = pose.keypoints[b];
            if ((A.confidence||A.score)>0.1 && (B.confidence||B.score)>0.1){
              p.line(A.x*s + xOff, A.y*s + yOff, B.x*s + xOff, B.y*s + yOff);
            }
          }
          // 点
          for (let kp of pose.keypoints){
            const good = (kp.confidence||kp.score) >= 0.3;
            p.noStroke(); p.fill(good? p.color(0,255,0): p.color(0,0,255));
            p.circle(kp.x*s + xOff, kp.y*s + yOff, good?10:12);
          }
        }
      }

      // 左上角显示模型名（保留你的风格）
      p.fill(255,0,255); p.textSize(16); p.textAlign(p.LEFT, p.TOP);
      if (modelNameEl?.textContent) p.text(modelNameEl.textContent, 10, 8);
    };

    function gotPoses(results){ poses = results || []; }

    // ====== 分类：滑动窗口（fps×duration），与训练特征一致 ======
    function startDetection(){
      poseLabelEmotion = ""; confidence = "";
      sequence = []; frameCount = 0; detecting = true;
      loopPredict();
    }
    function stopDetection(){ detecting = false; }

    function loopPredict(){
      if (!detecting) return;
      if (poses.length > 0){
        const pose = poses[0];
        // 当前帧 → x0,y0,...,x32,y32
        const f = {};
        for (let i=0; i<33; i++){
          f["x"+i] = pose.keypoints[i]?.x || 0;
          f["y"+i] = pose.keypoints[i]?.y || 0;
        }
        // 滑窗
        if (sequence.length < CONFIG.captureFrames) sequence.push(f);
        else { sequence.shift(); sequence.push(f); }
        frameCount++;

        // 满窗 → 分类
        if (frameCount % CONFIG.captureFrames === 0 && sequence.length >= CONFIG.captureFrames){
          const feats = (typeof window.__tvFeatureExtractor === "function")
            ? window.__tvFeatureExtractor(sequence)
            : normalize1920x1080(sequence);
          classifierEmotion.classify(feats, onResults);
        }
      }
      setTimeout(loopPredict, CONFIG.frameIntervalMs);
    }

    function onResults(res){
      if (!res || !res.length) return;
      // 文字行：Class 1 = 0.80, Class 2 = 0.20
      const line = res.map(r => `${r.label} = ${(Number(r.confidence)||0).toFixed(2)}`).join(", ");
      textEl && (textEl.textContent = line);

      // 也保留你的中心大字（如果要在画布上显示，打开下面两行）
      // poseLabelEmotion = res[0].label;
      // confidence = "Confidence: " + (Number(res[0].confidence)||0).toFixed(2);
    }

    function normalize1920x1080(frames){
      const out = [];
      for (let i=0; i<frames.length; i++){
        const o={}, src=frames[i];
        for (let j=0;j<33;j++){
          o["x"+j] = (src["x"+j]||0)/1920;
          o["y"+j] = (src["y"+j]||0)/1080;
        }
        out.push(o);
      }
      return out;
    }

    async function ensureClassifierLoaded(){
    // ✅ 优先使用内存实例
    if (window.__tvModelInstance && typeof window.__tvModelInstance.classify === "function") {
        classifierEmotion = window.__tvModelInstance;
        modelNameEl && (modelNameEl.textContent = window.__tvModelName || "In-memory model");
        return;
    }

    // ✅ 其次，使用内存对象（需要你从 collect 页暴露 window.__tvModel）
    if (window.__tvModel) {
        classifierEmotion = ml5.timeSeries({ task:"classification", dataMode:"spatial", debug:false });
        await new Promise((res, rej) => classifierEmotion.load(window.__tvModel, res, rej));
        modelNameEl && (modelNameEl.textContent = "In-memory object");
        return;
    }

    // 最后 fallback 到硬编码的模型文件（不推荐）
    classifierEmotion = ml5.timeSeries({ task:"classification", dataMode:"spatial", debug:false });
    const src = MODEL_URL || {
        model: "model/Model_Emotion_test10.1/model.json",
        metadata: "model/Model_Emotion_test10.1/model_meta.json",
        weights: "model/Model_Emotion_test10.1/model.weights.bin"
    };
    await new Promise((res, rej) => classifierEmotion.load(src, res, rej));
    modelNameEl && (modelNameEl.textContent = typeof src === "string" ? src : src.model);
    }

  };

  // 创建 p5 实例，挂在预览卡片
  let p5Instance = null;
  function ensureSketch(){
    if (p5Instance) return p5Instance;
    p5Instance = new p5(sketch, host);
    return p5Instance;
  }

  // 事件绑定（委托）
  document.addEventListener("click", (e)=>{
    const webcamBtn = e.target.closest("#pv-btn-webcam");
    const uploadBtn = e.target.closest("#pv-btn-upload");
    if (webcamBtn){
      e.preventDefault();
      ensureSketch().useWebcam();
    }
    if (uploadBtn && fileInput){
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput && fileInput.addEventListener("change", (e)=>{
    const f = e.target.files && e.target.files[0];
    if (f) ensureSketch().useFile(f);
    fileInput.value = "";
  });

  // 暴露调试
  window.__pvUseWebcam = ()=> ensureSketch().useWebcam();
  window.__pvUseFile   = (f)=> ensureSketch().useFile(f);
  console.log("[Preview] p5-instance ready");
})();

// 切换 Preview 运行态：隐藏/显示采集区 + 放大/还原预览卡片
function setPreviewActive(active) {
  // 1) 隐藏/显示 collect 区域（下方大视频/工具条/时间轴）
  ["canvas-container", "annot-toolbar", "label-timeline"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden-by-preview", !!active);
  });

  // 2) 放大/还原右侧 Preview 卡片
  const wrap = document.getElementById("preview");      // 预览面板根节点（pv-wrap）
  if (wrap) wrap.classList.toggle("is-wide", !!active);
}

