// 🎯 Sampler 乐器定义 (注意格式已换成mp3)
const piano = new Tone.Sampler({
  urls: {
    C4: "piano.mf.C4.mp3",
    E4: "piano.pp.E4.mp3",
    G4: "piano.ff.G4.mp3"
  },
  baseUrl: "music/samples/piano/"
}).toDestination();

const cello = new Tone.Sampler({
  urls: {
    C3: "cello_C3_15_piano_arco-normal.mp3",
    E3: "cello_E3_1_forte_arco-normal.mp3",
    G3: "cello_G3_1_forte_arco-normal.mp3"
  },
  baseUrl: "music/samples/cello/"
}).toDestination();

const bassoon = new Tone.Sampler({
  urls: {
    C4: "bassoon_Cs4_very-long_cresc-decresc_normal.mp3",
    E4: "bassoon_E4_long_forte_major-trill.mp3",
    G4: "bassoon_G4_very-long_cresc-decresc_normal.mp3"
  },
  baseUrl: "music/samples/bassoon/"
}).toDestination();

// 🎯 工具函数
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

// 🎯 背景稳定节奏（已有音符C4,E4,G4）
function playSteadyRhythm(){
  const rhythmNotes = ["C4", "E4", "G4"];
  let index = 0;

  setInterval(() => {
    piano.triggerAttack(rhythmNotes[index % rhythmNotes.length]);
    console.log(`🎵 Steady Rhythm: piano playing ${rhythmNotes[index % rhythmNotes.length]}`);
    index++;
  }, 1000);
}

// 🎯 随机声音层（加入Silence区间）
async function playRandomLayer(){
  const instruments = [piano, cello, bassoon];
  const notes = {
    cello: ["C3", "E3", "G3"],
    bassoon: ["C4", "E4", "G4"],
    piano: ["C4", "E4", "G4"]
  };

  while(true){
    let numSimultaneousSounds = Math.floor(randomInRange(2,5));
    for(let i = 0; i < numSimultaneousSounds; i++){
      let instrument = random(instruments);
      let name = instrument === piano ? 'Piano' : instrument === cello ? 'Cello' : 'Bassoon';
      let note = random(notes[name.toLowerCase()]);

      instrument.triggerAttackRelease(note, '4n'); // 四分音符时长
      console.log(`🎶 Random Layer: ${name} playing note ${note}`);
    }

    let silenceDuration = randomInRange(2000,5000);
    console.log(`🔇 Silence for ${silenceDuration / 1000} seconds`);
    await new Promise(resolve => setTimeout(resolve, silenceDuration));
  }
}

// 🎯 启动音频（完整确保加载）
document.addEventListener('click', async () => {
  await Tone.start();
  await Promise.all([piano.loaded, cello.loaded, bassoon.loaded]);
  console.log("✅ Audio Context & Samples Loaded!");

  playSteadyRhythm();
  playRandomLayer();
});
