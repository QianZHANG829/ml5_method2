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
                trajectories[i].append( (frame[key_x], frame[key_y]) )
            else:
                trajectories[i].append( (np.nan, np.nan) )
    return trajectories

def compute_velocity(trajectory):
    """
    给定一个关键点的轨迹（列表，每项为 (x, y)），
    计算连续帧之间的速度（单位：位置/秒）
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
    给定速度序列，计算连续帧之间的加速度（单位：速度变化/秒²），
    并取绝对值以避免负值。
    """
    accelerations = []
    for i in range(len(velocities) - 1):
        a = abs((velocities[i+1] - velocities[i]) / dt)
        accelerations.append(a)
    return np.array(accelerations)

# ------------------- 数据加载与计算 -------------------
# 修改为实际的 JSON 文件路径
filename = 'test4_A600frame_glideComR_10set4.json'
frames = load_sample(filename)
trajectories = compute_keypoint_trajectories(frames)

# 针对每个关键点分别计算速度和加速度
velocities = {}    # 每个关键点的速度序列，长度为 expected_frames - 1
accelerations = {} # 每个关键点的加速度序列，长度为 expected_frames - 2
for i in range(33):
    traj = trajectories[i]
    vel = compute_velocity(traj)
    acc = compute_acceleration(vel) if len(vel) > 1 else np.array([])
    velocities[i] = vel
    accelerations[i] = acc

# ------------------- 子采样，每秒取1个数据点 -------------------
step = int(1 / dt)  # 对于30fps, step = 30

# 构造时间轴（单位：秒）
time_velocity = np.linspace(0, (expected_frames - 1) * dt, expected_frames - 1)
time_acceleration = np.linspace(0, (expected_frames - 2) * dt, expected_frames - 2)

# 子采样
time_velocity_sub = time_velocity[::step]
time_acceleration_sub = time_acceleration[::step]
for i in range(33):
    velocities[i] = velocities[i][::step]
    accelerations[i] = accelerations[i][::step]

# ------------------- GUI界面构建 -------------------
fig, ax = plt.subplots(figsize=(12, 6))
plt.subplots_adjust(left=0.25, bottom=0.3)

# 默认：全部关键点均选中
# ------------------- 关键点选择复选框 -------------------
# 在左侧显示33个复选框（标签：Key 0, Key 1, …, Key 32）
checkbox_ax = plt.axes([0.025, 0.3, 0.15, 0.6])
key_labels = [f"Key {i}" for i in range(33)]
key_visibility = [True] * 33  # 默认全部显示
check_keys = CheckButtons(checkbox_ax, key_labels, key_visibility)

# ------------------- 模式选择复选框 -------------------
# 新增复选框，可同时选择 Velocity 和 Acceleration
mode_checkbox_ax = plt.axes([0.025, 0.1, 0.15, 0.15])
mode_labels = ["Velocity", "Acceleration"]
# 默认均选中
mode_status_default = [True, True]
check_modes = CheckButtons(mode_checkbox_ax, mode_labels, mode_status_default)

# ------------------- Select All / Unselect All 按钮 -------------------
button_all_ax = plt.axes([0.025, 0.92, 0.07, 0.04])
button_none_ax = plt.axes([0.11, 0.92, 0.07, 0.04])
button_all = Button(button_all_ax, 'Select All')
button_none = Button(button_none_ax, 'Unselect All')

# ------------------- 时间滑动条 -------------------
slider_ax = plt.axes([0.25, 0.15, 0.65, 0.03])
time_slider = Slider(slider_ax, 'Time', 0, time_velocity_sub[-1] - window_size, 
                     valinit=0, valstep=0.1)

def update_plot():
    """根据当前关键点和模式选择更新绘图"""
    ax.cla()
    # 获取当前时间滑动条起始值
    start = time_slider.val
    ax.set_xlim(start, start + window_size)
    
    # 获取关键点选择状态与模式选择状态
    key_status = check_keys.get_status()   # 长度33的布尔列表
    mode_status = check_modes.get_status()   # [Velocity, Acceleration]
    
    # 判断显示模式
    show_velocity = mode_status[0]
    show_acceleration = mode_status[1]
    
    # 如果同时显示两种模式，图例标签会很多，建议用不同线型区分
    for i in range(33):
        if key_status[i]:
            # 为每个关键点使用固定颜色（利用 colormap）
            color = plt.cm.nipy_spectral(i/33)
            if show_velocity:
                ax.plot(time_velocity_sub, velocities[i], label=f"Key {i} Velocity",
                        color=color, linestyle='-')
            if show_acceleration:
                ax.plot(time_acceleration_sub, accelerations[i], label=f"Key {i} Acceleration",
                        color=color, linestyle='--')
    
    ax.set_xlabel("Time (s)")
    # 根据显示模式设置 Y 轴标签和标题
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

def update_time(val):
    # 仅更新时间窗口（避免重绘全部图形，也可调用 update_plot()）
    start = time_slider.val
    ax.set_xlim(start, start + window_size)
    fig.canvas.draw_idle()

def select_all(event):
    # 将所有关键点设为选中状态
    for i, state in enumerate(check_keys.get_status()):
        if not state:
            check_keys.set_active(i)  # 此调用会触发 update_keys 回调
    update_plot()

def unselect_all(event):
    # 将所有关键点设为取消状态
    for i, state in enumerate(check_keys.get_status()):
        if state:
            check_keys.set_active(i)  # 此调用会触发 update_keys 回调
    update_plot()

# 注册控件回调
check_keys.on_clicked(update_keys)
check_modes.on_clicked(update_modes)
time_slider.on_changed(update_time)
button_all.on_clicked(select_all)
button_none.on_clicked(unselect_all)

# 初始绘图
update_plot()
plt.show()
