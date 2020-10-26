const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

exports.run = async (word) => {
  // await delay(Math.floor(Math.random() * 100) + 10);

  return word.toUpperCase();
};