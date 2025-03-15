import json
import numpy as np
import matplotlib.pyplot as plt
import math
import librosa
import librosa.display

# 参数设置
fps = 30                      # 帧率
expected_frames = 150         # 每个样本期望的帧数（20秒）
dt = 1 / fps                  # 每帧时间间隔

#########################################
# 以下函数与原代码保持一致
#########################################

def compute_representative_points(frames):
    """
    给定一组帧数据，每帧数据为字典，包含 "x0", "y0", ..., "x32", "y32"，
    计算每帧的代表点（所有关节 x 坐标和 y 坐标的平均值）。
    返回一个列表，每个元素为字典 {"x": avg_x, "y": avg_y}。
    """
    rep_points = []
    for frame in frames:
        xs = []
        ys = []
        # 假设每帧有33个关节，编号0到32
        for i in range(33):
            key_x = f"x{i}"
            key_y = f"y{i}"
            if key_x in frame and key_y in frame:
                xs.append(frame[key_x])
                ys.append(frame[key_y])
        if xs and ys:
            rep_points.append({"x": np.mean(xs), "y": np.mean(ys)})
    return rep_points

def compute_features(rep_points):
    """
    给定代表点列表，计算速度和加速度：
      - 速度：连续帧之间代表点距离除以 dt
      - 加速度：相邻速度之差除以 dt
    """
    if len(rep_points) < 2:
        return None, None
    velocities = [
        math.sqrt((rep_points[i+1]["x"] - rep_points[i]["x"])**2 +
                  (rep_points[i+1]["y"] - rep_points[i]["y"])**2) / dt
        for i in range(len(rep_points) - 1)
    ]
    if len(velocities) < 2:
        accelerations = []
    else:
        accelerations = [(velocities[i+1] - velocities[i]) / dt for i in range(len(velocities) - 1)]
    return velocities, accelerations

def load_samples(filename):
    """
    加载指定 JSON 文件中的所有样本，并返回每个样本的代表点列表（取前 expected_frames 帧）。
    JSON 文件格式示例：
    {
      "data": [
        {
          "xs": [
             { "x0":396.53, "y0":82.67, ..., "x32":0, "y32":0 },
             { "x0":398.00, "y0":84.34, ..., "x32":0, "y32":0 },
             // ... more frames ...
          ],
          "ys": { "label": "A" }
        }
        // ... more samples ...
      ]
    }
    """
    samples_points = []
    with open(filename, "r", encoding="utf-8") as f:
        data = json.load(f)
    for sample in data.get("data", []):
        frames = sample.get("xs", [])
        rep_points = compute_representative_points(frames)
        if len(rep_points) < expected_frames:
            print(f"Warning: In file {filename}, one sample has less than {expected_frames} frames.")
        samples_points.append(rep_points[:expected_frames])
    return samples_points

#########################################
# 新增：对单个样本做 STFT 分析，绘制动作频率谱图
#########################################

# 选择一个文件（你可以更换为其他文件名）
filename = 'data/test_600frame_A.json'
samples = load_samples(filename)
if len(samples) == 0:
    print("未能加载任何样本。")
    exit(1)

# 选取第一个样本（20秒数据）
rep_points = samples[0]

# 计算速度和加速度
velocities, accelerations = compute_features(rep_points)
# 转换加速度为 NumPy 数组
acc_signal = np.array(accelerations)  
# 注意：acc_signal 的长度为 expected_frames - 2

# 使用 librosa 对加速度信号做 STFT 分析
# 参数 n_fft 与 hop_length 可根据具体需求调整
n_fft = 32     # 窗口大小（帧数）
hop_length = 4 # 每次移动的帧数

stft_result = librosa.stft(acc_signal, n_fft=n_fft, hop_length=hop_length)
spectrogram = np.abs(stft_result)
spectrogram_db = librosa.amplitude_to_db(spectrogram, ref=np.max)

# 绘制动作频率谱图
plt.figure(figsize=(10, 4))
# sr=fps 表示采样率为 fps（30Hz），因此频率单位为 Hz（Nyquist上限15Hz）
librosa.display.specshow(spectrogram_db, sr=fps, hop_length=hop_length,
                         x_axis='time', y_axis='linear', cmap='magma')
plt.title("Spectrogram of Acceleration Signal (Motion Frequency)")
plt.xlabel("Time (s)")
plt.ylabel("Motion Frequency (Hz)")
cbar = plt.colorbar(format='%+2.0f dB')
cbar.set_label("Acceleration Energy (dB)")
plt.tight_layout()
plt.show()
