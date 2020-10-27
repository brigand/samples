const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const log = (...args) => console.log(`[worker]`, ...args);

exports.run = async (word) => {
  const delayMs = Math.floor(Math.random() * 100) + 10;
  // const delayMs = 0;

  if (delayMs) {
    log(`Delaying for ${delayMs}ms on word "${word}"`);
    await delay(delayMs);
  }

  return word.toUpperCase();
};