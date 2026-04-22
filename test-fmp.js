require('dotenv').config();
const symbol = 'AAPL';
const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${process.env.FMP_API_KEY}`;
console.log('Fetching', url);
fetch(url).then(r => r.json()).then(console.log).catch(console.error);
