# import json
# import numpy as np
# import matplotlib.pyplot as plt
# import math
# from matplotlib.widgets import Slider

# # 参数设置
# fps = 30                      # 帧率
# expected_frames = 600         # 每个样本期望的帧数
# dt = 1 / fps
# total_time = (expected_frames - 1) * dt
# window_size = 2  # 初始显示的时间窗口（秒）

# def compute_representative_points(frames):
#     """
#     给定一组帧数据，每帧数据为字典，包含 "x0", "y0", ..., "x32", "y32"，
#     计算每帧的代表点（所有关节 x 坐标和 y 坐标的平均值）。
#     返回一个列表，每个元素为字典 {"x": avg_x, "y": avg_y}。
#     """
#     rep_points = []
#     for frame in frames:
#         xs = []
#         ys = []
#         # 假设每帧有33个关节，编号0到32
#         for i in range(33):
#             key_x = f"x{i}"
#             key_y = f"y{i}"
#             if key_x in frame and key_y in frame:
#                 xs.append(frame[key_x])
#                 ys.append(frame[key_y])
#         if xs and ys:
#             rep_points.append({"x": np.mean(xs), "y": np.mean(ys)})
#     return rep_points

# def compute_features(rep_points):
#     """
#     给定代表点列表，计算速度和加速度：
#       - 速度：连续帧之间代表点距离除以 dt
#       - 加速度：相邻速度之差除以 dt
#     """
#     if len(rep_points) < 2:
#         return None, None
#     velocities = [
#         math.sqrt((rep_points[i+1]["x"] - rep_points[i]["x"])**2 + 
#                   (rep_points[i+1]["y"] - rep_points[i]["y"])**2) / dt
#         for i in range(len(rep_points)-1)
#     ]
#     if len(velocities) < 2:
#         accelerations = []
#     else:
#         accelerations = [(velocities[i+1] - velocities[i]) / dt for i in range(len(velocities)-1)]
#     return velocities, accelerations

# def load_samples(filename):
#     """
#     加载指定 JSON 文件中的所有样本，并返回每个样本的代表点列表（取前 expected_frames 帧）。
#     JSON 文件格式示例：
#     {
#       "data": [
#         {
#           "xs": [
#              { "x0":396.53, "y0":82.67, ..., "x32":0, "y32":0 },
#              { "x0":398.00, "y0":84.34, ..., "x32":0, "y32":0 },
#              // ... more frames ...
#           ],
#           "ys": { "label": "A" }
#         }
#         // ... more samples ...
#       ]
#     }
#     """
#     samples_points = []
#     with open(filename, "r", encoding="utf-8") as f:
#         data = json.load(f)
#     for sample in data.get("data", []):
#         frames = sample.get("xs", [])
#         rep_points = compute_representative_points(frames)
#         if len(rep_points) < expected_frames:
#             print(f"Warning: In file {filename}, one sample has less than {expected_frames} frames.")
#         samples_points.append(rep_points[:expected_frames])
#     return samples_points

# def process_files(file_list):
#     """
#     处理一组文件，计算每个样本的速度和加速度，
#     并返回所有样本的速度和加速度列表。
#     """
#     all_velocities = []
#     all_accelerations = []
#     for fname in file_list:
#         samples = load_samples(fname)
#         for rep_points in samples:
#             vel, acc = compute_features(rep_points)
#             if vel is not None and acc is not None:
#                 all_velocities.append(np.array(vel))
#                 all_accelerations.append(np.array(acc))
#     return all_velocities, all_accelerations

# # 指定文件名列表
# fileNames_A = [
#     # 'test4_A600frame_glideComR_10set5.json',
#     # 'test4_A600frame_glideComR_10set4.json',
#     # 'test4_A600frame_glideComR_10set3.json',
#     # 'test4_A600frame_glideComR_10set2.json',
#     'test4_A600frame_glideComR_10set1.json'
# ]

# fileNames_B = [
#     # 'test5_B600frame_glideComR_QuickStrong_20set2.json',
#     'test5_B600frame_glideComR_QuickStrong_10set3.json',
#     # 'test5_B600frame_glideComR_QuickStrong_10set4.json',
#     # 'test5_B600frame_glideComR_QuickStrong_10set5.json'
# ]

# # 分别处理标签 A 和标签 B 的文件
# velocities_A, accelerations_A = process_files(fileNames_A)
# velocities_B, accelerations_B = process_files(fileNames_B)

# if not velocities_A or not velocities_B:
#     print("没有足够的有效样本来计算平均速度。")
#     exit(1)

# # 计算各标签样本的平均速度与加速度曲线
# avg_velocity_A = np.mean(velocities_A, axis=0)
# avg_velocity_B = np.mean(velocities_B, axis=0)
# avg_acceleration_A = np.mean(accelerations_A, axis=0)
# avg_acceleration_B = np.mean(accelerations_B, axis=0)

# # 生成时间轴
# time_velocity = np.linspace(0, (expected_frames - 1)*dt, expected_frames - 1)
# time_acceleration = np.linspace(0, (expected_frames - 2)*dt, expected_frames - 2)

# # 绘图及添加 Slider
# fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
# plt.subplots_adjust(bottom=0.15)

# # 绘制速度曲线
# lineA_v, = ax1.plot(time_velocity, avg_velocity_A, label="Label A", color="blue")
# lineB_v, = ax1.plot(time_velocity, avg_velocity_B, label="Label B", color="green")
# ax1.set_title("Average Velocity Curve")
# ax1.set_xlabel("Time (s)")
# ax1.set_ylabel("Velocity (units/s)")
# ax1.legend()
# ax1.set_xlim(0, window_size)

