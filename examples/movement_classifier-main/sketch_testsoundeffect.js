let video, poseNet, poses = [];
let celloSynth, padSynth, noiseSynth, reverb, twinkleSynth;

function setup() {
  createCanvas(1920, 1080);
  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  poseNet = ml5.bodyPose("BlazePose", () => console.log("Model Loaded"));
  poseNet.detectStart(video, gotPoses);

  setupSound();
}

async function setupSound() {
  await Tone.start();

  // --- 背景氛围 ---
  // Brown Noise (稳定背景)
  noiseSynth = new Tone.Noise("brown").start();
  const noiseFilter = new Tone.Filter(250, "lowpass");
  const noiseReverb = new Tone.Reverb({ decay: 12, wet: 0.9 });
  noiseSynth.chain(noiseFilter, noiseReverb, Tone.Destination);
  noiseSynth.volume.value = -20;

  // 德彪西Pad（保持原状）
  padSynth = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 2,
    oscillator: { type: "triangle" },
    envelope: { attack: 4, decay: 4, sustain: 0.3, release: 6 },
  });

  const padGain = new Tone.Gain(0.3).toDestination();
  reverb = new Tone.Reverb({ decay: 12, wet: 0.9 });
  padSynth.connect(reverb);
  reverb.connect(padGain);

  Tone.Transport.scheduleRepeat((time) => {
    const chords = [["C3", "Eb3", "G3"], ["F3", "Ab3", "C4"]];
    padSynth.triggerAttackRelease(random(chords), "2n", time);
  }, 8);

  // --- 动作触发层 ---

  // 大提琴 (FM Synth模拟)
  celloSynth = new Tone.FMSynth({
    harmonicity: 1.2,
    modulationIndex: 4,
    oscillator: { type: "triangle" }, // triangle更温暖类似大提琴
    envelope: { attack: 1, decay: 2, sustain: 0.5, release: 3 },
    modulation: { type: "sine" },
    modulationEnvelope: { attack: 0.5, decay: 1, sustain: 0.4, release: 1.5 }
  });
  celloSynth.connect(reverb).connect(new Tone.Gain(0.3).toDestination());

  // Twinkling Synth (表达短暂挣扎)
  twinkleSynth = new Tone.FMSynth({
    harmonicity: 20,
    modulationIndex: 20,
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 1, sustain: 0, release: 1 },
    modulationEnvelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.5 }
  });
  const twinkleGain = new Tone.Gain(0.2);
  const twinkleReverb = new Tone.Reverb({ decay: 6, wet: 0.7 });
  const lowpass = new Tone.Filter(400, "lowpass").toDestination(); // 设定截止频率800Hz，适合降低明亮度
  // 连接链路：Synth → 低通滤波器 → Reverb → Gain → Destination
  twinkleSynth.chain(lowpass, twinkleReverb, twinkleGain);

  Tone.Transport.start();
}

function draw() {
  image(video, 0, 0, width, height);
  drawKeypoints();

  if (poses.length > 0) {
    const pose = poses[0].keypoints;
    const nose = pose[0];
    const leftShoulder = pose[11];
    const rightShoulder = pose[12];

    // 低头程度 (头和肩膀连线比较)
    if (nose.confidence > 0.5 && leftShoulder.confidence > 0.5 && rightShoulder.confidence > 0.5) {
      let shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      let headDrop = shoulderY - nose.y;
      console.log("Head Drop:", headDrop);

      if (headDrop > 250) { // 大幅低头
        celloSynth.triggerAttackRelease("C2", "2n", Tone.now());
      }

      // 身体蜷缩: 双肩距离（肩膀内收）
      let shoulderDist = dist(leftShoulder.x, leftShoulder.y, rightShoulder.x, rightShoulder.y);
      console.log("Shoulder Distance:", shoulderDist);
      if (shoulderDist < 500) { // 身体明显蜷缩
        padSynth.triggerAttackRelease(["F2", "Ab2", "C3"], "2n", Tone.now());
      }

      // 抬头瞬间（短暂希望感）
      if (headDrop < 10) { // 明显抬头
        const twinkleNotes = ["C6", "E6", "G6", "B6", "D7"];
        let randomNote = random(twinkleNotes);
        twinkleSynth.triggerAttackRelease(randomNote, "16n", Tone.now());
      }
    }
  }
}

function gotPoses(results) {
  poses = results;
}

function drawKeypoints() {
  for (let i = 0; i < poses.length; i++) {
    let pose = poses[i];
    for (let j = 0; j < pose.keypoints.length; j++) {
      let kp = pose.keypoints[j];
      if (kp.confidence > 0.5) {
        fill(0, 255, 0);
        noStroke();
        ellipse(kp.x, kp.y, 8, 8);
      }
    }
  }
}

// 点击画布启动声音上下文
function mousePressed() {
  Tone.start();
  console.log("Audio context started");
}
