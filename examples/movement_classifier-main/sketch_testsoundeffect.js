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
  
    const noise = new Tone.Noise("brown").start();
    const noiseFilter = new Tone.Filter(300, "lowpass");
    const noiseReverb = new Tone.Reverb({ decay: 12, wet: 0.9 });
    noise.chain(noiseFilter, noiseReverb, Tone.Destination);
    noise.volume.value = -20;
  
    Tone.Transport.scheduleRepeat((time) => {
      noiseFilter.frequency.linearRampTo(200 + Math.random() * 500, 10, time);
    }, 12);
  
    padSynth = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2,
      oscillator: { type: "triangle" },
      envelope: { attack: 4, decay: 4, sustain: 0.3, release: 6 },
    });

    // 创建 Gain 节点控制整体音量（比如降低为原来的一半：0.5）
    const padGain = new Tone.Gain(0.3).toDestination();

    // 连接方式修改为 padSynth → reverb → padGain → destination
    reverb = new Tone.Reverb({ decay: 12, wet: 0.9 });
    padSynth.connect(reverb);
    reverb.connect(padGain);
    
    // 自动每6秒触发一次德彪西风格和弦
    Tone.Transport.scheduleRepeat((time) => {
      const chords = [["C3", "Eb3", "G3"], ["F3", "Ab3", "C4"]];
      let chord = random(chords);
      padSynth.triggerAttackRelease(chord, "1n", time);
    }, 16);
  
    fmSynth = new Tone.FMSynth({
      harmonicity: 5,
      modulationIndex: 10,
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 1 },
      modulation: { type: "triangle" },
      modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.1, release: 0.5 }
    });
    fmSynth.connect(reverb);
  
    Tone.Transport.start();
  }
  
  function triggerFMSynth(smoothedAccel) {
    let freq = map(smoothedAccel, 10, 40, 200, 800, true);
    let vol = map(abs(smoothedAccel), 2, 20, -5, -5, true);
   
    fmSynth.volume.value = vol;
    fmSynth.triggerAttackRelease(freq, "16n", Tone.now() + 0.05);
    console.log("smoothedaccel:" + smoothedAccel + "Triggering FM Synth with frequency: " + freq + " and volume: " + vol);
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
          let accel = speed - prevSpeed; 
          smoothedAccel = lerp(smoothedAccel, accel, 0.1);
  
          if(abs(smoothedAccel) > 2) {
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