// 明确定义随机函数（在原生JS环境下）
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

// 定义Tone.js sampler
const percussion = new Tone.Sampler({
  urls: {
    C4: "cabasa/cabasa__phrase_mezzo-forte_effect.mp3",
    E4: "woodblock/woodblock__025_mezzo-forte_struck-singly.mp3",
    G4: "bell tree/bell-tree__long_forte_glissando.mp3",
    B4: "bass drum/bass-drum__1_mezzo-forte_bass-drum-mallet.mp3"
  },
  baseUrl: "music/samples/percussion/"
}).toDestination();

// Conflict随机触发逻辑（修正后的完整版本）
function playConflictSounds() {
  const notes = ["C4", "E4", "G4", "B4"]; // 定义你实际拥有的notes
  const durations = ["16n", "32n"]; // 短促音符
  const interval = randomInRange(1000, 2000); // 每0.5-1秒随机触发一次
  
  percussion.triggerAttackRelease(random(notes), random(durations));

  // 循环随机触发下一次声音
  setTimeout(playConflictSounds, interval);
}

// 页面交互触发启动音频（因为Tone.js需交互事件启动）
document.addEventListener('click', () => {
  Tone.start(); // 启动Tone.js音频上下文
  playConflictSounds();
});
