import mido
import time

# 使用 mido.get_output_names() 确认实际的 MIDI 输出端口名称
port_name = "IAC Driver Bus 1"  # 替换为你的虚拟 MIDI 端口名称
try:
    outport = mido.open_output(port_name)
except IOError:
    print(f"无法打开端口 {port_name}，请检查虚拟 MIDI 驱动设置。")
    exit(1)

def send_midi(confidence):
    """
    将传入的 confidence 值（0~1）映射为 0~127 的数值，
    并发送一个 MIDI 控制器消息（Control Change）。
    在 Ableton Live 中，你可以将此 CC 消息映射到目标参数上（例如 beat 强弱）。
    """
    # 将 confidence 映射到 0～127 范围
    cc_value = int(confidence * 127)
    cc_value = max(0, min(127, cc_value))
    
    # 选择一个 MIDI 控制器编号（例如 CC#1）
    cc_number = 1
    
    # 构造并发送 Control Change 消息
    msg = mido.Message('control_change', control=cc_number, value=cc_value)
    outport.send(msg)
    
    print(f"Sent MIDI CC message: control {cc_number}, value {cc_value}")
