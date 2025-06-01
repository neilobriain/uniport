// Functions contained here are for use server-side to help with progression management.

const connection = require("./connection.js");

const passCapped = 40;

/*
 Retrieves all the modules a student is enrolled in and is used as the basis
 for completing the other functions below. 
*/
async function getAllModules(studentID) {
    try {
        let readsql = `SELECT modules.*, enrolments.*, students.sId
                    FROM modules
                    INNER JOIN enrolments
                    ON modules.module_id = enrolments.module_id
                    INNER JOIN students
                    ON enrolments.student_id = students.student_id
                    WHERE students.student_id = ?
                    ORDER BY enrolments.acad_Yr DESC;`;
        let [rows] = await connection.promise().query(readsql, studentID);
        return { success: true, data: rows };
    } catch (err) {
        return { success: false, data: err.message };
    }
}

async function getStudentLevel(studentID) {
    try {
        let modules = await getAllModules(studentID);
        if (modules.success) {

            let moduleLevel = 0;
            let highestLevel = 0;
            let studentLevel = 0;

            // Go through each module to get the highest level module
            modules.data.forEach(module => {
                moduleLevel = module.subjCatalog;
                if (moduleLevel > highestLevel) highestLevel = moduleLevel; // update highest level
            });

            // set level based off highest level module
            if (highestLevel >= 200) {
                studentLevel = 2;
            } else if (highestLevel >= 100 && highestLevel <= 199) {
                studentLevel = 1;
            }

            return { success: true, data: studentLevel };
        } else {
            return { success: false, data: "Error when getStudentLevel tried getAllModules function" };
        }
    } catch (err) {
        return { success: false, data: err.message };
    }
}

// Returns average grade and total credits for a student for the specified level
async function getStudentGradeData(studentID) {
    try {
        let modules = await getAllModules(studentID);
        let level = await getStudentLevel(studentID);
        if ((modules.success) && (level.success)) {

            // set range for considering subjCatalog in calculations for correct level
            let levelLower = 0;
            let levelHigher = 0;
            if (level.data === 1) {
                levelLower = 100;
                levelHigher = 199
            } else if (level.data === 2) {
                levelLower = 200;
                levelHigher = 299;
            }

            // Go through modules, consider relevant ones, calculate avgGrade and total credits
            let totalCredits = 0;
            let totalModules = 0;
            let totalGrades = 0;
            let avgGrade = 0;

            modules.data.forEach((module) => {

                // Only consider modules in current level
                if (module.subjCatalog >= levelLower && module.subjCatalog <= levelHigher) {
                    totalModules++;
                    totalCredits += module.creditCount;

                    /* count correct grade - first one if passed,
                       resit if pass (excused on first),
                       or capped at 40 if either is pass capped.
                       Otherwise, add failed grade result */
                    if (module.gradeResult === "pass capped" || module.resitResult === "pass capped") {
                        totalGrades += passCapped;
                    } else if (module.gradeResult === "pass") {
                        totalGrades += module.firstGrade;
                    } else if (module.resitResult === "pass") {
                        totalGrades += module.resitGrade;
                    } else {
                            totalGrades += module.firstGrade;
                    }
                }
            });

            avgGrade = Math.round(totalGrades / totalModules);

            return { success: true, data: { avgGrade: avgGrade, totalCredits: totalCredits } };
        } else {
            return { success: false, data: "Error with getStudentGrade function - could not retrieve modules and/or student level" };
        }
    } catch (err) {
        return { success: false, data: err.message };
    }
}

async function generateProgressionDecision(studentID) {
    try {
        let modules = await getAllModules(studentID);
        let level = await getStudentLevel(studentID);
        let gradeData = await getStudentGradeData(studentID);

        let sId = modules.data[0].sId;
        let pathway = sId.slice(3, 7);

        // Get progression rules for student's pathway from database
        let readsql = `SELECT * FROM progrules
        WHERE subjCode = ?
        AND year_level = ?;`;
        let [progRules] = await connection.promise().query(readsql, [pathway, level.data]);

        // Check if avg grade and credit count passes prog rules
        let avgGrade = (gradeData.data.avgGrade >= progRules[0].min_average);
        let reqCredits = (gradeData.data.totalCredits >= progRules[0].req_credits);

        // Check all modules are passed and note ones that are not
        let failedModules = [];
        modules.data.forEach((module) => {
            if (module.gradeResult === "fail" || module.gradeResult === "absent") {
                // push module title and result of resit
                failedModules.push(module.moduleTitle, module.subjCatalog, module.resitResult);
            }
        });
        // Check failed modules, and if resits also failed - important for passing level 2
        let passedAllModules = true;
        if (failedModules.includes("fail") || failedModules.includes("absent")) {
            passedAllModules = false;
        }

        // Check compulsory modules have been passed
        let passedCompulsory = true;
        let compulsoryModules = progRules[0].req_modules.split(",");
        // if array contains some compulsory modules, go through and check results
        if (compulsoryModules[0].length > 0) {
            compulsoryModules.forEach((mod) => {
                let code = Number(mod.slice(4, 7)); // get subjCatalog equivalent
                if (failedModules.includes(code)) passedCompulsory = false;
            });
        }

        // Check all requirements are fulfilled and create progress decision and message
        let progressMessage = "";
        let successful = false;
        if (level.data === 1) {
            if ((avgGrade) && (reqCredits) && (passedCompulsory)) {
                progressMessage = "Progress to Year 2";
                successful = true;
            } else if ((avgGrade) && (reqCredits)) {
                progressMessage = "All compulsory modules must be passed before progression"
            } else {
                progressMessage = "Progress requirements not met. Contact Advisor of Studies"
            }
        }
        if (level.data === 2) {
            if ((avgGrade) && (reqCredits) && (passedCompulsory) && (passedAllModules)) {
                progressMessage = "Progress to Final Year";
                successful = true;
            } else if ((avgGrade) && (reqCredits) && (passedCompulsory)) {
                progressMessage = "All Year 1 modules must be passed before progression to Final Year";
            } else if ((avgGrade) && (reqCredits)) {
                progressMessage = "All compulsory modules must be passed before progression"
            } else {
                progressMessage = "Progress requirements not met. Contact Advisor of Studies"
            }
        }

        return { success: true, data: { successful: successful, message: progressMessage, failedModules: failedModules } };
    } catch (err) {
        console.log(err.message);
        return { success: false, data: `Error - Student ID = ${studentID} : ${err.message}` };
    }
}

module.exports = { getAllModules, getStudentLevel, getStudentGradeData, generateProgressionDecision };