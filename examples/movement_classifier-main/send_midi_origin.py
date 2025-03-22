from flask import Flask
from flask_socketio import SocketIO, emit
import mido
import time
import threading

# 设置 MIDI 输出端口（请根据实际情况修改）
port_name = "IAC Driver Bus 1"
try:
    outport = mido.open_output(port_name)
except IOError:
    print(f"无法打开端口 {port_name}，请检查虚拟 MIDI 驱动设置。")
    exit(1)

def map_range(value, left_min, left_max, right_min, right_max):
    if value < left_min:
        value = left_min
    if value > left_max:
        value = left_max
    left_span = left_max - left_min
    right_span = right_max - right_min
    if left_span == 0:
        return right_min
    value_scaled = float(value - left_min) / float(left_span)
    return right_min + (value_scaled * right_span)

def adjust_tempo(new_tempo_value, tempo_cc):
    """
    发送指定 MIDI CC 消息。new_tempo_value 会先限制在 0～127 范围内，
    tempo_cc 指定使用哪个控制号。
    """
    cc_value = max(0, min(127, new_tempo_value))
    msg = mido.Message('control_change', control=tempo_cc, value=cc_value)
    outport.send(msg)
    print(f"Adjusted tempo: sent MIDI CC {tempo_cc} with value {cc_value}")

def compute_new_tempo(data_list):
    """
    data_list 为最近接收到的10个数据，每个数据格式示例：
      {
        "type": "velocity" 或 "acceleration",
        "label": "Fast (1.00)" 或 "Slow (0.98)",
        "displayConfidence": 数值 (0~1)
      }
    
    根据 fast 和 slow 的数量及其信心值计算新的 tempo，
    并返回一个二元组 (new_tempo, tempo_cc)：
      - fast 模式：映射到 [130, 160]，使用 MIDI CC3
      - slow 模式：映射到 [60, 90]，使用 MIDI CC2
      - 数量相等：映射到 [90, 120]，使用 MIDI CC4
    """
    fast_confidences = []
    slow_confidences = []
    
    for data in data_list:
        label_str = data.get("label", "")
        label_key = label_str.split(" ")[0].lower()
        conf = data.get("displayConfidence", 0)
        if label_key == "fast":
            fast_confidences.append(conf)
        elif label_key == "slow":
            slow_confidences.append(conf)
    
    count_fast = len(fast_confidences)
    count_slow = len(slow_confidences)
    
    if count_fast > count_slow and count_fast > 0:
        avg_conf = sum(fast_confidences) / count_fast
        new_tempo = int(map_range(avg_conf, 0, 1, 130, 160))
        tempo_cc = 3   # fast tempo 用 CC3
    elif count_slow > count_fast and count_slow > 0:
        avg_conf = sum(slow_confidences) / count_slow
        new_tempo = int(map_range(avg_conf, 0, 1, 60, 90))
        tempo_cc = 2   # slow tempo 用 CC2
    elif (count_fast + count_slow) > 0:
        avg_conf = (sum(fast_confidences) + sum(slow_confidences)) / (count_fast + count_slow)
        new_tempo = int(map_range(avg_conf, 0, 1, 90, 120))
        tempo_cc = 4   # 数量相等时，用 CC4
    else:
        new_tempo = 100  # 默认值
        tempo_cc = 4
    
    return new_tempo, tempo_cc

def process_midi_data(data_list):
    """
    处理接收到的10条数据，计算新的 tempo 并发送 MIDI 控制消息
    """
    new_tempo, tempo_cc = compute_new_tempo(data_list)
    adjust_tempo(new_tempo, tempo_cc)
    print(f"Computed new tempo: {new_tempo}")

# 以下部分为 Flask 服务器和 SocketIO 示例，根据你的需求进行集成
app = Flask(__name__)
socketio = SocketIO(app)

@socketio.on('midi_data')
def handle_midi_data(json_data):
    """
    假设前端发送来的数据格式为：一个包含10个数据字典的列表
    """
    data_list = json_data.get("data", [])
    if data_list:
        process_midi_data(data_list)
    emit('response', {'status': 'tempo updated'})

if __name__ == '__main__':
    socketio.run(app, port=5000)
