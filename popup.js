const toggleBtn = document.getElementById("toggle");
const statusDiv = document.getElementById("status");
const countdownDiv = document.getElementById("countdown");
let countdownInterval = null;

chrome.storage.local.get(
  ["autoRedeemRunning", "nextCheckTimestamp"],
  ({ autoRedeemRunning, nextCheckTimestamp }) => {
    updateUI(autoRedeemRunning);
    updateCountdown(nextCheckTimestamp);
  }
);

function updateUI(running) {
  toggleBtn.textContent = running ? "Stop" : "Start";
  statusDiv.textContent = `Status: ${running ? "Running" : "Stopped"}`;
  statusDiv.style.color = running ? "green" : "red"; // <-- Add this line
}

function updateCountdown(timestamp) {
  if (countdownInterval) clearInterval(countdownInterval);
  if (!timestamp) return (countdownDiv.textContent = "");

  function render() {
    const remaining = Math.max(0, timestamp - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    countdownDiv.textContent = `Next check in: ${mins}m ${secs}s`;
  }

  render();
  countdownInterval = setInterval(render, 1000);
}

toggleBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_REDEEM" });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATUS_UPDATE") {
    updateUI(msg.running);
  } else if (msg.type === "COUNTDOWN_UPDATE") {
    updateCountdown(msg.timestamp);
  }
});
