const express = require('express');
const router = express.Router();
const connection = require("../connection.js");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const readline = require('readline');
const { getStudentGradeData, generateProgressionDecision } = require('../serverfuncs.js');
const apiKey = "123890API";

// used for uploading file (csv grades data)
const upload = multer({ dest: '../uploads/' });

// Admin Portal (dashboard)
router.get("/adminportal", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        const uId = req.session.authen;
        console.log(uId);
        let readsql = `SELECT * FROM admins WHERE admin_id=?`;

        connection.query(readsql, [uId], (err, admin) => {
            if (err) throw err;
            res.render('adminportal', { myData: admin });
        });
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Communication Page
router.get("/admincommunication", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        const uId = req.session.authen;

        let readsql = ` SELECT aos_messages.*, students.sID, students.firstName, students.lastName
        FROM aos_messages
        INNER JOIN students
        ON aos_messages.student_id = students.student_id
        ORDER BY aos_messages.date DESC;`;

        connection.query(readsql, (err, messages) => {
            if (err) throw err;
            res.render('admincommunication', { messagesData: messages });
        });

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Prog Reports Page
router.get("/adminprogreports", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {

        res.render('adminprogreports', { sId: "", data: "", prog: "", failed: "" });

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});
// Admin Calculate Avg Grade and Credits for Student and stats - Prog Reports Page
router.post("/adminprogstudent", async (req, res) => {
    if ((req.session.authen) && req.session.role === 'admin') {
        try {

            const sId = req.body.studentSearch;

            // get student_id, progression message from sId
            let readsql = `SELECT students.student_id, students.progression_success,
             students.progression_message FROM students WHERE students.sId = ?`;
            let [student] = await connection.promise().query(readsql, [sId]);

            let grades = await getStudentGradeData(student[0].student_id);
            let failed = await generateProgressionDecision(student[0].student_id);

            res.render('adminprogreports', { sId: sId, data: grades.data, prog: student[0], failed: failed.data.failedModules });

        } catch (err) {
            res.status(500).send('No student found with this ID. <a href="/adminprogreports">Back</a>');
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});
// Admin calculate progression decisions for all students POST
router.post("/genprogoutcomes", async (req, res) => {
    if ((req.session.authen) && req.session.role === 'admin') {
        try {
            // Get all student ids from database and generate decisions for each
            let readsql = `SELECT student_id FROM students;`
            let [students] = await connection.promise().query(readsql);

            students.forEach(async (student) => {
                let id = student.student_id;
                let result = await generateProgressionDecision(id);
                if (result.success) {
                    let writesql = `UPDATE students
                    SET progression_success = ?, 
                    progression_message = ?
                    WHERE student_id = ?;`;
                    await connection.promise().query(writesql, [result.data.successful, result.data.message, id]);
                } else {
                    console.log(`Error in writing prog decision for student ${id}`);
                }
            });

            res.render('success', { recip: "Progression outcomes calculated for all students" });
        } catch (err) {
            res.status(500).send('Error. Could not generate progression decisions. <a href="/adminprogreports">Back</a>');
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});
// Adjust prog results for single student POST
router.post("/adjustprogresult", async (req, res) => {
    if ((req.session.authen) && req.session.role === 'admin') {
        try {

            const student = { ...req.body };
            let writesql = `UPDATE students
            SET progression_success = ?, 
            progression_message = ?
            WHERE sId = ?;`;
            await connection.promise().query(writesql, [student.progSuccess, student.progMessage, student.studentID]);

            res.render('success', { recip: `Progression result adjusted for ${student.studentID}` });
        } catch (err) {
            res.status(500).send("An error occured while trying to adjust progression rules.");
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Progression Reports and Analytics Page
router.get("/adminanalytics", async (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        try {

            const readsql = `SELECT * FROM enrolments;`;
            const [enrolments] = await connection.promise().query(readsql);

            const total = enrolments.length;
            let examsPassed = 0;
            let examsFailed = 0;
            let examsResat = 0;

            enrolments.forEach((enrol) => {
                if (enrol.gradeResult === "pass") examsPassed++;
                if (enrol.gradeResult === "fail") examsFailed++;
                if (enrol.resitResult.length > 1) examsResat++;
            });

            res.render('adminanalytics', { total: total, passed: examsPassed, failed: examsFailed, resat: examsResat });
        } catch (err) {
            res.status(500).send("An error occured while retrieving progression statistics: " + err.message);
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Prog Management Page
router.get("/adminprogmgmt", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {

        res.render('adminprogmgmt');

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Prog Mgmt Post
router.post("/progrulesupdate", async (req, res) => {
    if ((req.session.authen) && req.session.role === 'admin') {
        try {

            const progData = { ...req.body };

            let readsql = `INSERT INTO progrules (subjCode, year_level, min_pass,
                        min_average, req_credits, req_modules)
                        VALUES (UPPER(?), ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                        min_pass = VALUES(min_pass),
                        min_average = VALUES(min_average),
                        req_credits = VALUES(req_credits),
                        req_modules = VALUES(req_modules);`;

            await connection.promise().query(readsql, [progData.subjectCode, progData.yearLevel, progData.minPass,
            progData.minAverage, progData.reqCredits, progData.reqModules]);
            res.render('success', {
                recip: `Progression rules set for 
                ${progData.subjectCode.toUpperCase()} pathway`
            });

        } catch (err) {
            res.status(500).send("An error occured while trying to define progression rules.");
        }

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Grade Management page from Dashboard
router.get("/admingrade", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        const uId = req.session.authen;

        const searchResults = []; // empty search array for grade page
        res.render('admingrade', { results: searchResults });

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Student Management page from Dashboard
router.get("/adminstudent", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        const uId = req.session.authen;

        const searchResults = []; // empty search array for module page
        res.render('adminstudent', { results: searchResults });

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Student Management search
router.post("/adminsearchstudent", async (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        try {

            const searchText = req.body.studentSearch;

            let readsql = `SELECT * FROM students
                        WHERE students.lastName = ?
                        OR students.firstName = ?
                        OR students.sId = ?;`;
            const [searchResults] = await connection.promise().query(readsql, [searchText, searchText, searchText]);

            res.render('adminstudent', { results: searchResults });

        } catch (err) {
            res.status(500).send("An error occured while trying to search.");
        }

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin - Create / update student
router.post("/createupdatestudent", async (req, res) => {
    if ((req.session.authen) && req.session.role === 'admin') {
        try {

            const studentData = { ...req.body };

            // Some validation before proceeding
            if (studentData.studentID.length !== 15) throw new Error("Student ID is not in the correct format");

            // Check if student already exists, and update if so
            let readsql = `SELECT * FROM students WHERE sId=?`;
            let [rows] = await connection.promise().query(readsql, studentData.studentID);
            if (rows.length > 0) {

                let writesql = `UPDATE students
                SET lastName =?, firstName =?, statusStudy =?,
                entryLevel =?, secondary_email=?,
                profile_image=?
                WHERE sId =?`;

                await connection.promise().query(writesql, [studentData.lastName, studentData.firstName, studentData.studyStatus, studentData.entryLevel,
                studentData.secondaryEmail, studentData.profileImage, studentData.studentID
                ]);
                res.render('success', { recip: "Student record updated for " + studentData.studentID });

            } else {
                // Create a new student as no record already exists

                // Create a primary email for student
                const randomNumber = Math.floor(Math.random() * 999) + 1;
                const primaryEmail = (studentData.firstName.charAt(0) + '.' + studentData.lastName + randomNumber + '@uniport.ie').toLowerCase();
                // Create a new password
                const randomPassword = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000;

                let writesql = `INSERT INTO students
                (sId, lastName, firstName, statusStudy, entryLevel, primary_email, secondary_email, profile_image, password)
                VALUES (?,?,?,?,?,?,?,?,?);`;
                await connection.promise().query(writesql, [studentData.studentID, studentData.lastName, studentData.firstName, studentData.studyStatus, studentData.entryLevel,
                    primaryEmail, studentData.secondaryEmail, studentData.profileImage, randomPassword]);
                res.render('success', { recip: `New student record created. Login with details: ${studentData.studentID} , password: ${randomPassword}` });

            }

        } catch (err) {
            res.status(500).send("An error occured while trying to create or update student record: " + err.message);
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin - Delete Student
router.post("/deletestudent", async (req, res) => {
    if ((req.session.authen) && req.session.role === 'admin') {
        try {
            const studentID = req.body.studentID;

            // Some validation before proceeding
            if (studentID.length !== 15) throw new Error("Student ID is not in the correct format");

            const config = {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'apikey': apiKey
                },
                data: { student: studentID }
            };

            const response = await axios.delete('http://localhost:4000/removestudent', config);
            const result = response.data;
            console.log(result);

            res.render('success', { recip: `Student records for ${studentID} removed` });

        } catch (err) {
            res.status(500).send("An error occured while trying to delete student record: "+err.message);
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Grade Management search
router.post("/adminsearchgrade", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {

        const searchText = req.body.moduleSearch;

        let readsql = `SELECT modules.moduleTitle, enrolments.*, students.sId, students.firstName, students.lastName
        FROM modules
        INNER JOIN enrolments
        ON modules.module_id = enrolments.module_id
        INNER JOIN students
        ON enrolments.student_id = students.student_id
        WHERE CONCAT(subjCode,subjCatalog) = ?
        ORDER BY acad_Yr DESC;`;

        connection.query(readsql, [searchText], (err, searchResults) => {
            if (err) throw err;
            res.render('admingrade', { results: searchResults });
        });

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Module Management page from Dashboard
router.get("/adminmodule", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        const uId = req.session.authen;

        const searchResults = []; // empty search array for module page
        res.render('adminmodule', { results: searchResults });

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin Module Management search
router.post("/adminsearchmodule", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {

        const searchText = req.body.moduleSearch;

        let readsql = `SELECT * FROM modules WHERE moduleTitle LIKE ?
                        OR CONCAT(subjCode,subjCatalog) = ?
                        OR subjCode = ?;`;
        const formattedSearch = `%${searchText}%`; // Add wildcards for the LIKE query with module name. This caused headaches

        connection.query(readsql, [formattedSearch, searchText, searchText], (err, searchResults) => {
            if (err) throw err;
            res.render('adminmodule', { results: searchResults });
        });

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Create Module information
router.post("/createupdatemodule", (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {

        const newModuleInfo = { ...req.body };

        // Set up variables for validation testing before committing to database
        let validated = true;
        let modSemester = "";
        let modCode = newModuleInfo.subjectCode.toUpperCase();
        let modCatalog = newModuleInfo.subjectCatalog;
        let modTitle = newModuleInfo.moduleTitle;
        let modCredits = parseInt(newModuleInfo.credits);
        // Check semester data:
        switch (newModuleInfo.semester) {
            case "spring":
                modSemester = "SPR";
                break;
            case "autumn":
                modSemester = "AUT";
                break;
            case "full":
                modSemester = "FYR";
                break;
            default:
                validated = false;
        }
        // Check title length, subject code length and catalog code length
        if (modTitle.length < 3 || modCode.length !== 4 || modCatalog.length !== 3) {
            validated = false;
        }

        // if data is validated, store to database
        if (validated) {
            let writesql = `INSERT INTO modules (subjCode, subjCatalog, moduleTitle, creditCount, semModule)
        VALUES (?,?,?,?,?);`;

            connection.query(writesql, [modCode, modCatalog, modTitle, modCredits, modSemester], (err, msg) => {
                if (err) res.send('Unexpected error - Module information given is invalid and could not be added to the database.');
                res.render('success', { recip: "New module information created" });
            });
        } else {
            res.send('Unexpected error - Module information given is invalid and could not be added to the database.');
        }

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Create / Update grade information
router.post("/createupdategrade", async (req, res) => {
    if ((req.session.authen) && req.session.role === 'admin') {

        const newGradeInfo = { ...req.body };

        let validated = true;
        const studentID = newGradeInfo.studentID;
        const acadYear = newGradeInfo.acadYear;
        const moduleCode = newGradeInfo.moduleCode;
        const firstGrade = newGradeInfo.firstGrade;
        const firstGradeResult = newGradeInfo.firstGradeResult;
        const resitGrade = newGradeInfo.resitGrade || ''; // sets value as blank if it's undefined
        const resitGradeResult = newGradeInfo.resitGradeResult;


        // validation before commiting to database
        if (studentID.length !== 15 || moduleCode.length !== 7 || firstGrade < 0 || firstGrade > 100) {
            validated = false;
        }

        if (validated) {

            // get info needed before adding to enrolments table
            const subjectCode = moduleCode.slice(0, 4);
            const subjectCatalog = moduleCode.slice(4, 7);

            // get relevant student_id and module_id needed for adding data to enrolments table
            let readsql = `SELECT students.student_id, modules.module_id
            FROM enrolments
            INNER JOIN modules
            ON enrolments.module_id = modules.module_id
            INNER JOIN students
            ON enrolments.student_id = students.student_id
            WHERE modules.subjCode = ? AND modules.subjCatalog =?
            AND students.sId = ?;`;

            let [rows] = await connection.promise().query(readsql, [subjectCode, subjectCatalog, studentID]);
            console.log(rows);
            const fkStudentID = rows[0].student_id;
            const fkModuleID = rows[0].module_id;

            // Create / update grades data (unique contraint in db of student_id,module_id,acadYr)
            let writesql = `INSERT INTO enrolments
            (module_id, student_id, acad_Yr, firstGrade, gradeResult, resitGrade, resitResult)
            VALUES (?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
            firstGrade=VALUES(firstGrade),
            gradeResult=VALUES(gradeResult),
            resitGrade=VALUES(resitGrade),
            resitResult=VALUES(resitResult);`;

            await connection.promise().query(writesql, [fkModuleID, fkStudentID, acadYear, firstGrade, firstGradeResult, resitGrade, resitGradeResult]);
            res.render('success', { recip: "New grade information created" });

        } else {
            res.send('Unexpected error - Grade information given is invalid and could not be added to the database.');
        }

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// CSV file for bulk updating grades
router.post("/admincsvgrade", upload.single('csvFile'), async (req, res) => {
    if ((req.session.authen) && req.session.role === 'admin') {

        const filePath = req.file.path;
        const moduleCode = req.body.moduleCode;
        let gradeData = [];
        let allGrades = [];

        // Check module code is valid and split for use later with query
        if (moduleCode.length !== 7) res.send('Unexpected error - Module code is invalid. Unable to add information to the database.');
        const subjectCode = moduleCode.slice(0, 4);
        const subjectCatalog = moduleCode.slice(4, 7);
        try {
            // Read file line by line and add to database
            const readStream = fs.createReadStream(filePath);
            const rl = readline.createInterface({ input: readStream });
            // each line
            rl.on('line', async (line) => {
                gradeData = (line.split(',')); // Splitting by comma
                let sId = gradeData[0] || '';
                let acadYr = gradeData[1] || '';
                let firstGrade = gradeData[2] || '';
                let firstGradeResult = gradeData[3] || '';
                let resitGrade = gradeData[4] || '';
                let resitGradeResult = gradeData[5] || '';

                // add to the full list for review later
                allGrades += gradeData + '\n';

                // Get student_id for use with insert query
                let readsql = `SELECT student_id FROM students WHERE sId = ?;`;
                let [rows] = await connection.promise().query(readsql, [sId]);
                let student_id = rows[0]?.student_id || ''; // checks if exists, otherwise makes blank
                // Get module_id for use with insert query
                readsql = `SELECT module_id FROM modules WHERE subjCode = ? AND subjCatalog = ?;`;
                [rows] = await connection.promise().query(readsql, [subjectCode, subjectCatalog]);
                let module_id = rows[0]?.module_id || '';

                // write entry to enrolments table
                let writesql = `INSERT INTO enrolments
            (module_id, student_id, acad_Yr, firstGrade, gradeResult, resitGrade, resitResult)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            firstGrade = VALUES(firstGrade),
            gradeResult = VALUES(gradeResult),
            resitGrade = VALUES(resitGrade),
            resitResult = VALUES(resitResult);`;

                try {
                    await connection.promise().query(writesql, [module_id, student_id, acadYr, firstGrade, firstGradeResult, resitGrade, resitGradeResult]);
                } catch (error) {
                    res.send('Error writing to database, no updates have been made.');
                }

            });
            rl.on('close', () => {
                console.log('Finished reading CSV file.');
                allGrades = allGrades.split('\n');
                res.render('admincsvsuccess', { results: allGrades });
            });
            rl.on('error', (error) => {
                res.send('An error occured while reading the CSV file. Ensure that it is formatted correctly');
            });
        } catch (error) {
            res.send('Error reading CSV file, ensure it is correctly formatted. <a href="/admingrade">Back</a>');
        }
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin individual message
router.post("/sendmessageindiv", async (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        const uId = req.session.authen; // admin_id
        const msgRecipient = req.body.studentID; // this is sId - must get student_id from this for write query
        const msgSubject = req.body.subject;
        const msgText = req.body.messageBody;

        // get student_id (used as foreign key in table) from student number (sId)
        let studIDsql = `SELECT student_id FROM students WHERE sId = ?;`;
        let [rows] = await connection.promise().query(studIDsql, [msgRecipient]);

        if (rows.length > 0) {
            let studentID = rows[0].student_id; // 'student_id' for use in query below

            let writesql = `INSERT INTO individual_messages (admin_id, student_id, subject, message)
            VALUES (?,?,?,?);`;

            await connection.promise().query(writesql, [uId, studentID, msgSubject, msgText]);
            res.render('success', { recip: "Message sent to student" });

        } else {
            res.send('Not a valid student ID. <a href="/admincommunication">Back</a>.');
        }

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Admin group message
router.post("/sendmessagegroup", async (req, res) => {

    if ((req.session.authen) && req.session.role === 'admin') {
        const uId = req.session.authen;

        const msgRecipient = req.body.moduleCode;
        const msgSubject = req.body.subject;
        const msgText = req.body.messageBody;

        // split module code text box into subject code and subject catalog
        const subjectCode = msgRecipient.slice(0, 4);
        const subjectCatalog = msgRecipient.slice(4);
        console.log("first: " + subjectCode + ", second: " + subjectCatalog);

        // get module_id (used as foreign key in table) from subject code and catalog
        let modIDsql = `SELECT module_id FROM modules WHERE subjCode = ? AND subjCatalog =?;`;
        let [rows] = await connection.promise().query(modIDsql, [subjectCode, subjectCatalog]);

        if (rows.length > 0) {
            let moduleID = rows[0].module_id; // 'module_id' for use in query below

            let writesql = `INSERT INTO group_messages (admin_id, module_id, subject, message)
            VALUES (?,?,?,?);`;

            await connection.promise().query(writesql, [uId, moduleID, msgSubject, msgText]);
            res.render('success', { recip: "Notification to module group sent" });

        } else {
            res.send('Not a valid module code. <a href="/admincommunication">Back</a>.');
        }

    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

module.exports = router;