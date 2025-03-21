from flask import Flask
from flask_socketio import SocketIO
import mido
import time
import threading

# 初始化 Flask 与 SocketIO
app = Flask(__name__)
socketio = SocketIO(app)

# 设置 MIDI 输出端口
port_name = "IAC Driver Bus 1"  # 请根据实际情况修改
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

def adjust_tempo(new_tempo_value):
    tempo_cc = 2  # 根据实际映射的 CC 编号修改
    cc_value = max(0, min(127, new_tempo_value))
    msg = mido.Message('control_change', control=tempo_cc, value=cc_value)
    outport.send(msg)
    print(f"Adjusted tempo: sent MIDI CC {tempo_cc} with value {cc_value}")

    
def send_midi(data_type, label, displayConfidence):
    """
    根据收到的数据判断事件类型，并执行 MIDI 发送操作
    data 示例结构：
    {
      "type": "velocity",    # 或 "acceleration"
      "label": "Fast (0.78)",
      "displayConfidence": 0.78
    }
    """
    # 根据 data_type 处理不同逻辑
    if data_type == "velocity":
        # 提取标签中 Fast/Slow，注意这里需要适应传入的 label 格式
        label_key = label.split(" ")[0].lower()
        if label_key == "fast":
            new_tempo = int(map_range(displayConfidence, 0, 1, 130, 160))
            adjust_tempo(new_tempo)
            print(f"Received velocity: type={data_type}, label={label}, 设置 tempo 为 {new_tempo}")
        elif label_key == "slow":
            new_tempo = int(map_range(displayConfidence, 0, 1, 70, 90))
            adjust_tempo(new_tempo)
            print(f"Received velocity: type={data_type}, label={label}, 设置 tempo 为 {new_tempo}")
    # 根据 acceleration 数据也可以加入类似处理逻辑
    

@socketio.on("midiData")
def handle_midi_data(data):
    print("Received midiData:", data)
    send_midi(data)

if __name__ == "__main__":
    socketio.run(app, port=5000)
