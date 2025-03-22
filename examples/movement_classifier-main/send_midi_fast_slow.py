from flask import Flask, request
from flask_socketio import SocketIO, emit
import mido

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

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

def adjust_tempo(new_tempo_value, tempo_cc=2):
    """
    发送 MIDI 控制消息，使用指定的控制号。
    本例中只针对 slow 情况，默认使用 CC2。
    new_tempo_value 会先限制在 0～127 范围内。
    """
    cc_value = max(0, min(127, new_tempo_value))
    msg = mido.Message('control_change', control=tempo_cc, value=cc_value)
    outport.send(msg)
    print(f"Adjusted tempo: sent MIDI CC {tempo_cc} with value {cc_value}")

def process_midi_data(data_list):
    """
    只处理标签为 "slow" 的数据，忽略其他标签。
    如果检测到 slow 数据，则将它们的信心值映射到 [60, 90] 并发送 MIDI CC2。
    如果没有 slow 数据，则不发送任何 MIDI 消息。
    每个数据格式示例：
      {
        "type": "velocity" 或 "acceleration",
        "label": "Slow (0.98)" 等,
        "displayConfidence": 数值 (0~1)
      }
    """
    slow_confidences = []
    for data in data_list:
        label_str = data.get("label", "")
        label_key = label_str.split(" ")[0].lower()
        if label_key == "slow":
            conf = data.get("displayConfidence", 0)
            slow_confidences.append(conf)

    if slow_confidences:
        avg_conf = sum(slow_confidences) / len(slow_confidences)
        # 将平均信心值映射到 60～90
        new_tempo = int(map_range(avg_conf, 0, 1, 60, 90))
        adjust_tempo(new_tempo, tempo_cc=2)  # slow 使用 CC2
        print(f"Computed new tempo (slow only): {new_tempo}")
    else:
        print("No slow data detected, no MIDI sent.")

# SocketIO 事件：接收前端发送的数据
@socketio.on('midi_data')
def handle_midi_data(json_data):
    """
    前端发送来的数据格式示例：
      {"data": [ {...}, {...}, ... ]}
    """
    data_list = json_data.get("data", [])
    if data_list:
        process_midi_data(data_list)
    emit('response', {'status': 'tempo updated'})

if __name__ == '__main__':
    socketio.run(app, port=5000)
