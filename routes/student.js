const express = require('express');
const router = express.Router();
const axios = require("axios");
const connection = require("../connection.js");
const { getAllModules, getStudentLevel, getStudentGradeData } = require('../serverfuncs.js');
const apiKey = "123890API";

// Student Portal (dashboard)
router.get("/studentportal", (req, res) => {

    if ((req.session.authen) && req.session.role === 'student') {
        const uId = req.session.authen;
        // console.log(uId);
        let readsql = `SELECT * FROM students WHERE student_id=?`;

        connection.query(readsql, [uId], (err, student) => {
            if (err) throw err;
            res.render('studentportal', { myData: student });
        });
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Student Edit Profile page
router.get("/studenteditprofile", (req, res) => {

    if ((req.session.authen) && req.session.role === 'student') {
        const uId = req.session.authen;

        let readsql = "SELECT * FROM students WHERE student_id=?";

        connection.query(readsql, [uId], (err, student) => {
            if (err) throw err;
            res.render('studenteditprofile', { myData: student });
        });

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Update student profile
router.post("/updatestudentprofile", async (req, res) => {
    if ((req.session.authen) && req.session.role === 'student') {
        const uId = req.session.authen;

        let newEmail = req.body.secondaryemail;
        let newProfileURL = req.body.profileurl;

        // Retrieve current values to use if user left blank on update
        let origDatasql = ` SELECT secondary_email, profile_image
                FROM students
                WHERE student_id = ?`;
        let [origData] = await connection.promise().query(origDatasql, [uId]);

        if (newEmail === "") newEmail = origData[0].secondary_email;
        if (newProfileURL === "") newProfileURL = origData[0].profile_image;

        let writesql = `UPDATE students
            SET secondary_email = ?,
         profile_image = ?
            WHERE student_id = ?;`;

        await connection.promise().query(writesql, [newEmail, newProfileURL, uId]);
        res.redirect('/studentpersonalprofile');

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }

});

// Student Personal Profile
router.get("/studentpersonalprofile", async (req, res) => {

    if ((req.session.authen) && req.session.role === 'student') {

        try {
            const uId = req.session.authen;

            let readsql = "SELECT * FROM students WHERE student_id=?";

            let studentLevel = await getStudentLevel(uId);
            let [student] = await connection.promise().query(readsql, [uId]);
            if (studentLevel.success) {
                res.render('studentpersonalprofile', { myData: student, level: studentLevel });
            } else {
                res.status(500).send("An error occured while retrieving student level information");
            }

        } catch (err) {
            res.status(500).send("An error occured while retrieving student information");
        }

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Student Communication
router.get("/studentcommunication", async (req, res) => {

    if ((req.session.authen) && req.session.role === 'student') {
        const uId = req.session.authen;
        try {

            const config = {
                params: { student: uId },
                headers: { 'apikey': apiKey }
            };
            const indivMessages = await axios.get('http://localhost:4000/indivmsg', config);
            const groupMessages = await axios.get('http://localhost:4000/groupmsg', config);

            res.render('studentcommunication', { indivData: indivMessages.data, groupData: groupMessages.data });


        } catch (err) {
            console.error('Error fetching data:', err);
            res.send('Error fetching data:' + err.message);
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Student Progression Page
router.get("/studentprogression", async (req, res) => {

    if ((req.session.authen) && req.session.role === 'student') {
        const uId = req.session.authen;

        let results = await getAllModules(uId);
        let grades = await getStudentGradeData(uId);
        let level = await getStudentLevel(uId);

        let sId = results.data[0].sId;
        let pathway = sId.slice(3, 7);

        // Get remaining info for stats
        let readsql = `SELECT progression_success, progression_message FROM students
                        WHERE student_id = ?;`;
        let [progInfo] = await connection.promise().query(readsql, uId);
        readsql = `SELECT * FROM progrules
                    WHERE subjCode = ? AND year_level = ?;`;
        let [pathwayRules] = await connection.promise().query(readsql, [pathway, level.data]);

        res.render('studentprogression', {
            modules: results.data, grades: grades.data,
            progInfo: progInfo[0], pathwayRules: pathwayRules[0]
        });
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// student message to AOS
router.post('/sendmessageaos', async (req, res) => {
    if ((req.session.authen) && req.session.role === 'student') {
        try {
            const uId = req.session.authen;
            const msgText = req.body.messageBody;


            const insertData = {
                student: uId,
                message: msgText
            };
            const config = {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'apikey': apiKey
                }
            };

            const response = await axios.post('http://localhost:4000/aosmsg', insertData, config);
            const result = response.data;
            console.log(result);

            res.render('success', { recip: "Message sent to AoS Postbox" });

        } catch (err) {
            res.send("Problem sending message to AoS: " + err.message);
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

module.exports = router;