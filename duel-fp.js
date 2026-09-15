// duel-fp.js
//
// Steps performed by this script:
//
// 1. Open the Duels page.
// 2. Send buyFashionPoints 6 times (no dollar-based decision anymore).
// 3. Send getStatistics and read the base/practice numbers for
//    Elegance (style), Creativity (creativity), Confidence (devotion),
//    and Grace (beauty). Kindness and Loyalty are ignored.
// 4. Case 1: if ANY of those 4 numbers is < 200 -> STOP. Nothing else
//    is sent.
// 5. Case 2: if ALL 4 numbers are >= 200 -> pick the stat with the
//    LOWEST base/practice number (random tie-break if there's a tie),
//    then send trainStats for that stat 5 times in a row.
//
// Important:
// - buyFashionPoints always uses fpToBuy=2201.
// - buyFashionPoints goes to /ajax/train.php.
// - getStatistics goes to /ajax/main.php.
// - trainStats goes to /ajax/train.php, amount is always 2000.
// - Playwright's existing logged-in browser session is used.
//
// NOTE: Console logging has been trimmed. Instead of printing full
// response bodies (which can be large HTML/JSON blobs), we now print
// a short one-line summary (status + trimmed snippet) for each request.


const DUELS_URL = 'https://v3.g.ladypopular.com/duels.php';
const TRAIN_URL = 'https://v3.g.ladypopular.com/ajax/train.php';
const MAIN_URL = 'https://v3.g.ladypopular.com/ajax/main.php';

// Maps the internal payload key -> friendly display name.
const STAT_LABELS = {
  style: 'Elegance',
  creativity: 'Creativity',
  devotion: 'Confidence',
  beauty: 'Grace'
};

// The 4 stats we care about, in the order we want to check them.
const STAT_KEYS = ['style', 'creativity', 'devotion', 'beauty'];

// Max characters to show from any raw response snippet in logs.
const LOG_SNIPPET_LENGTH = 120;


// ------------------------------------------------------------
// Helper: shorten a string for logging purposes only.
// ------------------------------------------------------------

function trimForLog(text, maxLength = LOG_SNIPPET_LENGTH) {

  if (!text) {
    return '';
  }

  const singleLine = text.replace(/\s+/g, ' ').trim();

  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return `${singleLine.slice(0, maxLength)}… [${singleLine.length} chars total]`;
}


// ------------------------------------------------------------
// Helper: extract base/practice numbers from getStatistics HTML
// ------------------------------------------------------------
//
// The statsHtml returned by getStatistics repeats a template block
// per stat, each starting with `<li class="player-stat...`. Inside
// each block, the FIRST `<div class="value">NUMBER</div>` found
// after the stat's data-type marker is the base/practice number
// (e.g. 101, 101, 101, 100 in your example).
//
// We split on the `<li class="player-stat` marker and, for each
// resulting chunk, check whether it belongs to one of our 4 tracked
// stats (style / creativity / devotion / beauty), then pull that
// first "value" number out of it.

function extractBaseStatValues(statsHtml) {

  const result = {};

  const blocks = statsHtml.split('<li class="player-stat');

  for (const block of blocks) {

    const typeMatch = block.match(
      /data-type="(style|creativity|devotion|beauty)"\s+id="stat_/
    );

    if (!typeMatch) {
      continue;
    }

    const type = typeMatch[1];

    const valueMatch = block.match(
      /<div class="value">\s*([\d,]+)\s*<\/div>/
    );

    if (valueMatch) {
      result[type] = parseInt(valueMatch[1].replace(/,/g, ''), 10);
    }
  }

  return result;
}


// ------------------------------------------------------------
// Main function
// ------------------------------------------------------------

