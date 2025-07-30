let autoRedeemTimeout = null;

function waitForElement(selectorFn, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const interval = 100;
    const startTime = Date.now();

    const check = () => {
      const el = selectorFn();
      if (el) return resolve(el);
      if (Date.now() - startTime > timeout)
        return reject("Timeout waiting for element");
      setTimeout(check, interval);
    };

    check();
  });
}

function getOpenMenuButton() {
  return document.querySelector('[aria-label="Bits and Points Balances"]');
}

function getMenuContainer() {
  return document.getElementById("channel-points-reward-center-body");
}

function getSelectItemButton() {
  const img = document.querySelector('img[alt="RAFFLE"]');
  return img?.closest('button, [role="button"], div');
}

function getRedeemItemButton() {
  return Array.from(
    document.querySelectorAll('button[class^="ScCoreButton-sc-"]')
  ).find((btn) => btn.textContent.trim().toLowerCase().includes("redeem"));
}

function getCooldownTimeInMs(buttonEl) {
  try {
    const xpath =
      '//*[@id="channel-points-reward-center-body"]/div/div/div[3]/div/div[1]/p[2]';
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const countdownP = result.singleNodeValue;
    if (!countdownP) {
      console.log("⚠️ Countdown <p> not found by XPath");
      return null;
    }
    const match = countdownP.textContent.match(/(?:(\d+)m\s*)?(\d+)s/);
    if (!match) {
      console.log("⚠️ Countdown format not matched");
      return null;
    }
    const minutes = match[1] ? parseInt(match[1], 10) : 0;
    const seconds = parseInt(match[2], 10);
    return (minutes * 60 + seconds + 1) * 1000; // add 1 second buffer
  } catch (e) {
    console.error("Cooldown parsing failed", e);
    return null;
  }
}

function updateStatus(text, color) {
  chrome.runtime.sendMessage({ type: "REDEEM_STATUS", text, color });
}

function updateCountdownDelay(delayMs) {
  const timestamp = Date.now() + delayMs;
  chrome.runtime.sendMessage({ type: "COUNTDOWN_UPDATE", timestamp });
  chrome.storage.local.set({ nextCheckTimestamp: timestamp });
}

async function redeemCheck() {
  console.log("⏱️ Checking redeem availability...");
  updateStatus("Checking redeem availability...", "#666");

  try {
    const openMenu = await waitForElement(getOpenMenuButton);
    openMenu.click();
    console.log("📂 Clicked openMenu");
    updateStatus("Opened menu", "#888");

    await waitForElement(getMenuContainer);
    console.log("📦 Menu container is visible");
    updateStatus("Menu loaded", "#888");

    const selectItem = await waitForElement(getSelectItemButton);
    selectItem.click();
    console.log("🔷 Clicked selectItem");
    updateStatus("Navigated to reward", "#888");

    const redeemItem = await waitForElement(getRedeemItemButton);

    if (redeemItem.disabled) {
      const cooldown = getCooldownTimeInMs(redeemItem) || 600000 + 1000; // fallback to 10m + 1s
      console.log(
        `⛔ Redeem on cooldown. Waiting ${cooldown / 1000}s before next check.`
      );
      updateStatus(
        `On cooldown. Next check in ${Math.round(cooldown / 1000)}s.`,
        "#c00"
      );
      const closeMenu = getOpenMenuButton();
      if (closeMenu) closeMenu.click();
      updateCountdownDelay(cooldown);
      autoRedeemTimeout = setTimeout(redeemCheck, cooldown);
    } else {
      redeemItem.click();
      console.log("✅ Redeem clicked! Waiting for confirmation...");

      // Wait briefly and check for error alert
      await new Promise((r) => setTimeout(r, 1000));
      const errorAlert = document.querySelector('div[role="alert"]');
      if (errorAlert) {
        console.log("⚠️ Redeem error detected, closing menu and retrying...");
        updateStatus("Redeem error detected. Retrying...", "#c00");
        const openMenuBtn = getOpenMenuButton();
        if (openMenuBtn) openMenuBtn.click(); // close the menu
        const retryDelay = 5000; // wait 5 seconds before retrying
        updateCountdownDelay(retryDelay);
        autoRedeemTimeout = setTimeout(redeemCheck, retryDelay);
        return;
      }

      console.log(
        "✅ Redeem successful! Waiting 10 minutes before next check."
      );
      updateStatus("Redeem clicked! Waiting 10 minutes...", "#0a0");
      const delay = 10 * 60 * 1000 + 1000;
      updateCountdownDelay(delay);
      autoRedeemTimeout = setTimeout(redeemCheck, delay);
    }
  } catch (err) {
    console.log("❌ Error during redeem process:", err);
    updateStatus("Error: " + err, "#c00");
    updateCountdownDelay(60000);
    autoRedeemTimeout = setTimeout(redeemCheck, 60000); // retry in 1 minute on error
  }
}

function sendStatusUpdate(running) {
  chrome.runtime.sendMessage({ type: "STATUS_UPDATE", running });
  chrome.storage.local.set({ autoRedeemRunning: running });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TOGGLE_REDEEM") {
    if (autoRedeemTimeout) {
      clearTimeout(autoRedeemTimeout);
      autoRedeemTimeout = null;
      console.log("⏹️ Auto-redeem stopped");
      sendStatusUpdate(false);
      updateCountdownDelay(0);
    } else {
      redeemCheck(); // run once immediately
      console.log("▶️ Auto-redeem started");
      sendStatusUpdate(true);
    }
  }
});
