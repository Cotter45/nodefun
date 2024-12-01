export class RequestQueue {
	private maxConcurrentRequests: number;
	private activeRequests: number;
	private queue: (() => void)[];

	constructor(maxConcurrentRequests: number) {
		this.maxConcurrentRequests = maxConcurrentRequests;
		this.activeRequests = 0;
		this.queue = [];
	}

	enqueue(task: () => void) {
		if (this.activeRequests < this.maxConcurrentRequests) {
			this.activeRequests++;
			task();
			this.onTaskComplete();
		} else {
			this.queue.push(task);
		}
	}

	clear() {
		this.queue = [];
	}

	private onTaskComplete() {
		this.activeRequests--;
		if (this.queue.length > 0) {
			const nextTask = this.queue.shift();
			if (nextTask) {
				this.activeRequests++;
				nextTask();
				this.onTaskComplete();
			}
		}
	}

	canProcessImmediately(): boolean {
		return this.activeRequests < this.maxConcurrentRequests;
	}
}
