from flask import Flask
from flask_socketio import SocketIO, emit
from send_midi import process_midi_data

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# 全局列表，用于累计最近接收到的 midiData 数据
received_data_list = []

@socketio.on('midiData')
def handle_data(data):
    print("收到 midiData 事件, 数据:", data)
    global received_data_list
    received_data_list.append(data)
    # 当累计到10条数据后进行处理
    if len(received_data_list) >= 10:
        last_ten = received_data_list[-10:]
        process_midi_data(last_ten)
        # 清空列表（或采用滑动窗口处理）
        received_data_list = []
    emit('response', {"status": "success", "received_data": data})

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000)
