from flask import Flask
from flask_socketio import SocketIO, emit
import send_midi

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'

# 允许所有来源连接
socketio = SocketIO(app, cors_allowed_origins="*")

@socketio.on('acceleration')
def handle_acceleration(data):
    confidence = data.get('confidence')
    print("接收到的 acceleration confidence:", confidence)
    send_midi(confidence)
    emit('response', {"status": "success", "received_confidence": confidence})

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000)
