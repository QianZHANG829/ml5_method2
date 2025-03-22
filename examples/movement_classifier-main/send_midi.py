from flask import Flask, request
from flask_socketio import SocketIO, emit
import mido
import time
import threading

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

def adjust_tempo(new_tempo_value, tempo_cc):
    """
    发送 MIDI 控制消息，使用指定的控制号 tempo_cc
    new_tempo_value 会先限制在 0～127 范围内。
    """
    cc_value = max(0, min(127, new_tempo_value))
    msg = mido.Message('control_change', control=tempo_cc, value=cc_value)
    outport.send(msg)
    print(f"Adjusted tempo: sent MIDI CC {tempo_cc} with value {cc_value}")

def compute_new_tempo(data_list):
    """
    data_list 为最近接收到的一组数据，每个数据格式示例：
      {
        "type": "velocity" 或 "acceleration",
        "label": "Fast (1.00)" 或 "Slow (0.98)",
        "displayConfidence": 数值 (0~1)
      }
    
    仅检测 fast 与 slow 标签：
      - 如果检测到 fast 数据，则将其平均信心值映射到 [130, 160]，使用 MIDI CC1；
      - 如果没有 fast 数据但检测到 slow 数据，则映射到 [60, 90]，使用 MIDI CC2；
      - 如果两者都没有，则返回 (None, None)（即不发送 MIDI）。
    """
    fast_confidences = []
    slow_confidences = []
    
    for data in data_list:
        label_str = data.get("label", "")
        label_key = label_str.split(" ")[0].lower()
        if label_key == "fast":
            fast_confidences.append(data.get("displayConfidence", 0))
        elif label_key == "slow":
            slow_confidences.append(data.get("displayConfidence", 0))
    
    if fast_confidences:
        avg_conf = sum(fast_confidences) / len(fast_confidences)
        new_tempo = int(map_range(avg_conf, 0, 1, 130, 160))
        tempo_cc = 1   # fast 使用 MIDI CC1
    elif slow_confidences:
        avg_conf = sum(slow_confidences) / len(slow_confidences)
        new_tempo = int(map_range(avg_conf, 0, 1, 60, 90))
        tempo_cc = 2   # slow 使用 MIDI CC2
    else:
        new_tempo = None
        tempo_cc = None
        
    return new_tempo, tempo_cc

def process_midi_data(data_list):
    """
    处理接收到的数据，计算新的 tempo 并发送 MIDI 控制消息，
    仅在检测到 fast 或 slow 数据时发送消息。
    """
    new_tempo, tempo_cc = compute_new_tempo(data_list)
    if new_tempo is not None and tempo_cc is not None:
        adjust_tempo(new_tempo, tempo_cc)
        print(f"Computed new tempo: {new_tempo} (using CC{tempo_cc})")
    else:
        print("No fast or slow data detected, no MIDI sent.")

# 全局列表，用于累计接收到的 midiData 数据
received_data_list = []

@socketio.on('midi_data')
def handle_midi_data(json_data):
    """
    前端发送来的数据格式示例：
      {"data": { ... }}
    这里将每条数据都追加到全局列表中。
    """
    global received_data_list
    data = json_data.get("data", {})
    if data:
        received_data_list.append(data)
    emit('response', {'status': 'data received'})

def periodic_send():
    """
    每隔 30 秒调用一次 process_midi_data 处理累计的数据，
    然后清空 received_data_list。
    """
    global received_data_list
    while True:
        time.sleep(30)
        if received_data_list:
            print("Periodic sending of accumulated data...")
            process_midi_data(received_data_list)
            received_data_list = []
        else:
            print("No data accumulated in this interval.")

if __name__ == '__main__':
    # 启动后台线程，每 30 秒发送一次
    sender_thread = threading.Thread(target=periodic_send)
    sender_thread.daemon = True
    sender_thread.start()
    
    socketio.run(app, port=2000)
