let violin, cello, percussion, reverb, delay;
let chords = [
  ["C", "E", "G", "B"],
  ["D", "F", "A", "C"],
  ["E", "G", "B", "D"],
  ["B", "D", "F#", "A"]
];

function setup() {
  createCanvas(600, 250);
  textAlign(CENTER, CENTER);
  textSize(18);
  fill(255);
  background(0);
  text('Click to play Structured Entrance', width / 2, height / 2);

  violin = new Tone.Sampler({
    urls: {
      C4: "violin_C4_1_forte_arco-normal.mp3",
      E4: "violin_E4_1_forte_con-sord.mp3",
      G4: "violin_G4_1_forte_arco-normal.mp3",
      B4: "violin_B4_1_forte_arco-normal.mp3"
    },
    baseUrl: "music/samples/violin/", volume: -12
  });

  cello = new Tone.Sampler({
    urls: {
      C3: "cello_C3_1_forte_arco-normal.mp3",
      E3: "cello_E3_1_forte_arco-normal.mp3",
      G3: "cello_G3_1_mezzo-piano_arco-normal.mp3",
      B3: "cello_B3_1_fortissimo_arco-normal.mp3"
    },
    baseUrl: "music/samples/cello/", volume: -8
  });

  percussion = new Tone.Sampler({
    urls: {
      C4: "piano-hit-2.wav",
      E4: "cabasa__phrase_mezzo-forte_effect.mp3",
      G4: "wind-chimes__long_mezzo-piano_hand.mp3",
      B4: "woodblock__025_mezzo-forte_struck-singly.mp3"
    },
    baseUrl: "music/samples/percussion/", volume: -10
  });

  reverb = new Tone.Reverb({ decay: 4, wet: 0.3 }).toDestination();
  delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.3, wet: 0.2 }).toDestination();

  [violin, cello, percussion].forEach(inst => inst.connect(reverb).connect(delay));

  Tone.loaded().then(() => Tone.Transport.start());
}

function mousePressed() {
  background(0);
  text('Playing Structured Entrance...', width / 2, height / 2);
  playStructuredEntrance();
}

function playStructuredEntrance() {
  Tone.Transport.stop();
  Tone.Transport.cancel();

  // 打击乐从第0秒开始
  new Tone.Loop((time) => {
    playInstrument(percussion, chords, '4', time, 0.2, 0.9);
  }, "1m").start(0);

  // 小提琴从第16秒（16小节）开始
  new Tone.Loop((time) => {
    playInstrument(violin, chords, '4', time, 0.15, 0.7);
  }, "1m").start("16m");

  // 大提琴从第24秒（24小节）开始
  new Tone.Loop((time) => {
    playInstrument(cello, chords, '3', time, 0.25, 0.8);
  }, "1m").start("24m");

  Tone.Transport.bpm.value = 120; // 1 小节 = 1 秒
  Tone.Transport.start("+0.1");
}

function playInstrument(inst, chords, octave, time, speed, velocity) {
  let chord = random(chords);
  chord.forEach((note, idx) => {
    inst.triggerAttackRelease(note + octave, '8n', time + idx * speed, velocity);
  });
}
