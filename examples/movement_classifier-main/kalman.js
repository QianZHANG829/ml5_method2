// kalman.js

// 简易的 1D Kalman Filter 实现
class KalmanFilter {
    constructor(R, Q, A = 1, B = 0, C = 1) {
      this.R = R; // 过程噪声
      this.Q = Q; // 测量噪声
      this.A = A; // 状态转移系数
      this.B = B; // 控制输入系数
      this.C = C; // 测量系数
      this.cov = NaN;
      this.x = NaN; // 状态估计值
    }
  
    // 传入测量值 z（以及可选的控制量 u），返回滤波后的平滑结果
    filter(z, u = 0) {
      let zNum = typeof z === 'string' ? parseFloat(z) : z;
      if (isNaN(zNum)) {
        console.warn("Invalid measurement:", z);
        return this.x; // 或返回默认值
      }
      // 接下来使用 zNum 进行计算
      if (isNaN(this.x)) {
        this.x = zNum / this.C;
        this.cov = (1 / this.C) * this.Q * (1 / this.C);
      } else {
        let predX = this.A * this.x + this.B * u;
        let predCov = this.A * this.cov * this.A + this.R;
        let K = (predCov * this.C) / (this.C * predCov * this.C + this.Q);
        this.x = predX + K * (zNum - this.C * predX);
        this.cov = predCov - K * this.C * predCov;
      }
      return this.x;
    }
    
  
    // 当没有新的测量值时，可以仅预测下一步状态
    predict(u = 0) {
      if (isNaN(this.x)) {
        // 如果还没有初始化，就返回 0 或者不做任何处理
        return 0;
      } else {
        let predX = this.A * this.x + this.B * u;
        let predCov = this.A * this.cov * this.A + this.R;
        this.x = predX;
        this.cov = predCov;
        return this.x;
      }
    }
  }
  
  // 为了在其他脚本中能直接使用 KalmanFilter 类，最简单的方式是将它挂载到全局对象
  // 如果你想用 ES6 模块，也可以使用 export，但需要配合打包或 <script type="module">
  window.KalmanFilter = KalmanFilter;
  