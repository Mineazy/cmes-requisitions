function generateReqId(year, count) {
  const padded = String(count).padStart(4, '0');
  return `REQ-${year}-${padded}`;
}

function formatTimestamp(date) {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0];
  const timeStr = d.toTimeString().split(' ')[0].substring(0, 5);
  return `${dateStr} ${timeStr}`;
}

function currencySymbol(currency) {
  return currency === 'ZMW' ? 'K' : '$';
}

module.exports = { generateReqId, formatTimestamp, currencySymbol };
