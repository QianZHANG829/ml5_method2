import {
  updateAnnotationTimeline,
  renderRuler,
  getSegmentRow,
} from './timeline.js';

/* 把原来 index.html 里用到 updateAnnotationTimeline 的地方，
   改为 window.updateAnnotationTimeline = updateAnnotationTimeline
   这样旧 HTML 脚本还能找到它 */
window.updateAnnotationTimeline = updateAnnotationTimeline;
window.renderRuler = renderRuler;
window.getSegmentRow = getSegmentRow;