# # 绘制加速度曲线
# lineA_a, = ax2.plot(time_acceleration, avg_acceleration_A, label="Label A", color="blue")
# lineB_a, = ax2.plot(time_acceleration, avg_acceleration_B, label="Label B", color="green")
# ax2.set_title("Average Acceleration Curve")
# ax2.set_xlabel("Time (s)")
# ax2.set_ylabel("Acceleration (units/s²)")
# ax2.legend()
# ax2.set_xlim(0, window_size)

# # 添加 Slider 控件
# slider_ax = fig.add_axes([0.15, 0.02, 0.7, 0.03])
# scroll_slider = Slider(
#     ax=slider_ax,
#     label='Scroll',
#     valmin=0,
#     valmax=time_velocity[-1] - window_size,
#     valinit=0,
#     valstep=0.1
# )

# def update(val):
#     start = scroll_slider.val
#     ax1.set_xlim(start, start + window_size)
#     ax2.set_xlim(start, start + window_size)
#     fig.canvas.draw_idle()

# scroll_slider.on_changed(update)
# plt.show()


import json
import numpy as np
import matplotlib.pyplot as plt
import math
from matplotlib.widgets import Slider
import matplotlib.ticker as ticker

# 参数设置
fps = 30                      # 帧率
expected_frames = 600         # 每个样本期望的帧数
dt = 1 / fps                  # 每帧的时间间隔
total_time = (expected_frames - 1) * dt  # 总时长（对应速度数组）
window_size = 20               # 初始显示的时间窗口（秒）

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

def process_files(file_list):
    """
    处理一组文件，计算每个样本的速度和加速度，
    并返回所有样本的速度和加速度列表。
    """
    all_velocities = []
    all_accelerations = []
    for fname in file_list:
        samples = load_samples(fname)
        for rep_points in samples:
            vel, acc = compute_features(rep_points)
            if vel is not None and acc is not None:
                all_velocities.append(np.array(vel))
                all_accelerations.append(np.array(acc))
    return all_velocities, all_accelerations

# 指定文件名列表（确保 JSON 文件与此脚本在同一工作目录下）
fileNames_A = [
    
    # ///label a///
    'test4_A600frame_glideComR_10set5.json',
    'test4_A600frame_glideComR_10set4.json',
    'test4_A600frame_glideComR_10set3.json',
    'test4_A600frame_glideComR_10set2.json',
    'test4_A600frame_glideComR_10set1.json',

    
]

fileNames_B = [
    # ///label b///
    'test5_B600frame_glideComR_QuickStrong_20set2.json',
    'test5_B600frame_glideComR_QuickStrong_10set3.json',
    'test5_B600frame_glideComR_QuickStrong_10set4.json',
    'test5_B600frame_glideComR_QuickStrong_10set5.json'
]

# 分别处理标签 A 和标签 B 的文件
velocities_A, accelerations_A = process_files(fileNames_A)
velocities_B, accelerations_B = process_files(fileNames_B)

if not velocities_A or not velocities_B:
    print("没有足够的有效样本来计算平均速度。")
    exit(1)

# 计算各标签样本的平均速度与加速度曲线
avg_velocity_A = np.mean(velocities_A, axis=0)
avg_velocity_B = np.mean(velocities_B, axis=0)
avg_acceleration_A = np.mean(accelerations_A, axis=0)
avg_acceleration_B = np.mean(accelerations_B, axis=0)

# 生成时间轴（以秒为单位）
time_velocity = np.linspace(0, (expected_frames - 1) * dt, expected_frames - 1)
time_acceleration = np.linspace(0, (expected_frames - 2) * dt, expected_frames - 2)

# --- 子采样：将数据从每 0.0333 秒一个点（30fps）改为每 1 秒一个点 ---
step = int(1 / dt)  # 对于30fps, step = 30
time_velocity_sub = time_velocity[::step]
avg_velocity_A_sub = avg_velocity_A[::step]
avg_velocity_B_sub = avg_velocity_B[::step]

time_acceleration_sub = time_acceleration[::step]
avg_acceleration_A_sub = avg_acceleration_A[::step]
avg_acceleration_B_sub = avg_acceleration_B[::step]

# 绘图及添加滑动条
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
plt.subplots_adjust(bottom=0.15)

# 绘制速度曲线（使用子采样后的数据）
lineA_v, = ax1.plot(time_velocity_sub, avg_velocity_A_sub, label="Label A", color="blue")
lineB_v, = ax1.plot(time_velocity_sub, avg_velocity_B_sub, label="Label B", color="green")
ax1.set_title("Average Velocity Curve")
ax1.set_xlabel("Time (s)")
ax1.set_ylabel("Velocity (units/s)")
ax1.legend()
ax1.set_xlim(0, window_size)

# 绘制加速度曲线（使用子采样后的数据）
lineA_a, = ax2.plot(time_acceleration_sub, avg_acceleration_A_sub, label="Label A", color="blue")
lineB_a, = ax2.plot(time_acceleration_sub, avg_acceleration_B_sub, label="Label B", color="green")
ax2.set_title("Average Acceleration Curve")
ax2.set_xlabel("Time (s)")
ax2.set_ylabel("Acceleration (units/s²)")
ax2.legend()
ax2.set_xlim(0, window_size)

# 添加滑动条（滑动范围根据子采样后的时间轴计算）
slider_ax = fig.add_axes([0.15, 0.02, 0.7, 0.03])
scroll_slider = Slider(
    ax=slider_ax,
    label='Scroll',
    valmin=0,
    valmax=time_velocity_sub[-1] - window_size,
    valinit=0,
    valstep=0.1
)

def update(val):
    start = scroll_slider.val
    ax1.set_xlim(start, start + window_size)
    ax2.set_xlim(start, start + window_size)
    fig.canvas.draw_idle()

scroll_slider.on_changed(update)
plt.show()
