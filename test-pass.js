require('dotenv').config(); // if they use dotenv
console.log("Password:", process.env.ADMIN_PASSWORD || 'gameshut');
