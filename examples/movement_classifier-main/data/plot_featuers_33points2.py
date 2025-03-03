import json
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider, CheckButtons, Button
import math

# ------------------- 参数设置 -------------------
fps = 30                      # 帧率
expected_frames = 600         # 期望帧数
dt = 1 / fps                  # 每帧时间间隔
window_size = 20              # 默认显示时间窗口（秒）

# ------------------- 数据处理函数 -------------------
def load_sample(filename):
    """
    从指定 JSON 文件中加载一个样本数据（取前 expected_frames 帧）
    文件格式示例：
    {
      "data": [
         {
            "xs": [ { "x0":..., "y0":..., ..., "x32":..., "y32":... }, ... ],
            "ys": { "label": "A" }
         },
         ...
      ]
    }
    """
    with open(filename, "r", encoding="utf-8") as f:
        data = json.load(f)
    # 此处仅取第一个样本
    sample = data.get("data", [])[0]
    frames = sample.get("xs", [])[:expected_frames]
    return frames

def compute_keypoint_trajectories(frames):
    """
    计算33个关键点的轨迹，每个关键点保存一个 (x, y) 序列
    返回字典： { 0: [(x0,y0), (x1,y1), ...], 1: [...], ..., 32: [...] }
    """
    trajectories = {i: [] for i in range(33)}
    for frame in frames:
        for i in range(33):
            key_x = f"x{i}"
            key_y = f"y{i}"
            if key_x in frame and key_y in frame:
                trajectories[i].append((frame[key_x], frame[key_y]))
            else:
                trajectories[i].append((np.nan, np.nan))
    return trajectories

def compute_velocity(trajectory):
    """
    给定一个关键点的轨迹（列表，每项为 (x, y)），计算连续帧之间的速度（单位：位置/秒）
    """
    velocities = []
    for i in range(len(trajectory) - 1):
        x1, y1 = trajectory[i]
        x2, y2 = trajectory[i+1]
        v = math.sqrt((x2 - x1)**2 + (y2 - y1)**2) / dt
        velocities.append(v)
    return np.array(velocities)

def compute_acceleration(velocities):
    """
    给定速度序列，计算连续帧之间的加速度（单位：速度变化/秒²），并取绝对值
    """
    accelerations = []
    for i in range(len(velocities) - 1):
        a = abs((velocities[i+1] - velocities[i]) / dt)
        accelerations.append(a)
    return np.array(accelerations)

def process_files(file_list):
    """
    对传入的多个 JSON 文件进行处理，
    返回一个字典，包含 33 个关键点的平均速度和平均加速度（全分辨率数据）
    每个文件都按 expected_frames 取前数据。
    """
    velocities_all = {i: [] for i in range(33)}
    accelerations_all = {i: [] for i in range(33)}
    for fname in file_list:
        frames = load_sample(fname)
        trajs = compute_keypoint_trajectories(frames)
        for i in range(33):
            vel = compute_velocity(trajs[i])
            acc = compute_acceleration(vel) if len(vel) > 1 else np.array([])
            velocities_all[i].append(vel)
            accelerations_all[i].append(acc)
    avg_vel = {}
    avg_acc = {}
    for i in range(33):
        avg_vel[i] = np.mean(np.stack(velocities_all[i], axis=0), axis=0)
        avg_acc[i] = np.mean(np.stack(accelerations_all[i], axis=0), axis=0)
    return avg_vel, avg_acc

# ------------------- 定义文件列表 -------------------
# 请根据实际情况修改文件名
fileNames_A = [
    # 'test4_A600frame_glideComR_10set5.json',
    'test4_A600frame_glideComR_10set4.json',
    # 'test4_A600frame_glideComR_10set3.json',
    # 'test4_A600frame_glideComR_10set2.json',
    # 'test4_A600frame_glideComR_10set1.json'
]
fileNames_B = [
    # 'test5_B600frame_glideComR_QuickStrong_20set2.json',
    # 'test5_B600frame_glideComR_QuickStrong_10set3.json',
    'test5_B600frame_glideComR_QuickStrong_10set4.json',
    # 'test5_B600frame_glideComR_QuickStrong_10set5.json'
]

# ------------------- 处理数据（全分辨率，用于热图） -------------------
avg_vel_full_A, avg_acc_full_A = process_files(fileNames_A)
avg_vel_full_B, avg_acc_full_B = process_files(fileNames_B)

# ------------------- 为 GUI 部分进行子采样 -------------------
step = int(1 / dt)  # 30
time_velocity = np.linspace(0, (expected_frames - 1) * dt, expected_frames - 1)
time_acceleration = np.linspace(0, (expected_frames - 2) * dt, expected_frames - 2)
time_velocity_sub = time_velocity[::step]
time_acceleration_sub = time_acceleration[::step]

