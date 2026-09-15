module.exports = async function runTrainStats(page) {

  // ==============================================================
  // ⚙️ SETTINGS
  // ==============================================================

  // How many amount-rounds to run. Each round sends 4 requests
  // (style, creativity, devotion, beauty), so:
  //   numberOfRounds * 4 = total requests sent.
  const numberOfRounds = 201;

  const popularityTypes = [
    'style',
    'creativity',
    'devotion',
    'beauty'
  ];

  // Fashion-point amounts, in order. Once the list runs out,
  // the script keeps using 2000 for every remaining round.
  const amounts = [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    2, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46,
    49, 52, 55, 58, 61, 64, 67, 70, 73, 77, 81, 85, 89, 93, 97, 101, 105,
    109, 113, 117, 121, 125, 129, 134, 139, 144, 149, 155, 161, 167, 173, 179,
    187, 193, 199, 205, 211, 217, 223, 229, 236, 243, 250, 257, 264, 272, 280,
    288, 296, 304, 312, 321, 330, 339, 348, 357, 366, 375, 385, 395, 405, 415,
    425, 435, 445, 455, 465, 476, 487, 498, 509, 520, 532, 544, 556, 568, 581,
    594, 607, 620, 633, 646, 659, 672, 685, 698, 711, 724, 738, 752, 767, 782,
    797, 812, 827, 842, 858, 874, 890, 906, 922, 939, 956, 973, 990, 1007, 1024,
    1042, 1060, 1078, 1096, 1114, 1132, 1150, 1168, 1187, 1206, 1225, 1244, 1264,
    1284, 1304, 1324, 1346, 1368, 1390, 1412, 1434, 1456, 1478, 1500, 1522, 1544,
    1566, 1588, 1610, 1632, 1656, 1680, 1704, 1728, 1752, 1776, 1800, 1824, 1848,
    1874, 1900, 1926, 1952, 1978, 2000
  ];

  // Delay (ms) between each individual request, and between rounds.
  // Kept non-zero so requests don't fire in an obvious machine-gun burst.
  const delayBetweenRequests = 300;
  const delayBetweenRounds = 500;

  // ==============================================================
  // 📡 REQUEST FUNCTION
  // ==============================================================
  // Runs inside the page context (page.evaluate), same pattern as
  // your other sub-scripts (burn-energy.js, etc.), so cookies/session
  // are sent automatically via credentials: 'same-origin'.
  // ==============================================================

  async function sendTrainRequest(popularityType, amount) {

    return await page.evaluate(async ({ popularityType, amount }) => {

      const res = await fetch('/ajax/train.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin',
        body: new URLSearchParams({
          type: 'trainStats',
          popularityType: popularityType,
          practiceType: 'fp',
          amount: amount
        })
      });

      return await res.json();

    }, { popularityType, amount });
  }

  // ==============================================================
  // 🚀 MAIN LOOP
  // ==============================================================
  // No per-request logging anymore. We just tally counts as we go
  // and print one summary line at the very end.
  // ==============================================================

  let sentCount = 0;
  let successCount = 0;
  let failCount = 0;
  let firstError = null;
  let stoppedEarly = false;

  // Make sure we're actually on a page that can reach the endpoint
  // (mirrors how burn-energy.js navigates before firing requests).
  try {
    await page.goto('https://v3.g.ladypopular.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  } catch (err) {
    console.log(`⚠️ Could not navigate before training: ${err.message}`);
  }

  outerLoop:
  for (let round = 0; round < numberOfRounds; round++) {

    const amount = amounts[round] ?? 2000;

    for (const popularityType of popularityTypes) {

      sentCount++;

      try {

        const result = await sendTrainRequest(popularityType, amount);

        if (result.status === 1) {

          successCount++;

        } else {

          failCount++;
          if (!firstError) firstError = `status=${result.status} (round ${round + 1}, ${popularityType}, amount=${amount})`;
          stoppedEarly = true;
          break outerLoop;

        }

      } catch (error) {

        failCount++;
        if (!firstError) firstError = `${error.message} (round ${round + 1}, ${popularityType}, amount=${amount})`;
        stoppedEarly = true;
        break outerLoop;

      }

      await page.waitForTimeout(delayBetweenRequests);
    }

    await page.waitForTimeout(delayBetweenRounds);
  }

  console.log(
    `🏋️ Train Stats: sent ${sentCount}, success ${successCount}, failed ${failCount}` +
    (stoppedEarly ? ` (stopped early — ${firstError})` : '')
  );
};
