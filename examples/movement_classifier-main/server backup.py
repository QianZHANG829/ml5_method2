from flask import Flask
from flask_socketio import SocketIO, emit
from send_midi import send_midi


app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'

# 允许所有来源连接
socketio = SocketIO(app, cors_allowed_origins="*")

@socketio.on('midiData')
def handle_data(data):
    print("收到 midiData 事件, 数据:", data)
    
    # 根据前端发送的数据结构进行解析
    data_type = data.get('type')          # "velocity" 或 "acceleration"
    label = data.get('label')              # 比如 "Fast (0.78)"
    displayConfidence = data.get('displayConfidence')
    
    # 调用 send_midi 模块进行处理（你需要在 send_midi 中根据 data_type 区分处理逻辑）
    send_midi(data_type, label, displayConfidence)
    
    emit('response', {"status": "success", "received_data": data})


if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000)