# 对全局数据做子采样，生成 GUI 用数据
avg_vel_A = {i: avg_vel_full_A[i][::step] for i in range(33)}
avg_acc_A = {i: avg_acc_full_A[i][::step] for i in range(33)}
avg_vel_B = {i: avg_vel_full_B[i][::step] for i in range(33)}
avg_acc_B = {i: avg_acc_full_B[i][::step] for i in range(33)}

# ------------------- 主 GUI 窗口（曲线显示） -------------------
fig, ax = plt.subplots(figsize=(12, 6))
plt.subplots_adjust(left=0.25, bottom=0.25)

# 关键点复选框（Key 0 ... Key 32）
checkbox_keys_ax = plt.axes([0.025, 0.3, 0.15, 0.55])
key_labels = [f"Key {i}" for i in range(33)]
key_visibility = [True] * 33
check_keys = CheckButtons(checkbox_keys_ax, key_labels, key_visibility)

# 模式复选框（Velocity, Acceleration）
checkbox_modes_ax = plt.axes([0.025, 0.15, 0.15, 0.12])
mode_labels = ["Velocity", "Acceleration"]
mode_status_default = [True, True]
check_modes = CheckButtons(checkbox_modes_ax, mode_labels, mode_status_default)

# Label 复选框（Label A, Label B）
checkbox_labels_ax = plt.axes([0.025, 0.05, 0.15, 0.06])
label_labels = ["Label A", "Label B"]
label_status_default = [True, True]
check_labels = CheckButtons(checkbox_labels_ax, label_labels, label_status_default)

# Select All / Unselect All 按钮（对关键点）
button_all_ax = plt.axes([0.025, 0.92, 0.07, 0.04])
button_none_ax = plt.axes([0.11, 0.92, 0.07, 0.04])
button_all = Button(button_all_ax, 'Select All')
button_none = Button(button_none_ax, 'Unselect All')

# 时间滑动条
slider_ax = plt.axes([0.25, 0.18, 0.65, 0.03])
time_slider = Slider(slider_ax, 'Time', 0, time_velocity_sub[-1] - window_size, 
                     valinit=0, valstep=0.1)

def update_plot():
    """根据关键点、模式和 label 的选择更新曲线图"""
    ax.cla()
    start = time_slider.val
    ax.set_xlim(start, start + window_size)
    
    key_status = check_keys.get_status()       # 长度33
    mode_status = check_modes.get_status()       # [Velocity, Acceleration]
    label_status = check_labels.get_status()       # [Label A, Label B]
    show_velocity = mode_status[0]
    show_acceleration = mode_status[1]
    
    for i in range(33):
        if key_status[i]:
            if label_status[0]:
                # Label A：采用 Blues 系列颜色
                colorA = plt.cm.Blues((i+1)/34)
                if show_velocity:
                    ax.plot(time_velocity_sub, avg_vel_A[i], label=f"Key {i} A Velocity",
                            color=colorA, linestyle='-')
                if show_acceleration:
                    ax.plot(time_acceleration_sub, avg_acc_A[i], label=f"Key {i} A Acceleration",
                            color=colorA, linestyle='--')
            if label_status[1]:
                # Label B：采用 Oranges 系列颜色
                colorB = plt.cm.Oranges((i+1)/34)
                if show_velocity:
                    ax.plot(time_velocity_sub, avg_vel_B[i], label=f"Key {i} B Velocity",
                            color=colorB, linestyle='-')
                if show_acceleration:
                    ax.plot(time_acceleration_sub, avg_acc_B[i], label=f"Key {i} B Acceleration",
                            color=colorB, linestyle='--')
    
    ax.set_xlabel("Time (s)")
    if show_velocity and show_acceleration:
        ax.set_ylabel("Value")
        ax.set_title("Velocity and Acceleration of Selected Key Points")
    elif show_velocity:
        ax.set_ylabel("Velocity (units/s)")
        ax.set_title("Velocity of Selected Key Points")
    elif show_acceleration:
        ax.set_ylabel("Acceleration (units/s²)")
        ax.set_title("Acceleration of Selected Key Points")
    else:
        ax.set_ylabel("Value")
        ax.set_title("No Mode Selected")
    ax.legend(loc="upper right", fontsize='small', ncol=2)
    fig.canvas.draw_idle()

def update_keys(label):
    update_plot()

def update_modes(label):
    update_plot()

def update_labels(label):
    update_plot()

def update_time(val):
    start = time_slider.val
    ax.set_xlim(start, start + window_size)
    fig.canvas.draw_idle()

def select_all(event):
    for i, state in enumerate(check_keys.get_status()):
        if not state:
            check_keys.set_active(i)
    update_plot()

def unselect_all(event):
    for i, state in enumerate(check_keys.get_status()):
        if state:
            check_keys.set_active(i)
    update_plot()