module.exports = async function runDuelFP(page) {

  console.log('');
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('⚔️ Starting Duel FP conversion/distribution...');
  console.log('────────────────────────────────────────────────────────────────────────────────');


  // ============================================================
  // STEP 1
  // Open the Duels page
  // ============================================================

  await page.goto(DUELS_URL, {
    waitUntil: 'domcontentloaded'
  });

  // Give the page a little time to finish populating its
  // dynamically loaded elements.
  await page.waitForTimeout(3000);


  // ============================================================
  // STEP 2
  // Send buyFashionPoints 6 times (unconditionally)
  // ============================================================

  let buySuccessCount = 0;
  let buyFailCount = 0;
  let buyFirstError = null;

  for (let i = 1; i <= 6; i++) {

    try {

      const response = await page.request.post(
        TRAIN_URL,
        {
          form: {
            type: 'buyFashionPoints',
            fpToBuy: '2201'
          },
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          }
        }
      );

      const responseText = await response.text();

      if (!response.ok()) {

        throw new Error(
          `HTTP ${response.status()} | ${trimForLog(responseText)}`
        );

      }

      const data = JSON.parse(responseText);

      if (data.status === 1) {

        buySuccessCount++;

      } else {

        buyFailCount++;
        if (!buyFirstError) buyFirstError = `status=${data.status}`;

      }

    } catch (error) {

      buyFailCount++;
      if (!buyFirstError) buyFirstError = trimForLog(error.message);

      // Stop here because the rest of the flow depends on the
      // conversion having actually happened.
      console.log(
        `💳 buyFashionPoints: ${buySuccessCount} success, ${buyFailCount} failed (stopped early — ${buyFirstError})`
      );
      throw error;
    }
  }

  console.log(
    `💳 buyFashionPoints: ${buySuccessCount} success, ${buyFailCount} failed` +
    (buyFirstError ? ` (first issue: ${buyFirstError})` : '')
  );


  // ============================================================
  // STEP 3
  // Send getStatistics and read the base/practice numbers
  // ============================================================

  let statValues = {};

  try {

    const response = await page.request.post(
      MAIN_URL,
      {
        form: {
          type: 'getStatistics'
        },
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );

    const responseText = await response.text();

    if (!response.ok()) {

      throw new Error(
        `HTTP ${response.status()} | ${trimForLog(responseText)}`
      );

    }

    const data = JSON.parse(responseText);

    if (data.status !== 1 || !data.statsHtml) {

      throw new Error(
        `unexpected data (status=${data.status})`
      );

    }

    statValues = extractBaseStatValues(data.statsHtml);

    const summary = STAT_KEYS
      .map((key) => `${STAT_LABELS[key]}=${statValues[key]}`)
      .join(', ');

    console.log(`🔎 Base/practice numbers: ${summary}`);

  } catch (error) {

    console.log(`❌ getStatistics failed: ${trimForLog(error.message)}`);
    console.log('🛑 Cannot evaluate stats. Stopping here.');
    console.log('────────────────────────────────────────────────────────────────────────────────');

    return;

  }


  // ============================================================
  // STEP 4
  // Decide: Case 1 (stop) vs Case 2 (train weakest stat)
  // ============================================================

  // If any of the 4 tracked values is missing or NaN, treat that
  // as "could not confirm >= 200" and stop, same as Case 1.
  const missingOrInvalid = STAT_KEYS.some(
    (key) => statValues[key] === undefined || isNaN(statValues[key])
  );

  if (missingOrInvalid) {

    console.log('⚠️ One or more stat values could not be read.');
    console.log('🛑 Case 1 (by default): stopping without further steps.');
    console.log('────────────────────────────────────────────────────────────────────────────────');

    return;

  }

  const belowThreshold = STAT_KEYS.filter(
    (key) => statValues[key] < 200
  );

  if (belowThreshold.length > 0) {

    console.log(
      `⚠️ Below 200: ${belowThreshold
        .map((key) => `${STAT_LABELS[key]}=${statValues[key]}`)
        .join(', ')}`
    );

    console.log('🛑 Case 1: stopping here without going forward with next steps.');
    console.log('────────────────────────────────────────────────────────────────────────────────');

    return;

  }

  console.log('✅ Case 2: all 4 stats are 200 or greater.');


  // ------------------------------------------------------------
  // Pick the stat with the lowest base/practice number.
  // Random tie-break if 2+ stats share the lowest value.
  // ------------------------------------------------------------

  const minValue = Math.min(
    ...STAT_KEYS.map((key) => statValues[key])
  );

  const lowestKeys = STAT_KEYS.filter(
    (key) => statValues[key] === minValue
  );

  const chosenKey =
    lowestKeys[Math.floor(Math.random() * lowestKeys.length)];

  if (lowestKeys.length > 1) {

    console.log(
      `🎲 Tie at ${minValue} between: ${lowestKeys
        .map((key) => STAT_LABELS[key])
        .join(', ')}. Picked: ${STAT_LABELS[chosenKey]}.`
    );

  } else {

    console.log(
      `🏆 Selected stat: ${STAT_LABELS[chosenKey]} (${minValue}).`
    );

  }


  // ============================================================
  // STEP 5
  // Send trainStats for the chosen stat, 5 times in a row
  // ============================================================

  console.log('');
  console.log(`🏋️ Step 5: Sending trainStats for ${STAT_LABELS[chosenKey]}...`);

  let trainSuccessCount = 0;
  let trainFailCount = 0;
  let trainFirstError = null;

  for (let i = 1; i <= 1; i++) {

    try {

      const response = await page.request.post(
        TRAIN_URL,
        {
          form: {
            type: 'trainStats',
            popularityType: chosenKey,
            practiceType: 'fp',
            amount: '2000'
          },
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          }
        }
      );

      const responseText = await response.text();

      if (!response.ok()) {

        throw new Error(
          `HTTP ${response.status()} | ${trimForLog(responseText)}`
        );

      }

      const data = JSON.parse(responseText);

      if (data.status === 1) {

        trainSuccessCount++;

      } else {

        trainFailCount++;
        if (!trainFirstError) trainFirstError = `status=${data.status}`;

      }

    } catch (error) {

      trainFailCount++;
      if (!trainFirstError) trainFirstError = trimForLog(error.message);

      // One failed rep shouldn't stop the remaining reps.
      continue;

    }

  }

  console.log(
    `🏋️ trainStats (${STAT_LABELS[chosenKey]}): ${trainSuccessCount} success, ${trainFailCount} failed` +
    (trainFirstError ? ` (first issue: ${trainFirstError})` : '')
  );


  // ============================================================
  // FINISHED
  // ============================================================

  console.log('');
  console.log('✅ Duel FP conversion/distribution completed.');
  console.log('────────────────────────────────────────────────────────────────────────────────');
};
