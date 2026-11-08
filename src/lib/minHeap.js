export class MinHeap {
  h = [];
  get size() {
    return this.h.length;
  }
  push(priority, value) {
    const heap = this.h;
    heap.push([priority, value]);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) {
        break;
      }
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  }
  pop() {
    const heap = this.h;
    if (!heap.length) {
      return;
    }
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      while (true) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) {
          smallest = left;
        }
        if (right < heap.length && heap[right][0] < heap[smallest][0]) {
          smallest = right;
        }
        if (smallest === i) {
          break;
        }
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}
