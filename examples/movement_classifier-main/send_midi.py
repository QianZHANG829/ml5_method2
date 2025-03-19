import mido
import time

# 设置 MIDI 输出端口（确保 Ableton 已启用该端口）
port_name = "IAC Driver Bus 1"  # 请根据你的实际情况修改
try:
    outport = mido.open_output(port_name)
except IOError:
    print(f"无法打开端口 {port_name}，请检查虚拟 MIDI 驱动设置。")
    exit(1)

# 定义事件计数器和触发阈值
sudden_count = 0
sudden_threshold = 3  # 连续 3 个 sudden 触发鼓映射

fast_count = 0
fast_threshold = 5    # 连续 5 个 fast 触发 tempo 调整

def trigger_drum_mapping(value=127):
    """
    发送 MIDI CC 消息，用于触发在 Ableton MIDI Mapping 中映射的鼓参数
    例如，假设你将 CC#10 映射到某个鼓触发按钮上
    """
    drum_cc = 10  # 修改为你在 Ableton 中映射的 CC 编号
    cc_value = max(0, min(127, value))
    msg = mido.Message('control_change', control=drum_cc, value=cc_value)
    outport.send(msg)
    print(f"Triggered drum mapping: sent MIDI CC {drum_cc} with value {cc_value}")

def adjust_tempo(new_tempo_value):
    """
    发送 MIDI CC 消息，用于调整在 Ableton MIDI Mapping 中映射的 tempo 参数
    例如，将 CC#2 映射到 tempo 控制上
    """
    tempo_cc = 2  # 修改为你在 Ableton 中映射的 CC 编号
    cc_value = max(0, min(127, new_tempo_value))
    msg = mido.Message('control_change', control=tempo_cc, value=cc_value)
    outport.send(msg)
    print(f"Adjusted tempo: sent MIDI CC {tempo_cc} with value {cc_value}")

def process_event(event):
    """
    根据事件类型更新计数器：
      - “sudden” 事件累计到阈值时触发鼓映射消息
      - “fast” 事件累计到阈值时触发 tempo 调整消息
    """
    global sudden_count, fast_count

    if event == "sudden":
        sudden_count += 1
        fast_count = 0  # 清除 fast 计数器
        print(f"Sudden count: {sudden_count}")
        if sudden_count >= sudden_threshold:
            trigger_drum_mapping(127)
            sudden_count = 0  # 触发后重置计数器
    elif event == "fast":
        fast_count += 1
        sudden_count = 0  # 清除 sudden 计数器
        print(f"Fast count: {fast_count}")
        if fast_count >= fast_threshold:
            # 此处根据需求设定 tempo 对应的 CC 值，例如 100
            adjust_tempo(100)
            fast_count = 0  # 触发后重置计数器
    else:
        sudden_count = 0
        fast_count = 0

# 模拟测试事件流
test_events = [
    "sudden", "sudden", "sudden",   # 应该触发鼓映射
    "fast", "fast", "fast", "fast", "fast"  # 应该触发 tempo 调整
]

for event in test_events:
    process_event(event)
    time.sleep(0.5)  # 模拟实时输入间隔
