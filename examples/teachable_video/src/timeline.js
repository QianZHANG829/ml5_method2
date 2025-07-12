/* -------------------------------------------------
   timeline.js  ——  时间轴相关函数，已经从 collect.js
   独立出来。加载后同时 export + 挂到 window，
   旧代码可以直接调用。
--------------------------------------------------*/

/* ↓↓↓ 1. 直接把原函数原样搬过来 ↓↓↓ */
console.log('[timeline] loaded');   // 只为调试

// --------- 更新标注时间轴 ---------
export function updateAnnotationTimeline () {
  const container = document.getElementById('label-timeline');
  if (!container) return;

  /* 防御：视频尚未就绪 */
  if (!video || typeof video.duration !== 'function') {
    container.innerHTML = '';
    return;
  }

  const duration = video.duration();
  container.innerHTML = '';             // 清空旧 DOM
  container.style.overflowX = 'auto';   // 允许横向滚动

  /* ---------- 1. 刻度尺 ---------- */
  const ruler = document.createElement('div');
  ruler.id = 'timeline-ruler';
  ruler.className = 'timeline-ruler';
  ruler.style.width = `${duration * PX_PER_SEC}px`;  // 让尺子长度随时长
  container.appendChild(ruler);

  renderRuler(Math.ceil(duration));                   // 用统一函数绘制尺子

  /* ---------- 2. 轨道条（支持多行） ---------- */
  const track = document.createElement('div');
  track.id = 'track-wrapper';
  track.className = 'track-wrapper';
  container.appendChild(track);

  const rowHeight = pxVar('--timeline-row-h');   // 20
  const rowGap    = pxVar('--timeline-row-gap'); // 8
  const placedRows = [];                         // 行避让占位表

  labeledSegments.forEach((seg, idx) => {
    const clip = document.createElement('div');
    clip.className = 'timeline-clip';

    /* 位置 & 尺寸（像素制） */
    clip.style.left  = `${seg.start * PX_PER_SEC}px`;
    clip.style.width = `${(seg.end - seg.start) * PX_PER_SEC}px`;

    /* 行避让 */
    const row = getSegmentRow(seg, placedRows, duration);
    clip.style.top        = `${row * (rowHeight + rowGap)}px`;
    track.style.minHeight = `${(row + 1) * rowHeight + row * rowGap}px`;

    /* 外观 */
    clip.style.background = getColorForLabel(seg.label);
    clip.textContent = seg.label;
    clip.title = `${seg.label}  ${seg.start.toFixed(1)}s–${seg.end.toFixed(1)}s`;

    /* 交互：点击跳转 / 双击删除 */
    clip.onclick    = () => video.time(seg.start);   // 单击 → seek
    clip.ondblclick = e => {                         // 双击 → 删除
      e.stopPropagation();
      labeledSegments.splice(idx,1);
      updateAnnotationTimeline();
      if (idx < thumbnails.length) removeThumbnail(thumbnails[idx]);
    };

    track.appendChild(clip);
  });

  /* ---------- 3. 播放指针 ---------- */
  const playhead = document.createElement('div');
  playhead.id = 'timeline-playhead';
  playhead.className = 'timeline-playhead';
  playhead.style.left = `${video.time() * PX_PER_SEC}px`;
  track.appendChild(playhead);
}

// --------- 生成刻度尺 ---------
export function renderRuler(totalSeconds){
  const ruler = document.getElementById('timeline-ruler');
  if(!ruler) return;
  ruler.innerHTML = '';
  const pxPerSec       = PX_PER_SEC;
  const TICK_INTERVAL  = 1;
  const BIG_TICK_EVERY = 5;

  for(let s=0; s<=totalSeconds; s+=TICK_INTERVAL){
    const tick = document.createElement('div');
    tick.style.position   = 'absolute';
    tick.style.left       = `${s*pxPerSec}px`;
    tick.style.bottom     = '0';
    tick.style.width      = '1px';
    tick.style.background = '#9ca3af';
    tick.style.height     = (s % BIG_TICK_EVERY === 0) ? '100%' : '50%';
    ruler.appendChild(tick);

    if(s % BIG_TICK_EVERY === 0){
      const label = document.createElement('span');
      label.textContent   = `${s.toFixed(0)}s`;
      label.style.position= 'absolute';
      label.style.left    = `${s*pxPerSec+2}px`;
      label.style.bottom  = '-14px';
      ruler.appendChild(label);
    }
  }
}

// --------- 行避让算法 ---------
export function getSegmentRow(newSeg, placedSegments = [], duration) {
  let row = 0;
  while (true) {
    const overlap = placedSegments[row]?.some(existing => {
      return !(newSeg.end <= existing.start || newSeg.start >= existing.end);
    });
    if (!overlap) break;
    row++;
  }
  if (!placedSegments[row]) placedSegments[row] = [];
  placedSegments[row].push(newSeg);
  return row;
}

/* ——— 颜色映射，保持与原逻辑一致 ——— */
function getColorForLabel(label){
  const palette = {
    "Sad & Inner Struggle": "#2196f3",
    "Freedom & Liberation": "#4caf50",
    "Conflict & Tension": "#f44336"
  };
  return palette[label] || 'rgba(33,150,243,.7)';
}

/* ↓↓↓ 2. 向旧代码暴露全局函数，直接覆盖 window ↓↓↓ */
window.updateAnnotationTimeline = updateAnnotationTimeline;
window.renderRuler              = renderRuler;
window.getSegmentRow            = getSegmentRow;
