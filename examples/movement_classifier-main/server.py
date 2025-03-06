from flask import Flask
from flask_socketio import SocketIO, emit
from send_midi import send_midi  # 从 send_midi.py 导入发送 MIDI 的函数

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

@socketio.on('acceleration')
def handle_acceleration(data):
    # 从前端接收数据，data 应该包含 "confidence"
    confidence = data.get('confidence')
    print("接收到的 acceleration confidence:", confidence)
    
    # 调用 send_midi 函数，根据 confidence 值生成并发送 MIDI 消息
    send_midi(confidence)
    
    # 向前端返回处理结果
    emit('response', {"status": "success", "received_confidence": confidence})

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=8080)