check_keys.on_clicked(update_keys)
check_modes.on_clicked(update_modes)
check_labels.on_clicked(update_labels)
time_slider.on_changed(update_time)
button_all.on_clicked(select_all)
button_none.on_clicked(unselect_all)

# ------------------- 更新热图的回调 -------------------
def update_heatmap(event):
    """
    根据 label 与关键点选择显示对应的加速度热图（全分辨率数据）。
    热图只显示在关键点选择复选框中勾选的 keypoints。
    若同时选中 A 与 B，则并排显示两个子图。
    """
    # 获取选中的关键点索引
    selected_keys = [i for i, v in enumerate(check_keys.get_status()) if v]
    if not selected_keys:
        print("请至少选择一个关键点用于显示热图。")
        return

    label_status = check_labels.get_status()
    num_frames_acc = expected_frames - 2

    # 根据选择的 keypoints构造 y 轴显示信息
    y_extent = [-0.5, len(selected_keys)-0.5]
    y_ticks = np.arange(len(selected_keys))
    y_ticklabels = [f"Key {i}" for i in selected_keys]

    if label_status[0] and label_status[1]:
        fig_heat, (ax_heat_A, ax_heat_B) = plt.subplots(1, 2, figsize=(12, 6))
        # Label A 热图
        acc_matrix_A = np.zeros((len(selected_keys), num_frames_acc))
        for idx, i in enumerate(selected_keys):
            acc_matrix_A[idx, :] = avg_acc_full_A[i]
        im1 = ax_heat_A.imshow(acc_matrix_A, aspect='auto', origin='lower',
                                extent=[0, num_frames_acc, y_extent[0], y_extent[1]], cmap='viridis')
        ax_heat_A.set_xlabel("Frame")
        ax_heat_A.set_ylabel("Keypoint")
        ax_heat_A.set_title("Label A Acceleration Heatmap")
        ax_heat_A.set_yticks(y_ticks)
        ax_heat_A.set_yticklabels(y_ticklabels)
        fig_heat.colorbar(im1, ax=ax_heat_A, label="Acceleration (units/s²)")
        
        # Label B 热图
        acc_matrix_B = np.zeros((len(selected_keys), num_frames_acc))
        for idx, i in enumerate(selected_keys):
            acc_matrix_B[idx, :] = avg_acc_full_B[i]
        im2 = ax_heat_B.imshow(acc_matrix_B, aspect='auto', origin='lower',
                                extent=[0, num_frames_acc, y_extent[0], y_extent[1]], cmap='viridis')
        ax_heat_B.set_xlabel("Frame")
        ax_heat_B.set_ylabel("Keypoint")
        ax_heat_B.set_title("Label B Acceleration Heatmap")
        ax_heat_B.set_yticks(y_ticks)
        ax_heat_B.set_yticklabels(y_ticklabels)
        fig_heat.colorbar(im2, ax=ax_heat_B, label="Acceleration (units/s²)")
    elif label_status[0]:
        fig_heat, ax_heat = plt.subplots(figsize=(12, 6))
        acc_matrix_A = np.zeros((len(selected_keys), num_frames_acc))
        for idx, i in enumerate(selected_keys):
            acc_matrix_A[idx, :] = avg_acc_full_A[i]
        im = ax_heat.imshow(acc_matrix_A, aspect='auto', origin='lower',
                            extent=[0, num_frames_acc, y_extent[0], y_extent[1]], cmap='viridis')
        ax_heat.set_xlabel("Frame")
        ax_heat.set_ylabel("Keypoint")
        ax_heat.set_title("Label A Acceleration Heatmap")
        ax_heat.set_yticks(y_ticks)
        ax_heat.set_yticklabels(y_ticklabels)
        fig_heat.colorbar(im, ax=ax_heat, label="Acceleration (units/s²)")
    elif label_status[1]:
        fig_heat, ax_heat = plt.subplots(figsize=(12, 6))
        acc_matrix_B = np.zeros((len(selected_keys), num_frames_acc))
        for idx, i in enumerate(selected_keys):
            acc_matrix_B[idx, :] = avg_acc_full_B[i]
        im = ax_heat.imshow(acc_matrix_B, aspect='auto', origin='lower',
                            extent=[0, num_frames_acc, y_extent[0], y_extent[1]], cmap='viridis')
        ax_heat.set_xlabel("Frame")
        ax_heat.set_ylabel("Keypoint")
        ax_heat.set_title("Label B Acceleration Heatmap")
        ax_heat.set_yticks(y_ticks)
        ax_heat.set_yticklabels(y_ticklabels)
        fig_heat.colorbar(im, ax=ax_heat, label="Acceleration (units/s²)")
    plt.show()

# 热图按钮
button_heatmap_ax = plt.axes([0.25, 0.02, 0.15, 0.04])
button_heatmap = Button(button_heatmap_ax, "Update Heatmap")
button_heatmap.on_clicked(update_heatmap)

# 初始绘图
update_plot()
plt.show()
