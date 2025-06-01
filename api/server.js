require('dotenv').config();
const express = require("express");
const app = express();
const mysql = require('mysql2');
const apiKey = process.env.API_KEY;

const PORT = 4000;
app.set('view engine', 'ejs');

const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 10,
    port: process.env.DB_PORT,
});

connection.getConnection((err) => {
    if (err) return console.log(err.message);
    console.log(`connected to local mysql db using ${process.env} properties`);
});

app.use(express.urlencoded({ extended: true }));

// Retrieve individual messages for student
app.get('/indivmsg', async (req, res) => {

    const accessKey = req.headers.apikey;

    if (accessKey === apiKey) {
        const sID = req.query.student;

        let indivMsgsql = ` SELECT individual_messages.*, admins.email, admins.firstName, admins.lastName
        FROM individual_messages
        INNER JOIN admins
        ON individual_messages.admin_id = admins.admin_id
        WHERE individual_messages.student_id = ?
        ORDER BY individual_messages.date DESC;`;
        let [indivMessages] = await connection.promise().query(indivMsgsql, sID);

        res.json(indivMessages);
    } else {
        res.json({ message: "api key not valid" });
    }
});

// Retrieve group messages for modules student is enrolled in
app.get('/groupmsg', async (req, res) => {
    const accessKey = req.headers.apikey;

    if (accessKey === apiKey) {
        const sID = req.query.student;

        let groupMsgsql = `SELECT group_messages.*, modules.moduleTitle
                    FROM group_messages
                    INNER JOIN modules
                    ON group_messages.module_id = modules.module_id
                    INNER JOIN enrolments
                    ON modules.module_id = enrolments.module_id
                    WHERE enrolments.student_id = ?
                    ORDER BY group_messages.date DESC;`;
        let [groupMessages] = await connection.promise().query(groupMsgsql, [sID]);

        res.json(groupMessages);
    } else {
        res.json({ message: "api key not valid" });
    }
});

// Post to Advisor of Studies Postbox
app.post('/aosmsg', async (req, res) => {

    const accessKey = req.headers.apikey;

    if (accessKey === apiKey) {
        const sID = req.body.student;
        const message = req.body.message;

        const writesql = `INSERT INTO aos_messages (student_id, message)
        VALUES (?,?);`;

        await connection.promise().query(writesql, [sID, message]);
        res.status(200).json({
            success: true,
            message: 'Operation completed successfully'
        });
    } else {
        res.json({ message: "api key not valid" });
    }
});

// Remove a student
app.delete('/removestudent', async (req, res) => {

    const accessKey = req.headers.apikey;

    if (accessKey === apiKey) {
        const studentID = req.body.student;
        const deleted = "removed";

        let writesql = `UPDATE students
            SET lastName=?, firstName=?, statusStudy=?,
            entryLevel=?, primary_email=?, secondary_email=?,
            profile_image=?, students.password=?, sId=?,
            progression_success=?, progression_message=?
            WHERE sId=?;`;
        await connection.promise().query(writesql, [deleted, deleted, deleted, deleted,
            deleted, deleted, deleted, deleted, deleted, 0, deleted, studentID]);

        res.status(200).json({
            success: true,
            message: 'Operation completed successfully'
        });
    } else {
        res.json({ message: "api key not valid" });
    }
});

const server = app.listen(PORT, () => {
    console.log(`API started on port ${server.address().port}`);
});