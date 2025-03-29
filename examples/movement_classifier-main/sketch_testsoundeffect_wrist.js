let video, poseNet, poses = [];
let fmSynth, reverb, noiseSynth, padSynth;
// let prevWrist, prevSpeed = 0, smoothedAccel = 0;
let prevWrist, prevSpeed = 0, smoothedAccel = 0;

function setup() {
  createCanvas(1920, 1080);
  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  poseNet = ml5.bodyPose("BlazePose", () => console.log("Model Loaded"));
  poseNet.detectStart(video, gotPoses);

  setupSynths();
}

async function setupSynths() {
  await Tone.start();

  // 背景噪声（保持原状）
  const noise = new Tone.Noise("brown").start();
  const noiseFilter = new Tone.Filter(300, "lowpass");
  const noiseReverb = new Tone.Reverb({ decay: 12, wet: 0.9 });
  noise.chain(noiseFilter, noiseReverb, Tone.Destination);
  noise.volume.value = -20;

  Tone.Transport.scheduleRepeat((time) => {
    noiseFilter.frequency.linearRampTo(200 + Math.random() * 500, 10, time);
  }, 12);

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

  // 🎻 弦乐 Synth (Cello 大提琴)
  fmSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.8, decay: 1.5, sustain: 0.4, release: 2.5 },
  });

  // 低通滤波，进一步柔化声音
  const celloFilter = new Tone.Filter(400, "lowpass").toDestination();

  // Reverb让声音更柔和宽广
  const celloReverb = new Tone.Reverb({ decay: 10, wet: 0.7 });

  // Gain 控制整体音量（避免过响）
  const celloGain = new Tone.Gain(0.4).toDestination();

  // 连接顺序: fmSynth → celloFilter → celloReverb → celloGain
  fmSynth.chain(celloFilter, celloReverb, celloGain);

  Tone.Transport.start();
}


  function triggerFMSynth(smoothedAccel) {
    let freq = map(smoothedAccel, 1, 80, 300, 800, true); // 
    let vol = map(smoothedAccel, 1, 80, -25, -15, true);
    
    fmSynth.volume.value = vol;
    fmSynth.triggerAttackRelease(freq, "8n", Tone.now() + 0.05);
    
    console.log("Triggering Brass FM Synth, freq:", freq, "vol:", vol);
  }
  
  
  function draw() {
    image(video, 0, 0, width, height);
    drawKeypoints();
  
    if (poses.length > 0) {
      const pose = poses[0].keypoints;
      const leftWrist = pose[15];
      const rightWrist = pose[16];
  
      if (leftWrist.confidence > 0.5 && rightWrist.confidence > 0.5) {
        let wrist = {
          x: (leftWrist.x + rightWrist.x) / 2,
          y: (leftWrist.y + rightWrist.y) / 2
        };
  
        if(prevWrist) {
          let speed = dist(wrist.x, wrist.y, prevWrist.x, prevWrist.y);
          let accel = abs(speed - prevSpeed); 
          smoothedAccel = lerp(smoothedAccel, accel, 0.1);
          console.log("smoothedAccel_origin: " + smoothedAccel);
  
          if(abs(smoothedAccel) > 50) {
            triggerFMSynth(smoothedAccel);
          }
        }
  
        prevSpeed = dist(wrist.x, wrist.y, prevWrist ? prevWrist.x : wrist.x, prevWrist ? prevWrist.y : wrist.y);
        prevWrist = wrist;
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
  
  function mousePressed() {
    Tone.start();
    console.log("Audio context started");
  }