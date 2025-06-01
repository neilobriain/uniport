// MAMP
const mysql = require('mysql2');

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'uniport',
    port: '8889',
    multipleStatements: true
});

db.getConnection((err) => {
    if (err) return console.log(err.message);
    console.log("connected successfully");
});

module.exports = db;