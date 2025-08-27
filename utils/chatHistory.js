const MAX_MESSAGES = 20;
const histories = new Map();

function getHistory(userId) {
  return histories.get(userId) || [];
}

function addMessage(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  if (history.length > MAX_MESSAGES) {
    history.shift();
  }
  histories.set(userId, history);
}

function clearHistory(userId) {
  histories.delete(userId);
}

module.exports = {
  getHistory,
  addMessage,
  clearHistory
};
