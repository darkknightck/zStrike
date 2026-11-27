const loadingStatus = document.getElementById('loading-status')!;
const loadingDetail = document.getElementById('loading-detail')!;
const progressFill = document.getElementById('progress-fill')!;
const desktop = document.getElementById('desktop')!;

export function updateStatus(message: string, detail = ''): void {
  loadingStatus.textContent = message;
  loadingDetail.textContent = detail;
}

export function updateProgress(value: number, max: number): void {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  progressFill.style.width = `${pct.toFixed(1)}%`;
}

export function setReady(): void {
  desktop.classList.add('ready');
  updateProgress(1, 1);
}

export function removeDesktop(): void {
  desktop.remove();
}

export const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;
