// 加载音乐并设置播放器
const player = new Tone.Player("music/environment/GlideUptempoPiano_EnergeticLoop.wav").toDestination();

// 创建PitchShift节点，用于升降音调
const pitchShift = new Tone.PitchShift().toDestination();

// 连接音频链路: player → pitchShift → 输出
player.connect(pitchShift);

// 定义情绪音乐播放函数
async function playEmotion(emotion) {
    await Tone.start(); // 确保音频上下文启动
    player.stop();      // 先停止上一次的播放
    
    // 根据情绪设置音调(pitch)和播放速度
    if (emotion === 'sadness') {
        pitchShift.pitch = -3;        // 降低3个半音
        player.playbackRate = 0.8;    // 缓慢
    } else if (emotion === 'conflict') {
        pitchShift.pitch = 1;         // 升高1个半音
        player.playbackRate = 1.2;    // 较快
    } else if (emotion === 'freedom') {
        pitchShift.pitch = 3;         // 升高3个半音
        player.playbackRate = 1.0;    // 正常速度
    }

    player.start(); // 开始播放音乐
}

// 键盘按键监听事件（修正明确使用 '1' 字符串）
document.addEventListener('keypress', (event) => {
    if (event.key === '1') {
        playEmotion('sadness');
    } else if (event.key === '2') {
        playEmotion('conflict');
    } else if (event.key === '3') {
        playEmotion('freedom');
    }
});
