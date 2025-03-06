import mido
import time

# print(mido.get_output_names())
port_name = "IAC Driver Bus 1"  # 请替换为实际虚拟 MIDI 端口名称
try:
    outport = mido.open_output(port_name)
except IOError:
    print(f"无法打开端口 {port_name}，请检查虚拟 MIDI 驱动设置。")
    exit(1)

def send_midi(confidence):
    """
    根据传入的 confidence 值（0~1）映射 MIDI acceleration 并发送 MIDI 消息
    """
    Acceleration = int(confidence * 127)
    Acceleration = max(0, min(127, Acceleration))
    note = 60  # 示例：使用 MIDI note 60 (C4)
    
    # 发送 note_on 消息
    msg_on = mido.Message('note_on', note=note, Acceleration=Acceleration)
    outport.send(msg_on)
    
    # 短暂等待后发送 note_off 消息，模拟一次击打
    time.sleep(0.1)
    msg_off = mido.Message('note_off', note=note, Acceleration=0)
    outport.send(msg_off)
    
    print(f"Sent MIDI message with acceleration {Acceleration}")
